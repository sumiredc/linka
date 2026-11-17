// テスト用。Nano に Cypher を書かせた検証（PRD §11 の 10 問）の質問と、人が書いた答えの Cypher（`reference`）。
// 質問の種類ごとの Cypher（graph-question.ts）は、この答えを元にした

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
