import { describe, expect, it } from "vitest";
import { openMemoryDb, run } from "./test/relate-node";
import { detectWrite } from "./write-detection";

describe("detectWrite: write clauses", () => {
  const writes: [string, string][] = [
    ["CREATE (n:Page {url: 'x'})", "CREATE"],
    ["MERGE (n:Concept {key: 'x'})", "MERGE"],
    ["INSERT (:Page {url: 'x'})", "INSERT"],
    ["MATCH (n) SET n.x = 1", "SET"],
    ["MATCH (n) DELETE n", "DELETE"],
    ["MATCH (n) DETACH DELETE n", "DETACH"],
    ["MATCH (n) REMOVE n.x", "REMOVE"],
    ["MATCH (n) FOREACH (x IN [1] | SET n.y = x)", "FOREACH"],
    ["LOAD CSV FROM 'file:///x.csv' AS row RETURN row", "LOAD"],
    ["DROP INDEX page_url", "DROP"],
  ];

  for (const [query, keyword] of writes) {
    it(`detects ${keyword} in: ${query}`, () => {
      expect(detectWrite(query)).toEqual({ kind: "clause", keyword });
    });
  }

  it("detects a keyword regardless of case", () => {
    expect(detectWrite("match (n) detach delete n")).toEqual({ kind: "clause", keyword: "DETACH" });
  });

  it("detects a write inside a CALL subquery", () => {
    expect(detectWrite("MATCH (n) CALL (n) { SET n.z = 1 } RETURN 1")).toEqual({
      kind: "clause",
      keyword: "SET",
    });
  });

  it("detects a write that follows a read part of the query", () => {
    expect(detectWrite("MATCH (p:Page) WITH p LIMIT 1 CREATE (p)-[:X]->(:Y) RETURN p")).toEqual({
      kind: "clause",
      keyword: "CREATE",
    });
  });

  it("detects a write placed right after a comment", () => {
    expect(detectWrite("MATCH (n) /* read only */DELETE n")).toEqual({
      kind: "clause",
      keyword: "DELETE",
    });
  });

  it("detects a write on the line after a line comment", () => {
    expect(detectWrite("MATCH (n) // just reading\nDELETE n")).toEqual({
      kind: "clause",
      keyword: "DELETE",
    });
  });

  it("detects a write after a string that contains an escaped quote", () => {
    expect(detectWrite("MATCH (n {name: 'it\\'s'}) DELETE n")).toEqual({
      kind: "clause",
      keyword: "DELETE",
    });
  });
});

describe("detectWrite: words that are not clauses", () => {
  const reads: [string, string][] = [
    [
      "a single-quoted string",
      "MATCH (c:Claim) WHERE c.statement CONTAINS 'CREATE INDEX' RETURN c",
    ],
    ["a double-quoted string", 'MATCH (c:Claim) WHERE c.statement = "DELETE me" RETURN c'],
    ["a line comment", "MATCH (n) RETURN n // never DELETE"],
    ["a block comment", "MATCH (n) /* SET n.x = 1 */ RETURN n"],
    ["a backtick-quoted name", "MATCH (n) RETURN n.`delete` AS `CREATE`"],
    ["a property name", "MATCH (n) WHERE n.set = 1 RETURN n.create, n.merge"],
    ["a label", "MATCH (n:Set:Merge) RETURN n"],
    ["a relationship type", "MATCH ()-[r:CREATE]->() RETURN r"],
    ["a parameter", "MATCH (n) WHERE n.x = $delete RETURN n"],
    ["a map key", "RETURN {set: 1, create: 2} AS m"],
    ["a map projection", "MATCH (n) RETURN n {.remove} AS m"],
    ["a longer word", "MATCH (n) WHERE n.x = 1 RETURN n.created AS createdAt, n.settings"],
  ];

  for (const [where, query] of reads) {
    it(`ignores a write keyword in ${where}`, () => {
      expect(detectWrite(query)).toBeNull();
    });
  }

  it("accepts a typical read query from UC3", () => {
    const query = [
      "MATCH (s:Claim {type: 'solution'})-[:ADDRESSES]->(c:Claim {type: 'concern'})-[:ABOUT]->(k:Concept)",
      "WHERE k.key = 'webassembly'",
      "MATCH (p:Page)-[:ASSERTS]->(s)",
      "RETURN p.title, p.url, s.statement ORDER BY p.title LIMIT 50",
    ].join("\n");
    expect(detectWrite(query)).toBeNull();
  });

  it("accepts a read-only CALL subquery", () => {
    expect(detectWrite("CALL () { MATCH (n) RETURN n } RETURN count(n)")).toBeNull();
  });
});

describe("detectWrite: procedures", () => {
  it("accepts a procedure that reads the schema", () => {
    expect(detectWrite("CALL db.labels() YIELD label RETURN label")).toBeNull();
  });

  it("rejects a procedure that writes", () => {
    expect(detectWrite("CALL db.createLabel('X')")).toEqual({
      kind: "procedure",
      name: "db.createLabel",
    });
  });

  it("rejects a procedure that is not on the read list", () => {
    expect(detectWrite("CALL db.checkpoint()")).toEqual({
      kind: "procedure",
      name: "db.checkpoint",
    });
  });
});

describe("detectWrite: unterminated input", () => {
  it("rejects an unterminated string, which could hide where a clause starts", () => {
    expect(detectWrite("MATCH (n) WHERE n.x = 'abc RETURN n")).toEqual({ kind: "unterminated" });
  });

  it("rejects an unterminated block comment", () => {
    expect(detectWrite("MATCH (n) /* RETURN n")).toEqual({ kind: "unterminated" });
  });

  it("rejects an unterminated backtick name", () => {
    expect(detectWrite("MATCH (n) RETURN n.`x")).toEqual({ kind: "unterminated" });
  });
});

describe("detectWrite against Relate", () => {
  it("covers INSERT because Relate executes it as a write", () => {
    const db = openMemoryDb();
    const query = "INSERT (:Page {url: 'x'})";
    run(db, query);
    expect(run(db, "MATCH (n) RETURN count(n) AS n").rows).toEqual([{ n: 1 }]);
    expect(detectWrite(query)).not.toBeNull();
  });
});
