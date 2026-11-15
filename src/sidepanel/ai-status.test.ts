import { describe, expect, it } from "vitest";
import { aiBadge } from "./ai-status";

describe("aiBadge", () => {
  it("shows a ready model as ready", () => {
    expect(aiBadge({ kind: "available" })).toMatchObject({ tone: "ready", text: "AI ready" });
  });

  it("shows the download progress as a whole percentage", () => {
    expect(aiBadge({ kind: "downloading", progress: 0.426 }).text).toBe("Downloading AI 42%");
  });

  it("shows a download of unknown progress without a percentage", () => {
    expect(aiBadge({ kind: "downloading", progress: null }).text).toBe("Downloading AI");
  });

  it("gives the reason the model is not available", () => {
    expect(aiBadge({ kind: "unavailable", reason: "the model is unavailable" })).toEqual({
      tone: "unavailable",
      text: "AI not available",
      detail: "the model is unavailable",
    });
  });

  it("gives the reason a download could not start", () => {
    expect(aiBadge({ kind: "downloadable", error: "NotAllowedError: x" }).detail).toContain(
      "NotAllowedError: x",
    );
  });
});
