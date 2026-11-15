import type { RelateDb } from "@relate/relate-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import seed from "../../seed/demo.cypher?raw";
import { openMemoryDb, run, runScript, scalar } from "../shared/test/relate-node";
import {
  GRAPH_VIEW_PARAMS,
  GRAPH_VIEW_SCRIPT,
  type GraphView,
  type LinkType,
  PAGE_LIMIT,
  toGraphView,
} from "./graph-view";

// サイドパネルの問い合わせを、seed/demo.cypher を入れた本物の Relate に流す

function readView(db: RelateDb, params: Record<string, unknown> = GRAPH_VIEW_PARAMS): GraphView {
  const results = db
    .executeScript(GRAPH_VIEW_SCRIPT, JSON.stringify(params))
    .map((json) => JSON.parse(json) as { rows: Record<string, unknown>[]; error: string | null });
  for (const result of results) expect(result.error).toBeNull();
  return toGraphView(results);
}

function countKinds(view: GraphView) {
  const count = (kind: string) => view.nodes.filter((node) => node.kind === kind).length;
  const links = (type: LinkType) => view.links.filter((link) => link.type === type).length;
  return {
    Page: count("page"),
    Concept: count("concept"),
    Claim: count("claim"),
    MENTIONS: links("MENTIONS"),
    ASSERTS: links("ASSERTS"),
    ABOUT: links("ABOUT"),
    ADDRESSES: links("ADDRESSES"),
    RELATED_TO: links("RELATED_TO"),
  };
}

describe("the side panel graph query on the demo data", () => {
  let db: RelateDb;
  beforeAll(() => {
    db = openMemoryDb();
    runScript(db, seed);
  });

  it("draws every page, concept, claim and relationship of the demo data except people", () => {
    // seed.relate.test.ts の DEMO_COUNTS と同じ Page・Concept・Claim・ADDRESSES の数
    expect(countKinds(readView(db))).toEqual({
      Page: 15,
      Concept: 29,
      Claim: 48,
      MENTIONS: 64,
      ASSERTS: 48,
      ABOUT: 90,
      ADDRESSES: 11,
      RELATED_TO: 25,
    });
  });

  it("matches the relationship counts in the store", () => {
    const stored = (type: string) =>
      scalar(db, `MATCH ()-[r:${type}]->() RETURN count(r) AS n`) as number;
    const counts = countKinds(readView(db));
    for (const type of ["MENTIONS", "ASSERTS", "ABOUT", "ADDRESSES", "RELATED_TO"] as const) {
      expect(counts[type], type).toBe(stored(type));
    }
  });

  it("reads without changing the graph", () => {
    const stats = db
      .executeScript(GRAPH_VIEW_SCRIPT, JSON.stringify(GRAPH_VIEW_PARAMS))
      .map((json) => (JSON.parse(json) as { stats: Record<string, number> }).stats);
    for (const stat of stats) expect(Object.values(stat).every((n) => n === 0)).toBe(true);
  });

  it("reports the total number of pages", () => {
    expect(readView(db).totalPages).toBe(15);
  });
});

describe("the page limit", () => {
  it("draws only the most recently clipped pages and the links among what it draws", () => {
    const db = openMemoryDb();
    runScript(db, seed);
    const newest = run(
      db,
      "MATCH (p:Page) RETURN p.url AS url ORDER BY p.clippedAt DESC, p.url LIMIT 3",
    ).rows.map((row) => `page:${row.url}`);

    const view = readView(db, { limit: 3 });
    const ids = new Set(view.nodes.map((node) => node.id));
    expect(view.nodes.filter((node) => node.kind === "page").map((node) => node.id)).toEqual(
      newest,
    );
    expect(view.totalPages).toBe(15);
    for (const link of view.links) {
      expect(ids.has(link.source) && ids.has(link.target), link.id).toBe(true);
    }
  });

  it("puts pages without a clip time after the dated ones", () => {
    const db = openMemoryDb();
    for (let i = 0; i < PAGE_LIMIT; i++) {
      run(db, "CREATE (:Page {url: $url, clippedAt: '2026-11-14T09:00:00Z'})", {
        url: `https://example.com/${i}`,
      });
    }
    run(db, "CREATE (:Page {url: 'https://example.com/undated'})");

    const pages = readView(db).nodes.filter((node) => node.kind === "page");
    expect(pages).toHaveLength(PAGE_LIMIT);
    expect(pages.map((node) => node.id)).not.toContain("page:https://example.com/undated");
  });
});
