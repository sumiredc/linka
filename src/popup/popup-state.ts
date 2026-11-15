// ツールバーの吹き出し（PRD UC1）の状態。記憶そのものは offscreen document で進み、吹き出しは見せるだけ
import type { ReadTabFailureReason } from "../content/read-tab";
import type {
  ClipEvent,
  ClipProgress,
  ClippedPage,
  ClipResult,
  ClipStage,
  ClipSummary,
  ClipTarget,
} from "../shared/clip-status";
import { aiUnavailableText, failureText } from "../shared/clip-text";
import type { DbResponse } from "../shared/messages";
import type { ModelStatus } from "../shared/model-status";

/** 吹き出しを開いたタブのページ。`url` は Page の URL（正規化したもの） */
export type PopupPage = { url: string; sample: boolean; model: ModelStatus };

export type PopupView =
  /** 進行中の記憶・記憶済みか・モデルの状態を尋ねている */
  | { kind: "checking" }
  /** 本文を読み、記憶を頼んでいる。この状態に入るたびに 1 回だけ頼む */
  | { kind: "starting" }
  | { kind: "clipping"; stage: ClipStage }
  | { kind: "done"; summary: ClipSummary }
  /** 記憶を始めたが、失敗した */
  | { kind: "failed"; reason: string }
  | { kind: "alreadyClipped"; clippedAt: string | null }
  /** 記憶を始められない */
  | { kind: "cannotClip"; reason: string }
  /** 別のページを記憶している。`finished` はそれが終わったか */
  | { kind: "busy"; clipping: ClipTarget; finished: boolean }
  /** モデルのダウンロードが終わるまで記憶を受け付けない */
  | { kind: "waitingForModel"; model: ModelStatus };

export type PopupState = { page: PopupPage | null; view: PopupView };

export type PopupAction =
  | {
      type: "checked";
      page: PopupPage;
      current: ClipProgress | null;
      clipped: ClippedPage | null;
    }
  /** タブが読めない、offscreen document に届かないなど */
  | { type: "blocked"; reason: string }
  | { type: "model"; status: ModelStatus }
  /** 記憶の依頼への返事 */
  | { type: "answered"; response: DbResponse<ClipResult> }
  | { type: "event"; event: ClipEvent }
  | { type: "clipAgain" }
  | { type: "checkAgain" };

export const initialPopupState: PopupState = { page: null, view: { kind: "checking" } };

/** 記憶を始めてよいか。同梱サンプルは Gemini Nano を使わない */
function startView(page: PopupPage): PopupView {
  if (page.sample) return { kind: "starting" };
  switch (page.model.kind) {
    case "available":
      return { kind: "starting" };
    case "unavailable":
      return { kind: "cannotClip", reason: aiUnavailableText(page.model.reason) };
    default:
      return { kind: "waitingForModel", model: page.model };
  }
}

function resultView(result: ClipResult): PopupView {
  return result.ok
    ? { kind: "done", summary: result.summary }
    : { kind: "failed", reason: failureText(result.error) };
}

const isClipping = (view: PopupView) => view.kind === "starting" || view.kind === "clipping";

function onEvent(state: PopupState, event: ClipEvent): PopupState {
  const { page, view } = state;
  const target = event.kind === "progress" ? event.progress.target : event.target;
  if (view.kind === "busy") {
    if (event.kind !== "finished" || target.url !== view.clipping.url) return state;
    return { ...state, view: { ...view, finished: true } };
  }
  if (page === null || target.url !== page.url || !isClipping(view)) return state;
  return {
    ...state,
    view:
      event.kind === "progress"
        ? { kind: "clipping", stage: event.progress.stage }
        : resultView(event.result),
  };
}

function onAnswer(state: PopupState, response: DbResponse<ClipResult>): PopupState {
  // 終わりの通知が先に届いていれば、そちらで表示済み
  if (!isClipping(state.view)) return state;
  if (!response.ok) {
    return {
      ...state,
      view: {
        kind: "failed",
        reason: `Linka could not reach its graph: ${response.error.message}`,
      },
    };
  }
  const result = response.value;
  if (!result.ok && result.error.kind === "alreadyClipping") {
    // ほかの画面が先に同じページの記憶を始めていた。その進み具合が通知で届く
    return state.view.kind === "clipping"
      ? state
      : { ...state, view: { kind: "clipping", stage: { kind: "preparing" } } };
  }
  if (!result.ok && result.error.kind === "busy") {
    return { ...state, view: { kind: "busy", clipping: result.error.clipping, finished: false } };
  }
  return { ...state, view: resultView(result) };
}

export function popupReducer(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case "checked": {
      const { page, current, clipped } = action;
      if (current !== null) {
        return {
          page,
          view:
            current.target.url === page.url
              ? { kind: "clipping", stage: current.stage }
              : { kind: "busy", clipping: current.target, finished: false },
        };
      }
      if (clipped !== null)
        return { page, view: { kind: "alreadyClipped", clippedAt: clipped.clippedAt } };
      return { page, view: startView(page) };
    }
    case "blocked":
      return { ...state, view: { kind: "cannotClip", reason: action.reason } };
    case "model": {
      if (state.page === null) return state;
      const page = { ...state.page, model: action.status };
      return { page, view: state.view.kind === "waitingForModel" ? startView(page) : state.view };
    }
    case "answered":
      return onAnswer(state, action.response);
    case "event":
      return onEvent(state, action.event);
    case "clipAgain":
      if (state.page === null || state.view.kind !== "alreadyClipped") return state;
      return { ...state, view: startView(state.page) };
    case "checkAgain":
      if (state.view.kind !== "busy") return state;
      return { ...state, view: { kind: "checking" } };
  }
}

export type StepState = "done" | "now" | "todo";

/** 進み具合の一覧。同梱サンプルは抽出せず、事前抽出データを読む */
export function progressSteps(
  stage: ClipStage,
  sample: boolean,
): { label: string; state: StepState }[] {
  const order: ClipStage["kind"][] = sample
    ? ["preparing", "writing"]
    : ["preparing", "extracting", "writing"];
  const labels: Record<ClipStage["kind"], string> = {
    preparing: sample ? "Load the bundled sample data" : "Read the page",
    extracting:
      stage.kind === "extracting" && stage.parts > 1
        ? `Extract concepts and claims (part ${stage.part} of ${stage.parts})`
        : "Extract concepts and claims",
    writing: "Save to the graph",
  };
  const now = order.indexOf(stage.kind);
  return order.map((kind, index) => ({
    label: labels[kind],
    state: index < now ? "done" : index === now ? "now" : "todo",
  }));
}

/** タブを読めなかった理由 */
export function readFailureText(reason: ReadTabFailureReason, message?: string): string {
  switch (reason) {
    case "restricted":
      return "Chrome does not let extensions read this page, such as chrome:// pages and other extensions' pages.";
    case "web-store":
      return "Chrome does not let extensions read the Chrome Web Store.";
    case "file-access":
      return "To clip a local file, turn on “Allow access to file URLs” for Linka in chrome://extensions.";
    case "no-text":
      return "This page has no text to clip.";
    case "failed":
      return `Linka could not read this page${message ? `: ${message}` : "."}`;
  }
}
