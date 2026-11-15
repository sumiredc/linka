import { describe, expect, it } from "vitest";
import { type GraphView, neighborsOf, toGraphView } from "./graph-view";

type Rows = Record<string, unknown>[];

/** {@link toGraphView} が読む文ごとの結果を、名前で渡して並べる */
function results(parts: {
  total?: number;
  pages?: Rows;
  claims?: Rows;
  mentions?: Rows;
  about?: Rows;
  addresses?: Rows;
  related?: Rows;
}) {
  return [
    { rows: parts.total === undefined ? [] : [{ pages: parts.total }] },
    { rows: parts.pages ?? [] },
    { rows: parts.claims ?? [] },
    { rows: parts.mentions ?? [] },
    { rows: parts.about ?? [] },
    { rows: parts.addresses ?? [] },
    { rows: parts.related ?? [] },
  ];
}

const A = "https://a.example/";
const B = "https://b.example/";

const page = (url: string) => ({
  url,
  title: `Title of ${url}`,
  summary: "s",
  clippedAt: "2026-11-14T09:00:00Z",
});
const claim = (pageUrl: string, id: string, type: string) => ({
  page: pageUrl,
  id,
  statement: `statement ${id}`,
  type,
});
const concept = (key: string) => ({ key, name: key.toUpperCase(), category: "storage" });

const linkIds = (view: GraphView) => view.links.map((link) => link.id).sort();

describe("toGraphView", () => {
  it("makes a page, concept and claim node from their rows", () => {
    const view = toGraphView(
      results({
        total: 1,
        pages: [page(A)],
        claims: [claim(A, "c1", "fact")],
        mentions: [{ page: A, ...concept("opfs") }],
      }),
    );
    expect(view.nodes).toEqual([
      {
        id: `page:${A}`,
        kind: "page",
        url: A,
        title: `Title of ${A}`,
        summary: "s",
        clippedAt: "2026-11-14T09:00:00Z",
      },
      {
        id: "claim:c1",
        kind: "claim",
        statement: "statement c1",
        type: "fact",
        shape: "other",
      },
      { id: "concept:opfs", kind: "concept", name: "OPFS", category: "storage" },
    ]);
    expect(linkIds(view)).toEqual([
      `page:${A}|ASSERTS|claim:c1`,
      `page:${A}|MENTIONS|concept:opfs`,
    ]);
  });

  it("draws concerns and solutions apart and every other claim type as other", () => {
    const view = toGraphView(
      results({
        pages: [page(A)],
        claims: [
          claim(A, "c1", "concern"),
          claim(A, "c2", "solution"),
          claim(A, "c3", "benefit"),
          claim(A, "c4", "fact"),
          claim(A, "c5", "something-new"),
        ],
      }),
    );
    const shapes = view.nodes.flatMap((node) =>
      node.kind === "claim" ? [[node.id, node.type, node.shape]] : [],
    );
    expect(shapes).toEqual([
      ["claim:c1", "concern", "concern"],
      ["claim:c2", "solution", "solution"],
      ["claim:c3", "benefit", "other"],
      ["claim:c4", "fact", "other"],
      ["claim:c5", "something-new", "other"],
    ]);
  });

  it("keeps one node and one link when rows repeat them", () => {
    const view = toGraphView(
      results({
        pages: [page(A), page(A)],
        claims: [claim(A, "c1", "concern"), claim(A, "c1", "concern")],
        mentions: [
          { page: A, ...concept("opfs") },
          { page: A, ...concept("opfs") },
        ],
        about: [
          { claim: "c1", ...concept("opfs") },
          { claim: "c1", ...concept("opfs") },
        ],
      }),
    );
    expect(view.nodes.map((node) => node.id)).toEqual([`page:${A}`, "claim:c1", "concept:opfs"]);
    expect(linkIds(view)).toEqual([
      "claim:c1|ABOUT|concept:opfs",
      `page:${A}|ASSERTS|claim:c1`,
      `page:${A}|MENTIONS|concept:opfs`,
    ]);
  });

  it("keeps links of different types between the same two nodes", () => {
    const view = toGraphView(
      results({
        pages: [page(A)],
        mentions: [
          { page: A, ...concept("a") },
          { page: A, ...concept("b") },
        ],
        related: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      }),
    );
    expect(linkIds(view)).toEqual([
      "concept:a|RELATED_TO|concept:b",
      "concept:b|RELATED_TO|concept:a",
      `page:${A}|MENTIONS|concept:a`,
      `page:${A}|MENTIONS|concept:b`,
    ]);
  });

  it("adds a concept that only a claim is about", () => {
    const view = toGraphView(
      results({
        pages: [page(A)],
        claims: [claim(A, "c1", "fact")],
        about: [{ claim: "c1", ...concept("wasm") }],
      }),
    );
    expect(view.nodes.map((node) => node.id)).toContain("concept:wasm");
    expect(linkIds(view)).toContain("claim:c1|ABOUT|concept:wasm");
  });

  it("drops a link whose other end is not drawn", () => {
    // B のページは上限で外れ、その concern と、B だけが挙げる Concept は結果に無い
    const view = toGraphView(
      results({
        pages: [page(A)],
        claims: [claim(A, "s1", "solution")],
        mentions: [{ page: A, ...concept("a") }],
        addresses: [{ solution: "s1", concern: "missing-concern" }],
        related: [{ from: "a", to: "only-on-b" }],
      }),
    );
    expect(linkIds(view)).toEqual([`page:${A}|ASSERTS|claim:s1`, `page:${A}|MENTIONS|concept:a`]);
  });

  it("drops a claim whose page is not drawn, with its links", () => {
    const view = toGraphView(
      results({
        pages: [page(A)],
        claims: [claim(B, "c1", "fact")],
        mentions: [{ page: A, ...concept("a") }],
        about: [{ claim: "c1", ...concept("a") }],
      }),
    );
    expect(view.nodes.map((node) => node.id)).toEqual([`page:${A}`, "concept:a"]);
    expect(linkIds(view)).toEqual([`page:${A}|MENTIONS|concept:a`]);
  });

  it("drops a concept left without any drawn link", () => {
    // B の Claim だけが指していた Concept は、B を描かないとどこにもつながらない
    const view = toGraphView(
      results({
        pages: [page(A)],
        claims: [claim(B, "c1", "fact")],
        about: [{ claim: "c1", ...concept("only-on-b") }],
      }),
    );
    expect(view.nodes.map((node) => node.id)).toEqual([`page:${A}`]);
  });

  it("keeps a page that has no links", () => {
    expect(toGraphView(results({ pages: [page(A)] })).nodes.map((node) => node.id)).toEqual([
      `page:${A}`,
    ]);
  });

  it("links a solution to the concern it addresses", () => {
    const view = toGraphView(
      results({
        pages: [page(A), page(B)],
        claims: [claim(A, "s1", "solution"), claim(B, "c1", "concern")],
        addresses: [{ solution: "s1", concern: "c1" }],
      }),
    );
    expect(linkIds(view)).toContain("claim:s1|ADDRESSES|claim:c1");
  });

  it("skips rows without the value that identifies the node", () => {
    const view = toGraphView(
      results({
        pages: [{ ...page(A), url: null }],
        claims: [{ ...claim(A, "c1", "fact"), id: null }],
        mentions: [{ page: A, key: null, name: "x" }],
      }),
    );
    expect(view.nodes).toEqual([]);
    expect(view.links).toEqual([]);
  });

  it("falls back to the URL for a page without a title", () => {
    const view = toGraphView(results({ pages: [{ url: A, title: null }] }));
    expect(view.nodes[0]).toMatchObject({ title: A, summary: null, clippedAt: null });
  });

  it("reports the number of pages in the store, not only the ones drawn", () => {
    expect(toGraphView(results({ total: 130, pages: [page(A)] })).totalPages).toBe(130);
  });
});

describe("neighborsOf", () => {
  it("lists the nodes linked to a node in either direction", () => {
    const view = toGraphView(
      results({
        pages: [page(A)],
        claims: [claim(A, "c1", "concern")],
        about: [{ claim: "c1", ...concept("opfs") }],
      }),
    );
    expect(
      neighborsOf(view, "claim:c1").map(({ node, link, direction }) => [
        node.id,
        link.type,
        direction,
      ]),
    ).toEqual([
      [`page:${A}`, "ASSERTS", "in"],
      ["concept:opfs", "ABOUT", "out"],
    ]);
  });
});
