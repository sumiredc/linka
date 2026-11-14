import type { RelateDb } from "@relate/relate-wasm";
import { describe, expect, it } from "vitest";
import { claimId } from "./claim-id";
import { toCypherScript } from "./cypher";
import type { Clip, Extraction } from "./extraction";
import {
  buildAddressesStatement,
  buildClipStatements,
  buildReclipStatements,
} from "./graph-statements";
import { openMemoryDb, run, runScript, runStatements, scalar } from "./test/relate-node";

// 本物の Relate（Node 上のメモリ DB）に流して確かめる

const WASM_URL = "https://wasm-weekly.example/memory-limits";
const OPFS_URL = "https://sqlite-in-browser.example/opfs";

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

// 引用符・バックスラッシュ・改行を含めて、埋め込みの経路でも値が崩れないことを見る
const wasmClip = clip(`${WASM_URL}?utm_source=feed#top`, "page", {
  summary: 'The 4GB wall of 32-bit "Wasm", and what it\'s like.\nSecond line \\ backslash.',
  concepts: [
    { name: "WebAssembly", category: "runtime" },
    { name: "Memory limit", category: "constraint" },
  ],
  authors: ["Lin  Clark"],
  claims: [
    {
      statement: "32-bit Wasm linear memory is capped at 4GB per instance.",
      type: "concern",
      concepts: ["Web Assembly", "memory limit"],
    },
    {
      statement: "An in-memory graph must fit its indexes in that budget.",
      type: "concern",
      concepts: ["Memory limit"],
    },
  ],
  relatedConcepts: [{ from: "WebAssembly", to: "Memory limit" }],
});

const opfsClip = clip(OPFS_URL, "page", {
  summary: "SQLite on OPFS.",
  concepts: [
    { name: "OPFS", category: "storage" },
    { name: "Wasm", category: "runtime" },
  ],
  authors: [],
  claims: [
    {
      statement: "Memory64 lifts the 4GB cap.",
      type: "solution",
      concepts: ["WebAssembly"],
    },
  ],
});

function countsByLabel(db: RelateDb): Record<string, number> {
  const { rows } = run(db, "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n");
  return Object.fromEntries(rows.map((row) => [row.label, row.n]));
}

function countsByType(db: RelateDb): Record<string, number> {
  const { rows } = run(db, "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS n");
  return Object.fromEntries(rows.map((row) => [row.type, row.n]));
}

/** ノードのラベルとプロパティ、関係の両端の識別子を並べたもの。2 つの DB の中身を比べるのに使う */
function snapshot(db: RelateDb): unknown {
  const nodes = run(db, "MATCH (n) RETURN labels(n) AS labels, properties(n) AS props").rows;
  const edges = run(
    db,
    "MATCH (a)-[r]->(b) RETURN type(r) AS type, properties(a) AS a, properties(b) AS b",
  ).rows;
  const sortKey = (value: unknown) => JSON.stringify(value);
  return {
    nodes: nodes.map(sortKey).sort(),
    edges: edges.map(sortKey).sort(),
  };
}

function claimSources(db: RelateDb, url: string): Record<string, string> {
  const { rows } = run(
    db,
    "MATCH (:Page {url: $url})-[:ASSERTS]->(c:Claim) RETURN c.statement AS statement, c.source AS source",
    { url },
  );
  return Object.fromEntries(rows.map((row) => [row.statement, row.source]));
}

describe("buildClipStatements on Relate", () => {
  it("does not add nodes or relationships when the same clip is written twice", () => {
    const db = openMemoryDb();
    runStatements(db, buildClipStatements(wasmClip));
    const nodesAfterFirst = countsByLabel(db);
    const edgesAfterFirst = countsByType(db);

    runStatements(db, buildClipStatements(wasmClip));

    expect(countsByLabel(db)).toEqual(nodesAfterFirst);
    expect(countsByType(db)).toEqual(edgesAfterFirst);
  });

  it("writes the expected numbers of nodes and relationships for one page", () => {
    const db = openMemoryDb();
    runStatements(db, buildClipStatements(wasmClip));
    expect(countsByLabel(db)).toEqual({ Page: 1, Concept: 2, Person: 1, Claim: 2 });
    expect(countsByType(db)).toEqual({
      MENTIONS: 2,
      AUTHORED_BY: 1,
      ASSERTS: 2,
      ABOUT: 3,
      RELATED_TO: 1,
    });
  });

  it("produces the same graph through executeScript with embedded values", () => {
    const parameterized = openMemoryDb();
    const embedded = openMemoryDb();
    const clips = [wasmClip, opfsClip];
    for (const c of clips) runStatements(parameterized, buildClipStatements(c));
    runScript(embedded, toCypherScript(clips.flatMap(buildClipStatements)));

    expect(countsByLabel(embedded)).toEqual(countsByLabel(parameterized));
    expect(countsByType(embedded)).toEqual(countsByType(parameterized));
    expect(snapshot(embedded)).toEqual(snapshot(parameterized));
  });

  it("stores a lone surrogate as U+FFFD through both parameters and executeScript", () => {
    const broken = clip(OPFS_URL, "page", { summary: "a\uD800b" });
    const parameterized = openMemoryDb();
    const embedded = openMemoryDb();
    runStatements(parameterized, buildClipStatements(broken));
    runScript(embedded, toCypherScript(buildClipStatements(broken)));
    const summaries = [parameterized, embedded].map((db) =>
      scalar(db, "MATCH (p:Page) RETURN p.summary AS s"),
    );
    expect(summaries).toEqual(["a\uFFFDb", "a\uFFFDb"]);
  });

  it("keeps quotes, backslashes and newlines intact through executeScript", () => {
    const db = openMemoryDb();
    runScript(db, toCypherScript(buildClipStatements(wasmClip)));
    expect(scalar(db, "MATCH (p:Page) RETURN p.summary AS s")).toBe(wasmClip.extraction.summary);
  });

  it("stores the page under its normalized URL", () => {
    const db = openMemoryDb();
    runStatements(db, buildClipStatements(wasmClip));
    expect(scalar(db, "MATCH (p:Page) RETURN p.url AS url")).toBe(WASM_URL);
  });

  it("merges concept names that differ only by aliases into one Concept", () => {
    const db = openMemoryDb();
    runStatements(db, buildClipStatements(wasmClip));
    runStatements(db, buildClipStatements(opfsClip));
    expect(
      scalar(db, "MATCH (c:Concept {key: 'webassembly'})<-[:MENTIONS]-(p:Page) RETURN count(p)"),
    ).toBe(2);
  });

  it("keeps the first display name and category of a Concept", () => {
    const db = openMemoryDb();
    runStatements(db, buildClipStatements(wasmClip));
    runStatements(db, buildClipStatements(opfsClip));
    const { rows } = run(
      db,
      "MATCH (c:Concept {key: 'webassembly'}) RETURN c.name AS name, c.category AS category",
    );
    expect(rows).toEqual([{ name: "WebAssembly", category: "runtime" }]);
  });

  it("creates a Concept that only a claim refers to, so that ABOUT is not lost", () => {
    const db = openMemoryDb();
    const c = clip(OPFS_URL, "page", {
      claims: [{ statement: "Workers avoid jank.", type: "benefit", concepts: ["Web Workers"] }],
    });
    runStatements(db, buildClipStatements(c));
    expect(
      scalar(db, "MATCH (:Claim)-[:ABOUT]->(k:Concept {key: 'webworker'}) RETURN count(k)"),
    ).toBe(1);
  });

  it("draws a single RELATED_TO for a pair given in both directions", () => {
    const db = openMemoryDb();
    const c = clip(OPFS_URL, "page", {
      relatedConcepts: [
        { from: "OPFS", to: "SQLite" },
        { from: "SQLite", to: "OPFS" },
      ],
    });
    runStatements(db, buildClipStatements(c));
    expect(scalar(db, "MATCH ()-[r:RELATED_TO]-() RETURN count(DISTINCT r)")).toBe(1);
  });

  it("does not draw RELATED_TO from a Concept to itself", () => {
    const db = openMemoryDb();
    const c = clip(OPFS_URL, "page", { relatedConcepts: [{ from: "Wasm", to: "WebAssembly" }] });
    runStatements(db, buildClipStatements(c));
    expect(scalar(db, "MATCH ()-[r:RELATED_TO]->() RETURN count(r)")).toBe(0);
  });

  it("skips concept names that normalize to an empty key instead of merging them into one", () => {
    const db = openMemoryDb();
    const c = clip(OPFS_URL, "page", {
      concepts: [
        { name: "-", category: "misc" },
        { name: "OPFS", category: "storage" },
      ],
      claims: [{ statement: "S.", type: "fact", concepts: ["—", "OPFS"] }],
      relatedConcepts: [{ from: "_", to: "OPFS" }],
    });
    runStatements(db, buildClipStatements(c));
    expect(scalar(db, "MATCH (k:Concept) RETURN collect(k.key) AS keys")).toEqual(["opfs"]);
  });

  it("does not overwrite the page summary when clipping a selection of a clipped page", () => {
    const db = openMemoryDb();
    runStatements(db, buildClipStatements(wasmClip));
    runStatements(
      db,
      buildClipStatements(clip(WASM_URL, "selection", { summary: "Only the selected part." })),
    );
    expect(scalar(db, "MATCH (p:Page) RETURN p.summary AS s")).toBe(wasmClip.extraction.summary);
  });

  it("keeps a selection claim's source when the page extraction yields the same statement", () => {
    const db = openMemoryDb();
    const statement = "32-bit Wasm linear memory is capped at 4GB per instance.";
    runStatements(
      db,
      buildClipStatements(
        clip(WASM_URL, "selection", { claims: [{ statement, type: "concern", concepts: [] }] }),
      ),
    );
    runStatements(db, buildClipStatements(wasmClip));
    expect(claimSources(db, WASM_URL)[statement]).toBe("selection");
  });
});

describe("buildReclipStatements on Relate", () => {
  const selectedStatement = "Use Memory64 when the browser supports it.";
  const reclipped = clip(WASM_URL, "page", {
    summary: "Rewritten.",
    concepts: [{ name: "WebAssembly", category: "runtime" }],
    claims: [{ statement: "Wasm memory is capped.", type: "concern", concepts: ["WebAssembly"] }],
  });

  /** 1 ページ目をページ全体と選択範囲でクリップし、2 ページ目の solution から ADDRESSES を張った状態 */
  function seededDb(): RelateDb {
    const db = openMemoryDb();
    runStatements(db, buildClipStatements(wasmClip));
    runStatements(
      db,
      buildClipStatements(
        clip(WASM_URL, "selection", {
          claims: [{ statement: selectedStatement, type: "solution", concepts: ["Memory64"] }],
        }),
      ),
    );
    runStatements(db, buildClipStatements(opfsClip));
    runStatements(db, [
      buildAddressesStatement([
        {
          solution: claimId(OPFS_URL, "Memory64 lifts the 4GB cap."),
          concern: claimId(WASM_URL, "32-bit Wasm linear memory is capped at 4GB per instance."),
        },
      ]),
    ]);
    return db;
  }

  function reclip(db: RelateDb): void {
    runStatements(db, buildReclipStatements(reclipped.url));
    runStatements(db, buildClipStatements(reclipped));
  }

  it("replaces the page-derived claims with the new extraction", () => {
    const db = seededDb();
    reclip(db);
    expect(claimSources(db, WASM_URL)).toEqual({
      "Wasm memory is capped.": "page",
      [selectedStatement]: "selection",
    });
  });

  it("keeps claims added from a selection together with their ABOUT", () => {
    const db = seededDb();
    reclip(db);
    expect(
      scalar(
        db,
        "MATCH (c:Claim {source: 'selection'})-[:ABOUT]->(k:Concept) RETURN collect(k.key) AS keys",
      ),
    ).toEqual(["memory64"]);
  });

  it("removes ADDRESSES that pointed at a removed claim", () => {
    const db = seededDb();
    reclip(db);
    expect(scalar(db, "MATCH ()-[r:ADDRESSES]->() RETURN count(r)")).toBe(0);
  });

  function pageLinks(db: RelateDb): unknown[] {
    const { rows } = run(
      db,
      "MATCH (:Page {url: $url})-[r:MENTIONS|AUTHORED_BY]->(n) RETURN type(r) AS type, coalesce(n.key, n.name) AS target",
      { url: WASM_URL },
    );
    return rows.map((row) => `${row.type} ${row.target}`).sort();
  }

  it("removes MENTIONS and AUTHORED_BY that neither the new extraction nor a kept claim has", () => {
    const db = seededDb();
    reclip(db);
    expect(pageLinks(db)).not.toContain("MENTIONS memorylimit");
    expect(pageLinks(db)).not.toContain("AUTHORED_BY Lin Clark");
  });

  it("keeps MENTIONS of the concepts that a kept selection claim is ABOUT", () => {
    const db = seededDb();
    reclip(db);
    expect(pageLinks(db)).toEqual(["MENTIONS memory64", "MENTIONS webassembly"]);
  });

  it("does not touch claims of other pages", () => {
    const db = seededDb();
    const before = claimSources(db, OPFS_URL);
    reclip(db);
    expect(claimSources(db, OPFS_URL)).toEqual(before);
  });

  it("keeps Concepts and Persons even when no page mentions them any more", () => {
    const db = seededDb();
    const before = countsByLabel(db);
    reclip(db);
    const after = countsByLabel(db);
    expect([after.Concept, after.Person]).toEqual([before.Concept, before.Person]);
  });

  it("also removes sample claims, which stand in for a whole-page extraction", () => {
    const db = openMemoryDb();
    runStatements(
      db,
      buildClipStatements(
        clip(WASM_URL, "sample", { claims: [{ statement: "S.", type: "fact", concepts: [] }] }),
      ),
    );
    reclip(db);
    expect(claimSources(db, WASM_URL)).toEqual({ "Wasm memory is capped.": "page" });
  });

  it("gives the same result through executeScript with embedded values", () => {
    const parameterized = seededDb();
    reclip(parameterized);
    const embedded = seededDb();
    runScript(
      embedded,
      toCypherScript([...buildReclipStatements(reclipped.url), ...buildClipStatements(reclipped)]),
    );
    expect(snapshot(embedded)).toEqual(snapshot(parameterized));
  });
});

describe("buildAddressesStatement on Relate", () => {
  const concern = claimId(WASM_URL, "32-bit Wasm linear memory is capped at 4GB per instance.");
  const solution = claimId(OPFS_URL, "Memory64 lifts the 4GB cap.");

  function db(): RelateDb {
    const d = openMemoryDb();
    runStatements(d, buildClipStatements(wasmClip));
    runStatements(d, buildClipStatements(opfsClip));
    return d;
  }

  it("draws ADDRESSES from a solution to a concern on another page", () => {
    const d = db();
    runStatements(d, [buildAddressesStatement([{ solution, concern }])]);
    expect(
      scalar(d, "MATCH (s:Claim {id: $s})-[:ADDRESSES]->(c:Claim {id: $c}) RETURN count(*)", {
        s: solution,
        c: concern,
      }),
    ).toBe(1);
  });

  it("does not draw ADDRESSES between claims of the same page", () => {
    const d = openMemoryDb();
    const samePage = clip(WASM_URL, "page", {
      claims: [
        { statement: "Problem.", type: "concern", concepts: [] },
        { statement: "Fix.", type: "solution", concepts: [] },
      ],
    });
    runStatements(d, buildClipStatements(samePage));
    runStatements(d, [
      buildAddressesStatement([
        { solution: claimId(WASM_URL, "Fix."), concern: claimId(WASM_URL, "Problem.") },
      ]),
    ]);
    expect(scalar(d, "MATCH ()-[r:ADDRESSES]->() RETURN count(r)")).toBe(0);
  });

  it("does not draw ADDRESSES when the types are not solution and concern", () => {
    const d = db();
    runStatements(d, [buildAddressesStatement([{ solution: concern, concern: solution }])]);
    expect(scalar(d, "MATCH ()-[r:ADDRESSES]->() RETURN count(r)")).toBe(0);
  });
});
