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
export type PopupPage = { url: string };

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
  /** モデルの状態がまだ分からない、またはダウンロードが終わるまで記憶を受け付けない */
  | { kind: "waitingForModel" };

/** 確かめている間に終わった記憶。`current` の返事が、終わる前の古いものでありうるため */
export type FinishedClip = Extract<ClipEvent, { kind: "finished" }>;

export type PopupState = {
  page: PopupPage | null;
  view: PopupView;
  /** Gemini Nano の状態。吹き出しが読むまで null */
  model: ModelStatus | null;
  finishedWhileChecking: FinishedClip[];
};

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

export const initialPopupState: PopupState = {
  page: null,
  view: { kind: "checking" },
  model: null,
  finishedWhileChecking: [],
};

/** 記憶を始めてよいか。Gemini Nano が使えるときだけ始める */
function startView(model: ModelStatus | null): PopupView {
  switch (model?.kind) {
    case "available":
      return { kind: "starting" };
    case "unavailable":
      return { kind: "cannotClip", reason: aiUnavailableText(model.reason) };
    default:
      return { kind: "waitingForModel" };
  }
}

/**
 * 吹き出しからモデルのダウンロードを始める（または進んでいるダウンロードの終わりを待つ）か。
 * 利用者の操作の中でないと始められないことがあるので、offscreen document には頼まない。
 * ほかが始めたダウンロードも待つので、進み具合の通知が来なくても終わった状態を受け取れる
 */
export function shouldDownloadInPopup(status: ModelStatus): boolean {
  return status.kind === "downloadable" || status.kind === "downloading";
}

function resultView(result: ClipResult): PopupView {
  return result.ok
    ? { kind: "done", summary: result.summary }
    : { kind: "failed", reason: failureText(result.error) };
}

const isClipping = (view: PopupView) => view.kind === "starting" || view.kind === "clipping";

function onEvent(state: PopupState, event: ClipEvent): PopupState {
  const { page, view } = state;
  if (view.kind === "checking") {
    if (event.kind !== "finished") return state;
    return { ...state, finishedWhileChecking: [...state.finishedWhileChecking, event] };
  }
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

function onChecked(
  state: PopupState,
  { page, current, clipped }: Extract<PopupAction, { type: "checked" }>,
): PopupState {
  const next = { ...state, page, finishedWhileChecking: [] };
  if (current !== null) {
    const finished = state.finishedWhileChecking
      .filter((event) => event.target.url === current.target.url)
      .at(-1);
    if (current.target.url === page.url) {
      return {
        ...next,
        view: finished ? resultView(finished.result) : { kind: "clipping", stage: current.stage },
      };
    }
    return {
      ...next,
      view: { kind: "busy", clipping: current.target, finished: finished !== undefined },
    };
  }
  if (clipped !== null) {
    return { ...next, view: { kind: "alreadyClipped", clippedAt: clipped.clippedAt } };
  }
  return { ...next, view: startView(state.model) };
}

export function popupReducer(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case "checked":
      return state.view.kind === "checking" ? onChecked(state, action) : state;
    case "blocked":
      return { ...state, view: { kind: "cannotClip", reason: action.reason } };
    case "model": {
      const model = action.status;
      if (state.page === null || state.view.kind !== "waitingForModel") return { ...state, model };
      return { ...state, model, view: startView(model) };
    }
    case "answered":
      return onAnswer(state, action.response);
    case "event":
      return onEvent(state, action.event);
    case "clipAgain":
      if (state.page === null || state.view.kind !== "alreadyClipped") return state;
      return { ...state, view: startView(state.model) };
    case "checkAgain":
      if (state.view.kind !== "busy") return state;
      return { ...state, view: { kind: "checking" }, finishedWhileChecking: [] };
  }
}

export type StepState = "done" | "now" | "todo";

/** 進み具合の一覧 */
export function progressSteps(stage: ClipStage): { label: string; state: StepState }[] {
  const order: ClipStage["kind"][] = ["preparing", "extracting", "writing", "connecting"];
  const labels: Record<ClipStage["kind"], string> = {
    preparing: "Read the page",
    extracting:
      stage.kind === "extracting" && stage.parts > 1
        ? `Extract concepts and claims (part ${stage.part} of ${stage.parts})`
        : "Extract concepts and claims",
    writing: "Save to the graph",
    connecting:
      stage.kind === "connecting"
        ? `Find connections to other pages (${stage.pair} of ${stage.pairs})`
        : "Find connections to other pages",
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
