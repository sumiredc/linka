import { describe, expect, it } from "vitest";
import { type AskResult, KIND_SPECS, QUERY_KINDS } from "../shared/graph-question";
import {
  answerCells,
  answerHighlight,
  isOpenableUrl,
  questionGuide,
  unanswerableText,
} from "./answer-view";

describe("answerCells", () => {
  it("shows only the visible columns, linking the page to its URL", () => {
    expect(
      answerCells("concernsAbout", {
        concern: "Quota is small.",
        page: "Storage",
        url: "https://web.dev/storage",
        claimId: "c1",
      }),
    ).toEqual([
      { column: "concern", text: "Quota is small.", href: null },
      { column: "page", text: "Storage", href: "https://web.dev/storage" },
    ]);
  });

  it("does not link a page whose URL cannot be opened safely", () => {
    const [cell] = answerCells("pagesMentioning", { page: "x", url: "javascript:alert(1)" });
    expect(cell).toEqual({ column: "page", text: "x", href: null });
  });

  it("writes numbers as text", () => {
    expect(answerCells("claimCountsByType", { type: "fact", claims: 18 })).toEqual([
      { column: "type", text: "fact", href: null },
      { column: "claims", text: "18", href: null },
    ]);
  });
});

describe("isOpenableUrl", () => {
  it.each([
    ["https://example.com/", true],
    ["http://example.com/", true],
    ["chrome-extension://abc/samples/a.html", true],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isOpenableUrl(url)).toBe(expected);
  });
});

describe("answerHighlight", () => {
  it("lights nothing for claim counts", () => {
    const highlight = answerHighlight({ kind: "claimCountsByType" }, [{ type: "fact", claims: 3 }]);
    expect(highlight.nodes.size + highlight.links.size).toBe(0);
  });

  it("lights the target concept and each page that mentions it", () => {
    const highlight = answerHighlight(
      { kind: "pagesMentioning", concept: { key: "opfs", name: "OPFS" } },
      [{ page: "A", url: "https://a.example/" }],
    );
    expect([...highlight.nodes]).toEqual(["page:https://a.example/", "concept:opfs"]);
    expect([...highlight.links]).toEqual(["page:https://a.example/|MENTIONS|concept:opfs"]);
  });
});

describe("unanswerableText", () => {
  const base = { kind: "unanswerable" as const, missing: [], matches: [], concepts: [] };

  it("says how many pages matched an ambiguous page name", () => {
    const matches = [
      { url: "https://a.example/", title: "Notes" },
      { url: "https://b.example/", title: "Notes" },
    ];
    expect(unanswerableText({ ...base, reason: "ambiguous", matches })).toContain("2 pages match");
  });

  it("names the concepts that are not in the graph", () => {
    expect(unanswerableText({ ...base, reason: "unknownTarget", missing: ["SQLite"] })).toBe(
      "“SQLite” is not in the graph. Nothing was run.",
    );
  });
});

describe("questionGuide", () => {
  const concepts = ["Persistent storage", "OPFS"];
  const answer = (rows: Record<string, unknown>[]): AskResult => ({
    kind: "answer",
    plan: {
      kind: "concernsAbout",
      concept: { key: "persistentstorage", name: "Persistent storage" },
    },
    title: "Concerns about Persistent storage",
    cypher: "MATCH ...",
    columns: ["concern", "page"],
    rows,
    truncated: false,
    concepts,
  });
  const unanswerable = (
    reason: Extract<AskResult, { kind: "unanswerable" }>["reason"],
  ): AskResult => ({ kind: "unanswerable", reason, missing: [], matches: [], concepts });
  const guide = { examples: QUERY_KINDS.map((kind) => KIND_SPECS[kind].example), concepts };

  it("guides to answerable questions when the query matched nothing", () => {
    expect(questionGuide(answer([]))).toEqual(guide);
  });

  it("does not guide when the query has results", () => {
    expect(questionGuide(answer([{ concern: "Quota is small.", page: "Storage" }]))).toBeNull();
  });

  it.each(["noKind", "unknownTarget"] as const)("guides when the question is %s", (reason) => {
    expect(questionGuide(unanswerable(reason))).toEqual(guide);
  });

  it.each(["ambiguous", "emptyGraph", "tooLong"] as const)(
    "does not guide when the question is %s",
    (reason) => {
      expect(questionGuide(unanswerable(reason))).toBeNull();
    },
  );
});
