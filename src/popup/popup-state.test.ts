import { describe, expect, it } from "vitest";
import type { ClipResult, ClipSummary, ClipTarget } from "../shared/clip-status";
import { failure } from "../shared/messages";
import type { ModelStatus } from "../shared/model-status";
import {
  initialPopupState,
  type PopupAction,
  type PopupPage,
  type PopupState,
  type PopupView,
  popupReducer,
  progressSteps,
  readFailureText,
  shouldDownloadInPopup,
} from "./popup-state";

const PAGE_URL = "https://example.com/a";
const page: PopupPage = { url: PAGE_URL, sample: false };
const thisPage: ClipTarget = { url: PAGE_URL, tabUrl: PAGE_URL, title: "Page A" };
const otherPage: ClipTarget = {
  url: "https://example.com/b",
  tabUrl: "https://example.com/b",
  title: "Page B",
};
const summary: ClipSummary = {
  url: PAGE_URL,
  title: "Page A",
  concepts: 3,
  newConcepts: 1,
  claims: 4,
  newPage: true,
  connections: { kind: "judged", links: [] },
};
const succeeded: ClipResult = { ok: true, summary };

function run(...actions: (PopupAction | PopupAction[])[]): PopupState {
  return actions.flat().reduce(popupReducer, initialPopupState);
}

/** モデルの状態を読んでから（既定は使える）、ページを確かめ終える */
function checked(
  over: Partial<Extract<PopupAction, { type: "checked" }>> & { model?: ModelStatus } = {},
): PopupAction[] {
  const { model = { kind: "available" }, ...rest } = over;
  return [
    { type: "model", status: model },
    { type: "checked", page, current: null, clipped: null, ...rest },
  ];
}

const at = (state: PopupState): PopupView => state.view;

describe("popupReducer: opening the popup", () => {
  it("starts clipping a page that is not clipped yet", () => {
    expect(at(run(checked()))).toEqual({ kind: "starting" });
  });

  it("starts clipping a sample page even when Gemini Nano is not available", () => {
    const state = run(
      checked({ page: { ...page, sample: true }, model: { kind: "unavailable", reason: "r" } }),
    );
    expect(at(state)).toEqual({ kind: "starting" });
  });

  it("offers to clip again on a page that is already clipped", () => {
    const state = run(checked({ clipped: { url: PAGE_URL, clippedAt: "2026-11-15T00:00:00Z" } }));
    expect(at(state)).toEqual({ kind: "alreadyClipped", clippedAt: "2026-11-15T00:00:00Z" });
  });

  it("shows the progress of a clip of this page that is already running", () => {
    const state = run(checked({ current: { target: thisPage, stage: { kind: "writing" } } }));
    expect(at(state)).toEqual({ kind: "clipping", stage: { kind: "writing" } });
  });

  it("shows which other page is being clipped instead of starting", () => {
    const state = run(checked({ current: { target: otherPage, stage: { kind: "preparing" } } }));
    expect(at(state)).toEqual({ kind: "busy", clipping: otherPage, finished: false });
  });

  it("gives the reason when Gemini Nano is not available on a page that is not a sample", () => {
    const view = at(run(checked({ model: { kind: "unavailable", reason: "no GPU" } })));
    expect(view.kind).toBe("cannotClip");
    expect(view.kind === "cannotClip" && view.reason).toContain("no GPU");
  });

  it("waits for the model while it downloads", () => {
    const state = run(checked({ model: { kind: "downloading", progress: 0.4 } }));
    expect(at(state)).toEqual({ kind: "waitingForModel" });
    expect(state.model).toEqual({ kind: "downloading", progress: 0.4 });
  });

  it("waits for the model when it is not downloaded yet", () => {
    const model: ModelStatus = { kind: "downloadable", error: "NotAllowedError: x" };
    expect(at(run(checked({ model })))).toEqual({ kind: "waitingForModel" });
  });

  it("waits when the page is checked before the model status is read", () => {
    const state = run({ type: "checked", page, current: null, clipped: null });
    expect(at(state)).toEqual({ kind: "waitingForModel" });
    expect(at(popupReducer(state, { type: "model", status: { kind: "available" } }))).toEqual({
      kind: "starting",
    });
  });

  it("uses the result of a clip of this page that finished while checking", () => {
    const state = run(
      { type: "model", status: { kind: "available" } },
      { type: "event", event: { kind: "finished", target: thisPage, result: succeeded } },
      {
        type: "checked",
        page,
        current: { target: thisPage, stage: { kind: "writing" } },
        clipped: null,
      },
    );
    expect(at(state)).toEqual({ kind: "done", summary });
  });

  it("notes that the other clip finished while checking", () => {
    const state = run(
      { type: "event", event: { kind: "finished", target: otherPage, result: succeeded } },
      checked({ current: { target: otherPage, stage: { kind: "writing" } } }),
    );
    expect(at(state)).toEqual({ kind: "busy", clipping: otherPage, finished: true });
  });

  it("ignores a check that arrives after the popup left checking", () => {
    const state = run(checked(), checked({ clipped: { url: PAGE_URL, clippedAt: null } }));
    expect(at(state)).toEqual({ kind: "starting" });
  });

  it("gives the reason when the page cannot be read", () => {
    expect(at(run({ type: "blocked", reason: "no text" }))).toEqual({
      kind: "cannotClip",
      reason: "no text",
    });
  });
});

describe("popupReducer: model download", () => {
  const downloading = checked({ model: { kind: "downloading", progress: 0.1 } });

  it("follows the download progress", () => {
    const state = run(downloading, {
      type: "model",
      status: { kind: "downloading", progress: 0.7 },
    });
    expect(at(state)).toEqual({ kind: "waitingForModel" });
    expect(state.model).toEqual({ kind: "downloading", progress: 0.7 });
  });

  it("starts clipping when the download finishes", () => {
    expect(at(run(downloading, { type: "model", status: { kind: "available" } }))).toEqual({
      kind: "starting",
    });
  });

  it("does not start a clip that was not waiting for the model", () => {
    const state = run(checked({ clipped: { url: PAGE_URL, clippedAt: null } }), {
      type: "model",
      status: { kind: "available" },
    });
    expect(at(state).kind).toBe("alreadyClipped");
  });
});

describe("popupReducer: clipping", () => {
  it("shows each stage of the clip of this page", () => {
    const state = run(checked(), {
      type: "event",
      event: {
        kind: "progress",
        progress: { target: thisPage, stage: { kind: "extracting", part: 2, parts: 3 } },
      },
    });
    expect(at(state)).toEqual({
      kind: "clipping",
      stage: { kind: "extracting", part: 2, parts: 3 },
    });
  });

  it("ignores the progress of another page", () => {
    const state = run(checked(), {
      type: "event",
      event: { kind: "progress", progress: { target: otherPage, stage: { kind: "writing" } } },
    });
    expect(at(state)).toEqual({ kind: "starting" });
  });

  it("shows the counts when the clip finishes", () => {
    const state = run(checked(), {
      type: "event",
      event: { kind: "finished", target: thisPage, result: succeeded },
    });
    expect(at(state)).toEqual({ kind: "done", summary });
  });

  it("shows the counts from the answer to the clip request", () => {
    expect(
      at(run(checked(), { type: "answered", response: { ok: true, value: succeeded } })),
    ).toEqual({ kind: "done", summary });
  });

  it("keeps the result when the answer comes after the finished event", () => {
    const state = run(
      checked(),
      { type: "event", event: { kind: "finished", target: thisPage, result: succeeded } },
      {
        type: "answered",
        response: failure("unreachable", "the message port closed"),
      },
    );
    expect(at(state)).toEqual({ kind: "done", summary });
  });

  it("gives the reason when the clip fails", () => {
    const view = at(
      run(checked(), {
        type: "answered",
        response: { ok: true, value: { ok: false, error: { kind: "noText", message: "" } } },
      }),
    );
    expect(view).toEqual({ kind: "failed", reason: "This page has no text to clip." });
  });

  it("shows which other page is being clipped when the request was turned down as busy", () => {
    const state = run(checked(), {
      type: "answered",
      response: {
        ok: true,
        value: { ok: false, error: { kind: "busy", message: "", clipping: otherPage } },
      },
    });
    expect(at(state)).toEqual({ kind: "busy", clipping: otherPage, finished: false });
  });

  it("follows a clip of this page that another view started first", () => {
    const state = run(checked(), {
      type: "answered",
      response: { ok: true, value: { ok: false, error: { kind: "alreadyClipping", message: "" } } },
    });
    expect(at(state)).toEqual({ kind: "clipping", stage: { kind: "preparing" } });
  });

  it("ignores a second Clip again", () => {
    const once = run(checked({ clipped: { url: PAGE_URL, clippedAt: null } }), {
      type: "clipAgain",
    });
    expect(popupReducer(once, { type: "clipAgain" })).toBe(once);
  });

  it("ignores a late progress event after the clip is done", () => {
    const done = run(checked(), {
      type: "event",
      event: { kind: "finished", target: thisPage, result: succeeded },
    });
    const late = popupReducer(done, {
      type: "event",
      event: { kind: "progress", progress: { target: thisPage, stage: { kind: "writing" } } },
    });
    expect(at(late)).toEqual({ kind: "done", summary });
  });

  it("starts again on an already clipped page when asked", () => {
    const state = run(checked({ clipped: { url: PAGE_URL, clippedAt: null } }), {
      type: "clipAgain",
    });
    expect(at(state)).toEqual({ kind: "starting" });
  });

  it("does not clip again on an already clipped page while the model downloads", () => {
    const state = run(
      checked({
        clipped: { url: PAGE_URL, clippedAt: null },
        model: { kind: "downloading", progress: 0 },
      }),
      { type: "clipAgain" },
    );
    expect(at(state).kind).toBe("waitingForModel");
  });
});

describe("popupReducer: another clip in progress", () => {
  const busy = checked({ current: { target: otherPage, stage: { kind: "preparing" } } });

  it("notes when the other clip finishes", () => {
    const state = run(busy, {
      type: "event",
      event: { kind: "finished", target: otherPage, result: succeeded },
    });
    expect(at(state)).toEqual({ kind: "busy", clipping: otherPage, finished: true });
  });

  it("checks this page again when asked after the other clip", () => {
    expect(at(run(busy, { type: "checkAgain" }))).toEqual({ kind: "checking" });
  });

  it("does not check again outside the busy view", () => {
    const done = run(checked(), {
      type: "event",
      event: { kind: "finished", target: thisPage, result: succeeded },
    });
    expect(popupReducer(done, { type: "checkAgain" })).toBe(done);
  });

  it("does not take the other page's result as this page's", () => {
    const state = run(busy, {
      type: "event",
      event: { kind: "finished", target: thisPage, result: succeeded },
    });
    expect(at(state)).toEqual({ kind: "busy", clipping: otherPage, finished: false });
  });
});

describe("progressSteps", () => {
  it("marks the steps before the current one as done", () => {
    expect(progressSteps({ kind: "extracting", part: 1, parts: 2 }, false)).toEqual([
      { label: "Read the page", state: "done" },
      { label: "Extract concepts and claims (part 1 of 2)", state: "now" },
      { label: "Save to the graph", state: "todo" },
      { label: "Find connections to other pages", state: "todo" },
    ]);
  });

  it("counts the pairs while finding connections after saving", () => {
    expect(progressSteps({ kind: "connecting", pair: 2, pairs: 5 }, false)).toEqual([
      { label: "Read the page", state: "done" },
      { label: "Extract concepts and claims", state: "done" },
      { label: "Save to the graph", state: "done" },
      { label: "Find connections to other pages (2 of 5)", state: "now" },
    ]);
  });

  it("skips extraction for a sample page", () => {
    expect(progressSteps({ kind: "writing" }, true)).toEqual([
      { label: "Load the bundled sample data", state: "done" },
      { label: "Save to the graph", state: "now" },
    ]);
  });
});

describe("readFailureText", () => {
  it("tells how to allow local files", () => {
    expect(readFailureText("file-access")).toContain("Allow access to file URLs");
  });

  it("passes on why the page could not be read", () => {
    expect(readFailureText("failed", "Frame was removed")).toBe(
      "Linka could not read this page: Frame was removed",
    );
  });
});

describe("shouldDownloadInPopup", () => {
  it("downloads a model that is not downloaded yet", () => {
    expect(shouldDownloadInPopup({ kind: "downloadable", error: null })).toBe(true);
  });

  it("waits for a download that is already running, so the popup sees it finish", () => {
    expect(shouldDownloadInPopup({ kind: "downloading", progress: null })).toBe(true);
  });

  it("does nothing when the model is ready or cannot run", () => {
    expect(shouldDownloadInPopup({ kind: "available" })).toBe(false);
    expect(shouldDownloadInPopup({ kind: "unavailable", reason: "r" })).toBe(false);
  });
});
