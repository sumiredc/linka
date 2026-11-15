import { describe, expect, it } from "vitest";
import { downloadModel, type ModelStatus, readModelStatus } from "./model-status";
import type { DownloadMonitor, LanguageModelStatic } from "./prompt-api";

/** availability を順に返し、create では monitor に progress を流す偽の Prompt API */
function fakeApi(options: {
  availability: string[];
  progress?: number[];
  createError?: Error;
}): LanguageModelStatic & { destroyed: number } {
  const states = [...options.availability];
  const api = {
    destroyed: 0,
    availability: async () => (states.length > 1 ? states.shift() : states[0]) ?? "unavailable",
    create: async (createOptions?: unknown) => {
      const { monitor } = createOptions as { monitor?: (m: DownloadMonitor) => void };
      const listeners: ((event: { loaded: number }) => void)[] = [];
      monitor?.({ addEventListener: (_type, listener) => listeners.push(listener) });
      for (const loaded of options.progress ?? []) for (const l of listeners) l({ loaded });
      if (options.createError) throw options.createError;
      return {
        prompt: async () => "",
        clone: async () => {
          throw new Error("unused");
        },
        destroy: () => {
          api.destroyed++;
        },
      };
    },
  };
  return api;
}

describe("readModelStatus", () => {
  it.each([
    ["available", { kind: "available" }],
    ["downloadable", { kind: "downloadable", error: null }],
    ["downloading", { kind: "downloading", progress: null }],
  ] as const)("maps availability %s to its status", async (availability, status) => {
    expect(await readModelStatus(fakeApi({ availability: [availability] }))).toEqual(status);
  });

  it("reports unavailable with a reason when the model is unavailable", async () => {
    expect(await readModelStatus(fakeApi({ availability: ["unavailable"] }))).toMatchObject({
      kind: "unavailable",
      reason: expect.any(String),
    });
  });

  it("reports unavailable when the browser has no Prompt API", async () => {
    expect(await readModelStatus(null)).toMatchObject({ kind: "unavailable" });
  });

  it("reports unavailable when availability throws", async () => {
    const api: LanguageModelStatic = {
      availability: async () => {
        throw new Error("boom");
      },
      create: async () => {
        throw new Error("unused");
      },
    };
    expect(await readModelStatus(api)).toEqual({ kind: "unavailable", reason: "Error: boom" });
  });
});

describe("downloadModel", () => {
  it("reports the download progress and ends available", async () => {
    const api = fakeApi({ availability: ["downloadable", "available"], progress: [0.5, 1] });
    const seen: ModelStatus[] = [];
    const final = await downloadModel(api, (status) => seen.push(status));
    expect(seen).toEqual([
      { kind: "downloading", progress: 0 },
      { kind: "downloading", progress: 0.5 },
      { kind: "downloading", progress: 1 },
    ]);
    expect(final).toEqual({ kind: "available" });
    expect(api.destroyed).toBe(1);
  });

  it("does not create a session when the model is already available", async () => {
    const api = fakeApi({ availability: ["available"] });
    expect(await downloadModel(api)).toEqual({ kind: "available" });
    expect(api.destroyed).toBe(0);
  });

  it("does not try to download an unavailable model", async () => {
    const seen: ModelStatus[] = [];
    const final = await downloadModel(fakeApi({ availability: ["unavailable"] }), (s) =>
      seen.push(s),
    );
    expect(final).toMatchObject({ kind: "unavailable" });
    expect(seen).toEqual([]);
  });

  it("stays downloadable with the reason when the download could not start", async () => {
    const api = fakeApi({
      availability: ["downloadable"],
      createError: new Error("needs a user gesture"),
    });
    expect(await downloadModel(api)).toEqual({
      kind: "downloadable",
      error: "Error: needs a user gesture",
    });
  });
});
