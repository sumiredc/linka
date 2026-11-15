import { describe, expect, it } from "vitest";
import seed from "../../seed/demo.cypher?raw";
import { buildQuery, type QueryPlan } from "../shared/graph-question";
import { openMemoryDb, run, runScript } from "../shared/test/relate-node";
import { answerHighlight } from "./answer-view";
import { GRAPH_VIEW_PARAMS, GRAPH_VIEW_SCRIPT, toGraphView } from "./graph-view";

// 答えの行から作った強調の id が、同じ DB から描いたグラフのノードと線の id に一致することを確かめる

const db = openMemoryDb();
runScript(db, seed);
const view = toGraphView(
  db
    .executeScript(GRAPH_VIEW_SCRIPT, JSON.stringify(GRAPH_VIEW_PARAMS))
    .map((json) => JSON.parse(json) as { rows: Record<string, unknown>[] }),
);
const nodeIds = new Set(view.nodes.map((node) => node.id));
const linkIds = new Set(view.links.map((link) => link.id));

const opfs = { key: "opfs", name: "OPFS" };
const worker = { key: "webworker", name: "Web Worker" };
const offline = { key: "offlinesupport", name: "Offline support" };
const localFirst = {
  url: "https://www.inkandswitch.com/essay/local-first/",
  title: "Local-first software: You own your data, in spite of the cloud",
};

const PLANS: readonly QueryPlan[] = [
  { kind: "concernsAbout", concept: opfs },
  { kind: "solutionsForConcernsAbout", concept: offline },
  { kind: "pagesMentioning", concept: { key: "indexeddb", name: "IndexedDB" } },
  { kind: "pagesMentioningBoth", concepts: [opfs, worker] },
  { kind: "authorsOfPagesMentioning", concept: { key: "sqlite", name: "SQLite" } },
  { kind: "conceptsOnManyPages", moreThan: 3 },
  { kind: "pagesSolvingConcernsOfPage", page: localFirst },
];

function highlightOf(plan: QueryPlan) {
  const statement = buildQuery(plan);
  const rows = run(db, statement.query, statement.params).rows;
  expect(rows.length).toBeGreaterThan(0);
  return { rows, highlight: answerHighlight(plan, rows) };
}

describe("answerHighlight on the demo graph", () => {
  for (const plan of PLANS) {
    it(`${plan.kind} lights only nodes and links drawn in the graph`, () => {
      const { highlight } = highlightOf(plan);
      expect(highlight.nodes.size).toBeGreaterThan(0);
      expect([...highlight.nodes].filter((id) => !nodeIds.has(id))).toEqual([]);
      expect([...highlight.links].filter((id) => !linkIds.has(id))).toEqual([]);
    });
  }

  it("lights each related concept with the link in whichever direction it was drawn", () => {
    const { rows, highlight } = highlightOf({ kind: "relatedConcepts", concept: worker });
    expect([...highlight.nodes].filter((id) => !nodeIds.has(id))).toEqual([]);
    expect([...highlight.links].filter((id) => linkIds.has(id))).toHaveLength(rows.length);
  });

  it("lights the path from the solution's page to the concern's page", () => {
    const { highlight } = highlightOf({ kind: "pagesSolvingConcernsOfPage", page: localFirst });
    const types = new Set([...highlight.links].map((id) => id.split("|")[1]));
    expect(types).toEqual(new Set(["ASSERTS", "ADDRESSES"]));
    expect(highlight.nodes.has(`page:${localFirst.url}`)).toBe(true);
  });
});
