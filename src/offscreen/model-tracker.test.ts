import { describe, expect, it } from "vitest";
import type { ModelStatus } from "../shared/model-status";
import type {
  DownloadMonitor,
  LanguageModelSession,
  LanguageModelStatic,
} from "../shared/prompt-api";
import { ModelTracker } from "./model-tracker";

/** create が resolve を呼ぶまで終わらない偽の Prompt API。progress は monitor へ手で流す */
function controllableApi(initial: string) {
  let state = initial;
  let creates = 0;
  let progress: (loaded: number) => void = () => {};
  let finish: () => void = () => {};
  const session: LanguageModelSession = {
    prompt: async () => "",
    clone: async () => session,
    destroy: () => {},
  };
  const api: LanguageModelStatic = {
    availability: async () => state,
    create: (options?: unknown) => {
      creates++;
      const { monitor } = options as { monitor: (m: DownloadMonitor) => void };
      monitor({
        addEventListener: (_type, listener) => {
          progress = (loaded) => listener({ loaded });
        },
      });
      return new Promise((resolve) => {
        finish = () => {
          state = "available";
          resolve(session);
        };
      });
    },
  };
  return {
    api,
    creates: () => creates,
    progress: (loaded: number) => progress(loaded),
    finish: () => finish(),
  };
}

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function setup(initial: string) {
  const fake = controllableApi(initial);
  const changes: ModelStatus[] = [];
  const tracker = new ModelTracker({ api: () => fake.api, onChange: (s) => changes.push(s) });
  return { fake, changes, tracker };
}

describe("ModelTracker", () => {
  it("answers a download request at once and notifies the progress until the model is available", async () => {
    const { fake, changes, tracker } = setup("downloadable");
    expect(await tracker.download()).toEqual({ kind: "downloading", progress: 0 });
    await flush();
    fake.progress(0.4);
    fake.finish();
    await flush();
    expect(changes).toEqual([
      { kind: "downloadable", error: null },
      { kind: "downloading", progress: 0 },
      { kind: "downloading", progress: 0.4 },
      { kind: "available" },
    ]);
  });

  it("starts only one download however many times it is asked", async () => {
    const { fake, tracker } = setup("downloadable");
    await Promise.all([tracker.download(), tracker.download()]);
    await tracker.download();
    await flush();
    expect(fake.creates()).toBe(1);
  });

  it("reports the known progress instead of re-reading availability during its download", async () => {
    const { fake, tracker } = setup("downloadable");
    await tracker.download();
    await flush();
    fake.progress(0.7);
    expect(await tracker.status()).toEqual({ kind: "downloading", progress: 0.7 });
  });

  it("does not download when the model is already available", async () => {
    const { fake, tracker } = setup("available");
    expect(await tracker.download()).toEqual({ kind: "available" });
    expect(fake.creates()).toBe(0);
  });

  it("does not notify again when the status has not changed", async () => {
    const { changes, tracker } = setup("unavailable");
    await tracker.status();
    await tracker.status();
    expect(changes).toHaveLength(1);
  });
});
