import {
  type Dispatch,
  type ReactNode,
  type RefObject,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { readTab } from "../content/read-tab";
import { unreadableUrlReason } from "../content/unreadable-url";
import { askClip, onClipEvent } from "../shared/clip";
import { type ClipBody, pageUrlOf } from "../shared/clip-status";
import { connectionsText, countsText, stageText } from "../shared/clip-text";
import type { RuntimeMessage } from "../shared/messages";
import { onModelStatus } from "../shared/model";
import { downloadModel, type ModelStatus, readModelStatus } from "../shared/model-status";
import { languageModel } from "../shared/prompt-api";
import { samplePageOf } from "../shared/sample-page";
import { LinkaMark } from "../sidepanel/LinkaMark";
import styles from "./Popup.module.css";
import {
  initialPopupState,
  type PopupAction,
  type PopupState,
  popupReducer,
  progressSteps,
  readFailureText,
  shouldDownloadInPopup,
} from "./popup-state";

type ActiveTab = { id: number; url: string; title: string };

const EXTENSION_ROOT = chrome.runtime.getURL("");

function unreachable(message: string): PopupAction {
  return { type: "blocked", reason: `Linka could not reach its graph: ${message}` };
}

/** 開いたときと、別の記憶が終わって押し直されたときに、このページを記憶できるかを確かめる */
async function check(tabRef: RefObject<ActiveTab | null>, dispatch: Dispatch<PopupAction>) {
  if (tabRef.current === null) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined && tab.url) {
      tabRef.current = { id: tab.id, url: tab.url, title: tab.title || tab.url };
    }
  }
  const tab = tabRef.current;
  if (tab === null) {
    dispatch({ type: "blocked", reason: "Linka cannot see the page in this tab." });
    return;
  }
  const sample = samplePageOf(tab.url, EXTENSION_ROOT) !== null;
  const unreadable = sample ? null : unreadableUrlReason(tab.url, true);
  const pageUrl = pageUrlOf(tab.url, EXTENSION_ROOT);
  if (unreadable !== null || pageUrl === null) {
    dispatch({ type: "blocked", reason: readFailureText(unreadable ?? "restricted") });
    return;
  }

  const [current, clipped] = await Promise.all([
    askClip({ kind: "current" }),
    askClip({ kind: "isClipped", tabUrl: tab.url }),
  ]);
  if (!current.ok) return dispatch(unreachable(current.error.message));
  if (!clipped.ok) return dispatch(unreachable(clipped.error.message));
  dispatch({
    type: "checked",
    page: { url: pageUrl, sample },
    current: current.value,
    clipped: clipped.value,
  });
}

/**
 * モデルの状態を読み、入っていなければ吹き出しから直接ダウンロードする（PRD §13：吹き出しを開いた処理から）。
 * offscreen document が持つ状態は通らないので、進み具合はサイドパネルにも直接知らせる
 */
async function prepareModel(dispatch: Dispatch<PopupAction>) {
  const api = languageModel();
  const status = await readModelStatus(api);
  dispatch({ type: "model", status });
  if (!shouldDownloadInPopup(status)) return;
  const report = (next: ModelStatus) => {
    dispatch({ type: "model", status: next });
    const message: RuntimeMessage = { target: "ui", type: "model", status: next };
    chrome.runtime.sendMessage(message).catch(() => {});
  };
  report(await downloadModel(api, report));
}

/** 本文を読み（同梱サンプルなら読まず）、offscreen document に記憶を頼む。吹き出しを閉じても記憶は続く */
async function start(tab: ActiveTab, dispatch: Dispatch<PopupAction>) {
  const sample = samplePageOf(tab.url, EXTENSION_ROOT);
  let body: ClipBody;
  let title = tab.title;
  if (sample) {
    body = { kind: "sample", page: sample };
  } else {
    const read = await readTab(tab.id);
    if (!read.ok) {
      dispatch({ type: "blocked", reason: readFailureText(read.reason, read.message) });
      return;
    }
    body = { kind: "text", text: read.page.text };
    title = read.page.title || title;
  }
  const response = await askClip({ kind: "clip", tabUrl: tab.url, title, body });
  dispatch({ type: "answered", response });
}

function openSidePanel(tabId: number) {
  // 利用者の操作の中で呼ぶ必要があるので、await を挟まずに呼ぶ
  chrome.sidePanel.open({ tabId }).then(
    () => window.close(),
    () => {},
  );
}

function clippedAtText(clippedAt: string | null): string {
  if (clippedAt === null) return "Linka already has this page in the graph.";
  const date = new Date(clippedAt);
  return Number.isNaN(date.getTime())
    ? "Linka already has this page in the graph."
    : `Clipped on ${date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.`;
}

function modelText(model: ModelStatus): string {
  switch (model.kind) {
    case "downloading":
      return model.progress === null
        ? "Downloading Gemini Nano…"
        : `Downloading Gemini Nano: ${Math.floor(model.progress * 100)}%`;
    case "downloadable":
      return model.error
        ? `The download of Gemini Nano could not start: ${model.error}`
        : "Starting the download of Gemini Nano…";
    default:
      return "";
  }
}

function Actions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

function CloseButton() {
  return (
    <button type="button" className={styles.buttonQuiet} onClick={() => window.close()}>
      Close
    </button>
  );
}

function SidePanelButton({ tabId }: { tabId: number | undefined }) {
  if (tabId === undefined) return null;
  return (
    <button type="button" className={styles.buttonPrimary} onClick={() => openSidePanel(tabId)}>
      Open side panel
    </button>
  );
}

function Body({
  state,
  tab,
  dispatch,
}: {
  state: PopupState;
  tab: ActiveTab | null;
  dispatch: Dispatch<PopupAction>;
}) {
  const { view, page } = state;
  switch (view.kind) {
    case "checking":
      return <p className={styles.muted}>Checking this page…</p>;
    case "starting":
    case "clipping": {
      const stage = view.kind === "clipping" ? view.stage : { kind: "preparing" as const };
      return (
        <>
          <h1 className={styles.title}>Clipping this page…</h1>
          <ul className={styles.progress} aria-label={stageText(stage)}>
            {progressSteps(stage, page?.sample ?? false).map((step) => (
              <li key={step.label} data-state={step.state}>
                {step.label}
              </li>
            ))}
          </ul>
          <p className={styles.hint}>You can close this popup. Clipping continues.</p>
        </>
      );
    }
    case "done": {
      const connections = connectionsText(view.summary);
      return (
        <>
          <h1 className={styles.title}>{view.summary.newPage ? "Clipped" : "Clipped again"}</h1>
          <p className={styles.text}>
            “{view.summary.title}”: {countsText(view.summary)}
          </p>
          {connections && <p className={styles.text}>{connections}</p>}
          <Actions>
            <CloseButton />
            <SidePanelButton tabId={tab?.id} />
          </Actions>
        </>
      );
    }
    case "failed":
      return (
        <>
          <h1 className={styles.title}>Could not clip this page</h1>
          <p className={`${styles.notice} ${styles.bad}`}>{view.reason}</p>
          <Actions>
            <CloseButton />
          </Actions>
        </>
      );
    case "alreadyClipped":
      return (
        <>
          <h1 className={styles.title}>Already clipped</h1>
          <p className={styles.text}>{clippedAtText(view.clippedAt)}</p>
          <Actions>
            <button
              type="button"
              className={styles.buttonQuiet}
              onClick={() => dispatch({ type: "clipAgain" })}
            >
              Clip again
            </button>
            <SidePanelButton tabId={tab?.id} />
          </Actions>
        </>
      );
    case "cannotClip":
      return (
        <>
          <h1 className={styles.title}>This page cannot be clipped</h1>
          <p className={styles.text}>{view.reason}</p>
        </>
      );
    case "busy":
      return (
        <>
          <h1 className={styles.title}>Another page is being clipped</h1>
          <p className={styles.text}>Linka is clipping “{view.clipping.title}”.</p>
          {view.finished ? (
            <>
              <p className={styles.hint}>It has finished.</p>
              <Actions>
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  onClick={() => dispatch({ type: "checkAgain" })}
                >
                  Clip this page
                </button>
              </Actions>
            </>
          ) : (
            <p className={styles.hint}>
              Click the Linka icon again when it finishes to clip this page.
            </p>
          )}
        </>
      );
    case "waitingForModel": {
      const { model } = state;
      if (model === null) return <p className={styles.muted}>Checking the on-device AI…</p>;
      const progress = model.kind === "downloading" ? model.progress : null;
      return (
        <>
          <h1 className={styles.title}>Downloading the on-device AI</h1>
          <p className={styles.text}>{modelText(model)}</p>
          {model.kind === "downloading" && (
            <progress className={styles.bar} max={1} value={progress ?? undefined} />
          )}
          <p className={styles.hint}>
            Pages can be clipped when the download finishes. Keep this popup open to clip this page
            then, or click the Linka icon again later.
          </p>
        </>
      );
    }
  }
}

export function Popup() {
  const [state, dispatch] = useReducer(popupReducer, initialPopupState);
  const tab = useRef<ActiveTab | null>(null);
  const { view } = state;

  useEffect(() => {
    const stopClip = onClipEvent((event) => dispatch({ type: "event", event }));
    const stopModel = onModelStatus((status) => dispatch({ type: "model", status }));
    prepareModel(dispatch).catch((error: unknown) =>
      dispatch({
        type: "model",
        status: {
          kind: "unavailable",
          reason: error instanceof Error ? error.message : String(error),
        },
      }),
    );
    return () => {
      stopClip();
      stopModel();
    };
  }, []);

  // view はその状態に入ったときだけ作り直されるので、入るたびに 1 回だけ動く
  useEffect(() => {
    if (view.kind === "checking") {
      check(tab, dispatch).catch((error: unknown) =>
        dispatch({
          type: "blocked",
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    if (view.kind === "starting" && tab.current !== null) {
      start(tab.current, dispatch).catch((error: unknown) =>
        dispatch({
          type: "answered",
          response: {
            ok: false,
            error: {
              kind: "exception",
              message: error instanceof Error ? error.message : String(error),
            },
          },
        }),
      );
    }
  }, [view]);

  return (
    <main className={styles.popup} aria-live="polite">
      <div className={styles.brand}>
        <LinkaMark size={18} />
        Linka
      </div>
      <Body state={state} tab={tab.current} dispatch={dispatch} />
    </main>
  );
}
