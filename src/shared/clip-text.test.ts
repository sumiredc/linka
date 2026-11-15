import { describe, expect, it } from "vitest";
import type { ClipSummary } from "./clip-status";
import { connectionsText, countsText, failureText, stageText } from "./clip-text";

const summary: ClipSummary = {
  url: "https://example.com/a",
  title: "A",
  concepts: 3,
  newConcepts: 1,
  claims: 1,
  newPage: true,
  connections: null,
};

describe("clip text", () => {
  it("counts concepts, the new ones among them, and claims", () => {
    expect(countsText(summary)).toBe("3 concepts (1 new), 1 claim");
  });

  it("says nothing about connections when they were not looked for", () => {
    expect(connectionsText(summary)).toBeNull();
  });

  it("counts the new connections when they were looked for", () => {
    expect(connectionsText({ ...summary, connections: 2 })).toBe(
      "2 new connections to other pages.",
    );
    expect(connectionsText({ ...summary, connections: 0 })).toBe(
      "No new connections to other pages.",
    );
  });

  it("gives the part being extracted only when the page was split", () => {
    expect(stageText({ kind: "extracting", part: 2, parts: 3 })).toBe(
      "Extracting concepts and claims, part 2 of 3…",
    );
    expect(stageText({ kind: "extracting", part: 1, parts: 1 })).toBe(
      "Extracting concepts and claims…",
    );
  });

  it("names the page being clipped when another clip is running", () => {
    expect(
      failureText({
        kind: "busy",
        message: "",
        clipping: { url: "u", tabUrl: "u", title: "Page B" },
      }),
    ).toBe("Linka is clipping “Page B”. Try again when it finishes.");
  });

  it("says whether a failed write was put back", () => {
    expect(failureText({ kind: "write", message: "x", restored: true })).toContain("put back");
    expect(failureText({ kind: "write", message: "x", restored: false })).toContain(
      "before the next clip",
    );
  });
});
