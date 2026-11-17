import type { RelateDb } from "@relate/relate-wasm";
import { describe, expect, it } from "vitest";
import seed from "../../seed/demo.cypher?raw";
import type { Clip, Extraction } from "./extraction";
import { buildGraphExport, EXPORT_READ_SCRIPT, ROWS_PER_STATEMENT } from "./graph-export";
import { buildClipStatements, buildReclipStatements } from "./graph-statements";
import { openMemoryDb, run, runScript, runStatements } from "./test/relate-node";

// 書き出したスクリプトを、本物の Relate（Node 上のメモリ DB）の空のストアに読み込み直して確かめる

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return { summary: "", concepts: [], authors: [], claims: [], relatedConcepts: [], ...overrides };
}

function clip(url: string, source: Clip["source"], body: Partial<Extraction>): Clip {
  return {
    url,
    title: `Title of ${url}`,
    clippedAt: "2026-11-15T09:00:00Z",
    source,
    extraction: extraction(body),
  };
}

const TRICKY_URL = "https://tricky.example/quotes";

/** デモデータに、seed には無い形（選択範囲の Claim・引用符や改行・ページから外れた Concept）を足したグラフ */
function trickyGraph(): RelateDb {
  const db = openMemoryDb();
  runScript(db, seed);
  runStatements(
    db,
    buildClipStatements(
      clip(TRICKY_URL, "page", {
        summary: 'It\'s "quoted"; a\nnew line, a \\ backslash, a $dollar and 日本語.',
        concepts: [
          { name: "Orphan concept", category: "test" },
          { name: "CRDT", category: "sync" },
        ],
        authors: ["Ada O'Brien"],
        claims: [{ statement: "Page claim; with semicolon.", type: "fact", concepts: ["CRDT"] }],
        relatedConcepts: [{ from: "Orphan concept", to: "CRDT" }],
      }),
    ),
  );
  runStatements(
    db,
    buildClipStatements(
      clip(TRICKY_URL, "selection", {
        claims: [{ statement: "A claim the user selected.", type: "concern", concepts: ["CRDT"] }],
      }),
    ),
  );
  // 再クリップで MENTIONS が消えても、Concept と RELATED_TO は残る（PRD §5）
  runStatements(db, buildReclipStatements(TRICKY_URL));
  return db;
}

function exportOf(db: RelateDb) {
  return buildGraphExport(runScript(db, EXPORT_READ_SCRIPT));
}

function countsByLabel(db: RelateDb): Record<string, number> {
  const { rows } = run(db, "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n");
  return Object.fromEntries(rows.map((row) => [row.label, row.n]));
}

function countsByType(db: RelateDb): Record<string, number> {
  const { rows } = run(db, "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS n");
  return Object.fromEntries(rows.map((row) => [row.type, row.n]));
}

/** 全ノードのラベルとプロパティ、全関係の両端と種類。書き出しの読み取りとは別の問い合わせで見る */
function contents(db: RelateDb) {
  const nodes = run(db, "MATCH (n) RETURN labels(n) AS labels, properties(n) AS props").rows.map(
    (row) => JSON.stringify(row),
  );
  const links = run(
    db,
    "MATCH (a)-[r]->(b) RETURN properties(a) AS a, type(r) AS type, properties(b) AS b, properties(r) AS props",
  ).rows.map((row) => JSON.stringify(row));
  return { nodes: nodes.sort(), links: links.sort() };
}

function reloaded(script: string): RelateDb {
  const db = openMemoryDb();
  runScript(db, script);
  return db;
}

describe("the exported graph reloaded into an empty store", () => {
  it("has the same number of nodes of each label and relationships of each type as the demo data", () => {
    const db = openMemoryDb();
    runScript(db, seed);
    const copy = reloaded(exportOf(db).script);
    // PRD §13 の CLI で作った data/linka.rl と同じ件数
    expect(countsByLabel(copy)).toEqual({
      Page: 15,
      Concept: 29,
      Person: 9,
      Claim: 48,
    });
    expect(countsByType(copy)).toEqual(countsByType(db));
  });

  it("has the same nodes, properties and relationships, including selection claims and concepts no page mentions", () => {
    const db = trickyGraph();
    const copy = reloaded(exportOf(db).script);
    expect(contents(copy)).toEqual(contents(db));
    // 確かめたい形がグラフに本当にあること
    expect(run(copy, "MATCH (c:Claim {source: 'selection'}) RETURN count(c) AS n").rows[0]?.n).toBe(
      1,
    );
    expect(
      run(
        copy,
        "MATCH (k:Concept {key: 'orphanconcept'}) WHERE NOT ()-[:MENTIONS]->(k) RETURN count(k) AS n",
      ).rows[0]?.n,
    ).toBe(1);
  });

  it("splits large node and relationship lists into several statements and still reloads them all", () => {
    const db = openMemoryDb();
    const pages = Array.from({ length: ROWS_PER_STATEMENT * 2 + 1 }, (_, i) => ({
      url: `https://many.example/${i}`,
      title: `Page ${i}`,
    }));
    run(db, "UNWIND $pages AS page CREATE (p:Page) SET p = page", { pages });
    run(db, "MERGE (k:Concept {key: 'shared', name: 'Shared'})");
    run(db, "MATCH (p:Page), (k:Concept {key: 'shared'}) MERGE (p)-[:MENTIONS]->(k)");
    const { script } = exportOf(db);
    expect(script.match(/MERGE \(n:Page /g)).toHaveLength(3);
    expect(script.match(/MERGE \(a\)-\[:MENTIONS\]->\(b\)/g)).toHaveLength(3);
    expect(contents(reloaded(script))).toEqual(contents(db));
  });

  it("does not add anything when it is loaded into the same store twice", () => {
    const db = trickyGraph();
    const { script } = exportOf(db);
    const copy = reloaded(script);
    runScript(copy, script);
    expect(contents(copy)).toEqual(contents(db));
  });

  it("replaces what a store already holds, so pages deleted since the last export do not remain", () => {
    const db = trickyGraph();
    const { script } = exportOf(db);
    const previous = openMemoryDb();
    runScript(previous, seed);
    run(previous, "CREATE (:Page {url: 'https://deleted.example/', title: 'Deleted since'})");
    runScript(previous, script);
    expect(contents(previous)).toEqual(contents(db));
  });

  it("leaves an empty store for an empty graph", () => {
    const db = openMemoryDb();
    const { script, counts } = exportOf(db);
    expect(counts.relationships).toBe(0);
    expect(contents(reloaded(script))).toEqual({ nodes: [], links: [] });
  });
});

describe("reading the graph to export it", () => {
  it("does not change the graph", () => {
    const db = trickyGraph();
    const before = contents(db);
    const results = runScript(db, EXPORT_READ_SCRIPT);
    for (const result of results) {
      expect(Object.values(result.stats).every((count) => count === 0)).toBe(true);
    }
    exportOf(db);
    expect(contents(db)).toEqual(before);
  });

  it("reports the counts it wrote in the header", () => {
    const db = openMemoryDb();
    runScript(db, seed);
    const { script, counts } = exportOf(db);
    expect(counts.nodes).toEqual({ Page: 15, Person: 9, Concept: 29, Claim: 48 });
    expect(counts.relationships).toBe(
      Object.values(countsByType(db)).reduce((sum, n) => sum + n, 0),
    );
    expect(script.split("\n")[0]).toBe(
      `// Linka graph export: 15 Page, 9 Person, 29 Concept, 48 Claim, ${counts.relationships} relationships.`,
    );
  });

  it("counts two parallel relationships of the same type once, as the reloaded store has them", () => {
    const db = openMemoryDb();
    run(db, "CREATE (:Page {url: 'https://a.example/'}), (:Concept {key: 'k', name: 'K'})");
    for (let i = 0; i < 2; i++) {
      run(db, "MATCH (p:Page), (k:Concept) CREATE (p)-[:MENTIONS]->(k)");
    }
    const { script, counts } = exportOf(db);
    expect(counts.relationships).toBe(1);
    expect(countsByType(reloaded(script))).toEqual({ MENTIONS: 1 });
  });

  it("writes the same file for the same graph, whatever order it was written in", () => {
    const urls = ["https://a.example/", "https://b.example/", "https://c.example/"];
    const build = (order: readonly string[]) => {
      const db = openMemoryDb();
      for (const key of order) run(db, "CREATE (:Concept {key: $key, name: $key})", { key });
      for (const url of order) {
        run(db, "CREATE (p:Page {url: $url})", { url });
        for (const key of order) {
          run(
            db,
            "MATCH (p:Page {url: $url}), (k:Concept {key: $key}) CREATE (p)-[:MENTIONS]->(k)",
            {
              url,
              key,
            },
          );
        }
      }
      return exportOf(db).script;
    };
    expect(build([...urls].reverse())).toBe(build(urls));
  });
});
