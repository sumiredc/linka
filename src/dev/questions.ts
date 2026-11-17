// 開発用。Nano に Cypher を書かせる検証（PRD §11 の 10 問）の質問と、グラフの形の説明。
// `reference` は人が書いた答えの Cypher。Nano の結果が正しいかを判断する材料として並べて表示する

export interface Question {
  id: string;
  /** 何を試す質問か（日本語） */
  kind: string;
  text: string;
  reference: string;
}

export const QUESTIONS: readonly Question[] = [
  {
    id: "Q1",
    kind: "概念についての課題の一覧",
    text: "What concerns are there about OPFS?",
    reference: [
      "MATCH (cl:Claim {type: 'concern'})-[:ABOUT]->(c:Concept)",
      "WHERE toLower(c.name) = 'opfs'",
      "RETURN cl.statement AS concern",
    ].join("\n"),
  },
  {
    id: "Q2",
    kind: "課題を解決する解決策",
    text: "Which solutions address concerns about offline support?",
    reference: [
      "MATCH (s:Claim {type: 'solution'})-[:ADDRESSES]->(cl:Claim {type: 'concern'})-[:ABOUT]->(c:Concept)",
      "WHERE toLower(c.name) = 'offline support'",
      "RETURN s.statement AS solution, cl.statement AS concern",
    ].join("\n"),
  },
  {
    id: "Q3",
    kind: "概念に触れるページ",
    text: "Which pages mention IndexedDB?",
    reference: [
      "MATCH (p:Page)-[:MENTIONS]->(c:Concept)",
      "WHERE toLower(c.name) = 'indexeddb'",
      "RETURN p.title AS title, p.url AS url",
    ].join("\n"),
  },
  {
    id: "Q4",
    kind: "ページをまたぐ概念（集計）",
    text: "Which concepts are mentioned by more than three pages?",
    reference: [
      "MATCH (p:Page)-[:MENTIONS]->(c:Concept)",
      "WITH c, count(p) AS pages",
      "WHERE pages > 3",
      "RETURN c.name AS concept, pages",
      "ORDER BY pages DESC",
    ].join("\n"),
  },
  {
    id: "Q5",
    kind: "著者",
    text: "Who wrote the pages that mention SQLite?",
    reference: [
      "MATCH (a:Person)<-[:AUTHORED_BY]-(p:Page)-[:MENTIONS]->(c:Concept)",
      "WHERE toLower(c.name) = 'sqlite'",
      "RETURN DISTINCT a.name AS author, p.title AS title",
    ].join("\n"),
  },
  {
    id: "Q6",
    kind: "件数",
    text: "How many claims of each type are there?",
    reference:
      "MATCH (cl:Claim)\nRETURN cl.type AS type, count(cl) AS claims\nORDER BY claims DESC",
  },
  {
    id: "Q7",
    kind: "2 段の経路（ページ → 解決策 → 課題 → ページ）",
    text: "Which pages propose solutions to the concerns raised on the local-first software page?",
    reference: [
      "MATCH (sp:Page)-[:ASSERTS]->(s:Claim)-[:ADDRESSES]->(cl:Claim)<-[:ASSERTS]-(cp:Page)",
      "WHERE toLower(cp.title) CONTAINS 'local-first'",
      "RETURN DISTINCT sp.title AS page, s.statement AS solution",
    ].join("\n"),
  },
  {
    id: "Q8",
    kind: "概念同士の関係（向きを問わない）",
    text: "Which concepts are related to Web Worker?",
    reference: [
      "MATCH (c:Concept)-[:RELATED_TO]-(other:Concept)",
      "WHERE toLower(c.name) = 'web worker'",
      "RETURN DISTINCT other.name AS concept",
    ].join("\n"),
  },
  {
    id: "Q9",
    kind: "2 つの概念を両方含むページ",
    text: "Which pages mention both OPFS and Web Worker?",
    reference: [
      "MATCH (a:Concept)<-[:MENTIONS]-(p:Page)-[:MENTIONS]->(b:Concept)",
      "WHERE toLower(a.name) = 'opfs' AND toLower(b.name) = 'web worker'",
      "RETURN p.title AS title",
    ].join("\n"),
  },
  {
    id: "Q10",
    kind: "わざと曖昧な質問",
    text: "What should I worry about when storing data in the browser?",
    reference: [
      "MATCH (p:Page)-[:ASSERTS]->(cl:Claim {type: 'concern'})-[:ABOUT]->(c:Concept)",
      "WHERE c.category IN ['storage', 'constraint']",
      "RETURN DISTINCT cl.statement AS concern, p.title AS page",
    ].join("\n"),
  },
];

/**
 * プロンプトに入れるグラフの形。PRD §5 と seed/demo.cypher から書いた。
 * 概念名の一覧は入れない（入れる版は画面のチェックで足す）
 */
export const GRAPH_SCHEMA_PROMPT = `You translate a user's question into exactly one read-only Cypher query for a Relate graph database (openCypher dialect). The graph is a personal knowledge graph built from web pages the user has read.

Node labels and properties (all property values are strings):
- (:Page {url, title, summary, clippedAt, source})  clippedAt is an ISO 8601 string; source is 'page' or 'selection'
- (:Concept {key, name, category})  name is the display name such as 'WebAssembly' or 'Storage quota'; key is the lowercased name without spaces or hyphens such as 'storagequota'
- (:Person {name})  an author of a page
- (:Claim {id, statement, type, source})  statement is one sentence; type is one of 'benefit', 'concern', 'solution', 'fact'

Relationship types:
- (:Page)-[:AUTHORED_BY]->(:Person)
- (:Page)-[:MENTIONS]->(:Concept)
- (:Page)-[:ASSERTS]->(:Claim)
- (:Claim)-[:ABOUT]->(:Concept)
- (:Claim {type: 'solution'})-[:ADDRESSES]->(:Claim {type: 'concern'})  the solution and the concern come from different pages
- (:Concept)-[:RELATED_TO]->(:Concept)  the direction has no meaning; match it without a direction

Concept categories in use: architecture, sync, capability, principle, library, storage, platform, database, constraint, api, runtime, toolchain.

Rules:
- Only read: use MATCH, OPTIONAL MATCH, WHERE, WITH, UNWIND, RETURN, ORDER BY, LIMIT and functions such as count, collect, toLower. Never use CREATE, MERGE, SET, DELETE, REMOVE, FOREACH, LOAD CSV or CALL.
- Match concept names and titles case-insensitively, for example WHERE toLower(c.name) = 'indexeddb' or WHERE toLower(p.title) CONTAINS 'storage'.
- Return readable properties (title, url, name, statement, type) with aliases, not whole nodes.
- Add LIMIT 50 unless the query returns counts.
- Output only the query in the "cypher" field, without a trailing semicolon and without explanations.

Example question: Which claims does the page about Web Locks make?
Example query:
MATCH (p:Page)-[:ASSERTS]->(cl:Claim)
WHERE toLower(p.title) CONTAINS 'web locks'
RETURN cl.type AS type, cl.statement AS statement
LIMIT 50`;

export const CYPHER_RESPONSE_SCHEMA = {
  type: "object",
  properties: { cypher: { type: "string" } },
  required: ["cypher"],
  additionalProperties: false,
};
