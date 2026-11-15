import { describe, expect, it } from "vitest";
import type { ClipSummary, NewConnection } from "./clip-status";
import { connectionsText, connectionText, countsText, failureText, stageText } from "./clip-text";

const summary: ClipSummary = {
  url: "https://example.com/a",
  title: "A",
  concepts: 3,
  newConcepts: 1,
  claims: 1,
  newPage: true,
  connections: { kind: "judged", links: [] },
};

const link: NewConnection = {
  solution: {
    id: "s",
    statement: "Use a worker.",
    pageUrl: "https://example.com/a",
    pageTitle: "A",
  },
  concern: {
    id: "c",
    statement: "The main thread blocks.",
    pageUrl: "https://example.com/b",
    pageTitle: "Page B",
  },
};

describe("clip text", () => {
  it("counts concepts, the new ones among them, and claims", () => {
    expect(countsText(summary)).toBe("3 concepts (1 new), 1 claim");
  });

  it("says no connections were found when the judgement linked nothing", () => {
    expect(connectionsText(summary)).toBe("No connections found to other pages.");
  });

  it("counts the new connections", () => {
    expect(connectionsText({ ...summary, connections: { kind: "judged", links: [link] } })).toBe(
      "New connections: 1",
    );
  });

  it("says why connections were not checked and that the clip is kept", () => {
    const text = connectionsText({
      ...summary,
      connections: { kind: "notJudged", reason: "pair 1 of 2: Error: no answer within 30 s" },
    });
    expect(text).toContain("not checked (pair 1 of 2: Error: no answer within 30 s)");
    expect(text).toContain("The clip itself is saved.");
  });

  it("says some connections may have been saved when they could not be confirmed", () => {
    const text = connectionsText({
      ...summary,
      connections: { kind: "unconfirmed", reason: "could not read" },
    });
    expect(text).toContain("may have been saved");
    expect(text).toContain("(could not read)");
    expect(text).not.toContain("not checked");
  });

  it("names the other page of a new connection", () => {
    expect(connectionText(link, "https://example.com/a")).toBe(
      "“Use a worker.” addresses “The main thread blocks.” (Page B)",
    );
    expect(connectionText(link, "https://example.com/b")).toBe(
      "“Use a worker.” addresses “The main thread blocks.” (A)",
    );
  });

  it("counts the pairs while checking connections", () => {
    expect(stageText({ kind: "connecting", pair: 2, pairs: 5 })).toBe(
      "Checking connections to other pages, 2 of 5…",
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
