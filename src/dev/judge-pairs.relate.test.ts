import { describe, expect, it } from "vitest";
import demoCypher from "../../seed/demo.cypher?raw";
import { openMemoryDb, run, runScript } from "../shared/test/relate-node";
import { JUDGE_PAIRS } from "./judge-pairs";

// 正解を付けた組が、デモデータの上で UC2 の候補になりうる組（別ページの solution と concern が同じ Concept を指す）であること
describe("JUDGE_PAIRS on the demo graph", () => {
  const db = openMemoryDb();
  runScript(db, demoCypher);

  const sharedConcepts = (pair: (typeof JUDGE_PAIRS)[number]) =>
    run(
      db,
      [
        "MATCH (sp:Page {url: $solutionPage})-[:ASSERTS]->(s:Claim {type: 'solution', statement: $solution})",
        "MATCH (cp:Page {url: $concernPage})-[:ASSERTS]->(c:Claim {type: 'concern', statement: $concern})",
        "WHERE sp.url <> cp.url",
        "MATCH (s)-[:ABOUT]->(k:Concept)<-[:ABOUT]-(c)",
        "RETURN k.name AS name",
      ].join("\n"),
      {
        solutionPage: pair.solution.page,
        solution: pair.solution.statement,
        concernPage: pair.concern.page,
        concern: pair.concern.statement,
      },
    )
      .rows.map((row) => row.name)
      .sort();

  it("has at least 20 pairs with unique ids, both true and false", () => {
    expect(JUDGE_PAIRS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(JUDGE_PAIRS.map((pair) => pair.id)).size).toBe(JUDGE_PAIRS.length);
    expect(JUDGE_PAIRS.some((pair) => pair.expected)).toBe(true);
    expect(JUDGE_PAIRS.some((pair) => !pair.expected)).toBe(true);
  });

  for (const pair of JUDGE_PAIRS) {
    it(`${pair.id} is a cross-page pair sharing exactly its listed concepts`, () => {
      expect(sharedConcepts(pair)).toEqual([...pair.concepts].sort());
      expect(pair.concepts.length).toBeGreaterThan(0);
    });
  }

  it("labels true exactly the pairs the demo data connects with ADDRESSES", () => {
    const addressed = run(
      db,
      [
        "MATCH (sp:Page)-[:ASSERTS]->(s:Claim)-[:ADDRESSES]->(c:Claim)<-[:ASSERTS]-(cp:Page)",
        "RETURN sp.url AS solutionPage, s.statement AS solution, cp.url AS concernPage, c.statement AS concern",
      ].join("\n"),
    ).rows.map((row) =>
      JSON.stringify([row.solutionPage, row.solution, row.concernPage, row.concern]),
    );
    const key = (pair: (typeof JUDGE_PAIRS)[number]) =>
      JSON.stringify([
        pair.solution.page,
        pair.solution.statement,
        pair.concern.page,
        pair.concern.statement,
      ]);
    for (const pair of JUDGE_PAIRS) {
      expect(addressed.includes(key(pair)), pair.id).toBe(pair.expected);
    }
  });
});
