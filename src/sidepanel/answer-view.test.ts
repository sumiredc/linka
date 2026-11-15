import { describe, expect, it } from "vitest";
import { answerCells, answerHighlight, isOpenableUrl } from "./answer-view";

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
