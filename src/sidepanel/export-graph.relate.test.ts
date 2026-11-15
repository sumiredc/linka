import type { RelateDb } from "@relate/relate-wasm";
import { expect, it } from "vitest";
import seed from "../../seed/demo.cypher?raw";
import { classifyScript } from "../shared/messages";
import { openMemoryDb, runScript } from "../shared/test/relate-node";
import { exportGraph } from "./export-graph";
import { GRAPH_VIEW_PARAMS, GRAPH_VIEW_SCRIPT, toGraphView } from "./graph-view";

// Export を本物の Relate（Node 上のメモリ DB）につないで、サイドパネルが描くグラフが変わらないことを見る

function panelCounts(db: RelateDb) {
  const read = classifyScript(
    db.executeScript(GRAPH_VIEW_SCRIPT, JSON.stringify(GRAPH_VIEW_PARAMS)),
  );
  if (!read.ok) throw new Error(read.error.message);
  const view = toGraphView(read.value);
  const count = (kind: string) => view.nodes.filter((node) => node.kind === kind).length;
  return {
    pages: count("page"),
    concepts: count("concept"),
    claims: count("claim"),
    links: view.links.length,
  };
}

it("leaves the side panel graph unchanged and saves a script that rebuilds the same graph", async () => {
  const db = openMemoryDb();
  runScript(db, seed);
  const before = panelCounts(db);
  const saved: string[] = [];
  const outcome = await exportGraph({
    readGraph: async ({ script }) => classifyScript(db.executeScript(script, null)),
    save: (_, text) => saved.push(text),
  });
  expect(outcome.ok).toBe(true);
  expect(panelCounts(db)).toEqual(before);
  expect(before).toEqual({ pages: 15, concepts: 29, claims: 48, links: 237 });

  const copy = openMemoryDb();
  runScript(copy, saved[0] ?? "");
  expect(panelCounts(copy)).toEqual(before);
});
