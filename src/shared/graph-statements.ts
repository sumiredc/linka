import { claimId, normalizeStatement } from "./claim-id";
import { normalizeConceptKey } from "./concept-key";
import { type CypherStatement, wellFormedValue } from "./cypher";
import type { Clip } from "./extraction";
import { normalizePersonName } from "./person-name";
import { normalizeUrl } from "./url";

type ConceptRow = {
  key: string;
  name: string;
  /** Claim や関係からだけ参照された Concept には分類が無い */
  category: string | null;
};

class ConceptCollector {
  readonly #rows = new Map<string, ConceptRow>();

  /**
   * 同じ key の 2 回目以降は無視する。分類のある `concepts` を先に足すこと。
   * `-` や空白だけの名前は key が空になるので足さずに null を返す（空の key に寄せ集めないため）
   */
  add(name: string, category: string | null): string | null {
    const key = normalizeConceptKey(name);
    if (key === "") return null;
    if (!this.#rows.has(key)) this.#rows.set(key, { key, name: name.trim(), category });
    return key;
  }

  rows(): ConceptRow[] {
    return [...this.#rows.values()];
  }
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

/** 1 回分のクリップがグラフに書く行。ノードは MERGE のキーで、関係は両端のキーで表す */
export type ClipRows = ReturnType<typeof clipRows>;

/** クリップを、グラフに書く行に揃える。{@link buildClipStatements} はこの行をそのまま書く */
export function clipRows(input: Clip) {
  // 抽出結果に壊れたサロゲートがあっても、パラメータと埋め込みの両方で同じ値（U+FFFD）にする
  const clip = wellFormedValue(input);
  const url = normalizeUrl(clip.url);
  const { extraction } = clip;
  const concepts = new ConceptCollector();
  for (const concept of extraction.concepts) concepts.add(concept.name, concept.category);

  const claims = uniqueBy(
    extraction.claims.map((claim) => ({
      id: claimId(url, claim.statement),
      statement: normalizeStatement(claim.statement),
      type: claim.type,
      conceptKeys: claim.concepts.flatMap((name) => concepts.add(name, null) ?? []),
    })),
    (claim) => claim.id,
  );
  const about = uniqueBy(
    claims.flatMap((claim) => claim.conceptKeys.map((concept) => ({ claim: claim.id, concept }))),
    (link) => `${link.claim}\n${link.concept}`,
  );
  // RELATED_TO は向きを持たない関係として扱い、key の小さい方から張って重複を防ぐ
  const related = uniqueBy(
    extraction.relatedConcepts.flatMap(({ from, to }) => {
      const [a, b] = [concepts.add(from, null), concepts.add(to, null)];
      if (a === null || b === null || a === b) return [];
      return [a < b ? { from: a, to: b } : { from: b, to: a }];
    }),
    (link) => `${link.from}\n${link.to}`,
  );
  const authors = [...new Set(extraction.authors.map(normalizePersonName))].filter(
    (name) => name !== "",
  );

  const page = {
    url,
    title: clip.title,
    summary: extraction.summary,
    clippedAt: clip.clippedAt,
    source: clip.source,
  };
  return {
    url,
    source: clip.source,
    page,
    concepts: concepts.rows(),
    authors,
    claims,
    about,
    related,
  };
}

/**
 * 1 回分のクリップを、パラメータ付きの MERGE 文の並びにする。同じクリップを何度流してもノードと関係は増えない。
 * 再クリップでは、先に {@link buildReclipStatements} で古い内容を消してから流す。
 */
export function buildClipStatements(input: Clip): CypherStatement[] {
  const {
    url,
    source,
    page,
    concepts: conceptRows,
    authors,
    claims,
    about,
    related,
  } = clipRows(input);
  const statements: CypherStatement[] = [
    {
      // 選択範囲のクリップは既存の Page に Claim を足すだけで、ページ全体の要約などは上書きしない
      query:
        source === "selection"
          ? "MERGE (p:Page {url: $page.url})\nON CREATE SET p += $page"
          : "MERGE (p:Page {url: $page.url})\nSET p += $page",
      params: { page },
    },
  ];
  if (conceptRows.length > 0) {
    statements.push({
      query: [
        "MATCH (p:Page {url: $url})",
        "UNWIND $concepts AS concept",
        "MERGE (c:Concept {key: concept.key})",
        "SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)",
        "MERGE (p)-[:MENTIONS]->(c)",
      ].join("\n"),
      params: { url, concepts: conceptRows },
    });
  }
  if (authors.length > 0) {
    statements.push({
      query: [
        "MATCH (p:Page {url: $url})",
        "UNWIND $authors AS name",
        "MERGE (a:Person {name: name})",
        "MERGE (p)-[:AUTHORED_BY]->(a)",
      ].join("\n"),
      params: { url, authors },
    });
  }
  if (claims.length > 0) {
    statements.push({
      query: [
        "MATCH (p:Page {url: $url})",
        "UNWIND $claims AS claim",
        "MERGE (c:Claim {id: claim.id})",
        // ページ全体の抽出が利用者の選んだ文と同じ文を出しても、選択範囲の由来を上書きしない
        "SET c.statement = claim.statement, c.type = claim.type,",
        "  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE $source END",
        "MERGE (p)-[:ASSERTS]->(c)",
      ].join("\n"),
      params: {
        url,
        source,
        claims: claims.map(({ id, statement, type }) => ({ id, statement, type })),
      },
    });
  }
  if (about.length > 0) {
    statements.push({
      query: [
        "UNWIND $about AS link",
        "MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})",
        "MERGE (c)-[:ABOUT]->(k)",
      ].join("\n"),
      params: { about },
    });
  }
  if (related.length > 0) {
    statements.push({
      query: [
        "UNWIND $related AS link",
        "MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})",
        "MERGE (a)-[:RELATED_TO]->(b)",
      ].join("\n"),
      params: { related },
    });
  }
  return statements;
}

/**
 * 再クリップの前に流す文。そのページ全体から抽出した Claim（`page` と `sample`）と、
 * それに付いた ABOUT・ADDRESSES、ページの MENTIONS・AUTHORED_BY を消す。
 * 選択範囲から足した Claim と、他のページも参照しうる Concept・Person は残し、
 * 残した Claim が ABOUT で指す Concept への MENTIONS は張り直す。
 * Concept 同士の RELATED_TO はページをまたいで積み上がるもので、ページの持ち物ではないので消さない。
 */
export function buildReclipStatements(pageUrl: string): CypherStatement[] {
  const url = normalizeUrl(pageUrl);
  return [
    {
      query: [
        "MATCH (p:Page {url: $url})-[:ASSERTS]->(c:Claim)",
        "WHERE coalesce(c.source, '') <> 'selection'",
        "DETACH DELETE c",
      ].join("\n"),
      params: { url },
    },
    {
      query: "MATCH (p:Page {url: $url})-[r:MENTIONS|AUTHORED_BY]->()\nDELETE r",
      params: { url },
    },
    {
      query: [
        "MATCH (p:Page {url: $url})-[:ASSERTS]->(:Claim {source: 'selection'})-[:ABOUT]->(k:Concept)",
        "MERGE (p)-[:MENTIONS]->(k)",
      ].join("\n"),
      params: { url },
    },
  ];
}

/** 「solution が concern を解決する」組。値は Claim の id。 */
export interface AddressesLink {
  solution: string;
  concern: string;
}

/** UC2 で判定する組の数の上限（PRD UC2）。新しいページの Claim 1 つにつき、と記憶 1 回の合計 */
export const CANDIDATE_LIMITS = { perClaim: 5, total: 10 } as const;

/** ADDRESSES の片端の Claim と、それを ASSERTS するページ */
export type ConnectionEnd = { id: string; statement: string; pageUrl: string; pageTitle: string };

/** 判定する組。`concepts` は両方の Claim が ABOUT で指す Concept の名前 */
export type AddressesCandidate = {
  solution: ConnectionEnd;
  concern: ConnectionEnd;
  concepts: string[];
};

/** 組の両端の列。候補を集める文とつながりを読む文で同じ列名にする */
const PAIR_COLUMNS = [
  "s.id AS solution, s.statement AS solutionStatement, sp.url AS solutionPage, sp.title AS solutionTitle,",
  "c.id AS concern, c.statement AS concernStatement, cp.url AS concernPage, cp.title AS concernTitle",
].join("\n");

/**
 * UC2 で判定する組を集める文。そのページの solution と別のページの concern、そのページの concern と別のページの solution で、
 * 同じ Concept を ABOUT で指すものを集める。すでに ADDRESSES がある組は除く。
 * 共有する Concept の多い組から、ページの Claim 1 つにつき `perClaim` 組、合わせて `total` 組まで返す
 */
export function buildAddressesCandidatesStatement(
  pageUrl: string,
  limits: { perClaim: number; total: number } = CANDIDATE_LIMITS,
): CypherStatement {
  return {
    query: [
      "MATCH (p:Page {url: $url})-[:ASSERTS]->(n:Claim)-[:ABOUT]->(k:Concept)<-[:ABOUT]-(o:Claim)<-[:ASSERTS]-(op:Page)",
      "WHERE op.url <> $url",
      "  AND ((n.type = 'solution' AND o.type = 'concern') OR (n.type = 'concern' AND o.type = 'solution'))",
      "WITH p, n, o, op, collect(DISTINCT k.name) AS concepts",
      "WITH n, concepts,",
      "  CASE WHEN n.type = 'solution' THEN n ELSE o END AS s, CASE WHEN n.type = 'solution' THEN p ELSE op END AS sp,",
      "  CASE WHEN n.type = 'solution' THEN o ELSE n END AS c, CASE WHEN n.type = 'solution' THEN op ELSE p END AS cp,",
      "  o.id AS other",
      // Relate 1.0.1 では、同じ WITH で付けた名前をパターンの条件から参照できないので、WITH を分ける
      "WITH n, s, sp, c, cp, concepts, other",
      "WHERE NOT (s)-[:ADDRESSES]->(c)",
      "WITH n, s, sp, c, cp, concepts ORDER BY size(concepts) DESC, other",
      "WITH n, collect({s: s, sp: sp, c: c, cp: cp, concepts: concepts})[0..$perClaim] AS picked",
      "UNWIND picked AS pair",
      "WITH n, pair ORDER BY size(pair.concepts) DESC, n.id, pair.c.id, pair.s.id",
      "LIMIT $total",
      "WITH pair.s AS s, pair.sp AS sp, pair.c AS c, pair.cp AS cp, pair.concepts AS concepts",
      `RETURN ${PAIR_COLUMNS}, concepts`,
    ].join("\n"),
    params: { url: normalizeUrl(pageUrl), perClaim: limits.perClaim, total: limits.total },
  };
}

function connectionEnd(
  row: Record<string, unknown>,
  side: "solution" | "concern",
): ConnectionEnd | null {
  const id = row[side];
  const statement = row[`${side}Statement`];
  const pageUrl = row[`${side}Page`];
  const pageTitle = row[`${side}Title`];
  if (typeof id !== "string" || typeof statement !== "string" || typeof pageUrl !== "string") {
    return null;
  }
  return { id, statement, pageUrl, pageTitle: typeof pageTitle === "string" ? pageTitle : pageUrl };
}

/** {@link buildAddressesCandidatesStatement} と {@link buildConnectionsStatement} の行を組にする。形の違う行は飛ばす */
export function toAddressesCandidates(
  rows: readonly Record<string, unknown>[],
): AddressesCandidate[] {
  return rows.flatMap((row) => {
    const solution = connectionEnd(row, "solution");
    const concern = connectionEnd(row, "concern");
    if (!solution || !concern) return [];
    const concepts = Array.isArray(row.concepts)
      ? row.concepts.filter((name): name is string => typeof name === "string")
      : [];
    return [{ solution, concern, concepts }];
  });
}

/** 与えた組のうち、グラフに ADDRESSES があるものを、両端の文とページとともに読む文 */
export function buildConnectionsStatement(links: readonly AddressesLink[]): CypherStatement {
  return {
    query: [
      "UNWIND $links AS link",
      "MATCH (sp:Page)-[:ASSERTS]->(s:Claim {id: link.solution})-[:ADDRESSES]->(c:Claim {id: link.concern})<-[:ASSERTS]-(cp:Page)",
      `RETURN DISTINCT ${PAIR_COLUMNS}`,
    ].join("\n"),
    params: { links: links.map(({ solution, concern }) => ({ solution, concern })) },
  };
}

/** 与えた組の ADDRESSES を消す文。UC2 で張りかけたつながりを書き込みの失敗で戻すのに使う */
export function buildRemoveAddressesStatement(links: readonly AddressesLink[]): CypherStatement {
  return {
    query: [
      "UNWIND $links AS link",
      "MATCH (:Claim {id: link.solution})-[r:ADDRESSES]->(:Claim {id: link.concern})",
      "DELETE r",
    ].join("\n"),
    params: { links: links.map(({ solution, concern }) => ({ solution, concern })) },
  };
}

/**
 * ADDRESSES を張る文。種類が solution → concern で、別々のページの Claim の組にだけ張る（PRD §5）。
 * 条件に合わない組は黙って飛ばす。
 */
export function buildAddressesStatement(links: readonly AddressesLink[]): CypherStatement {
  return {
    query: [
      "UNWIND $links AS link",
      "MATCH (sp:Page)-[:ASSERTS]->(s:Claim {id: link.solution}),",
      "  (cp:Page)-[:ASSERTS]->(c:Claim {id: link.concern})",
      "WHERE s.type = 'solution' AND c.type = 'concern' AND sp.url <> cp.url",
      "MERGE (s)-[:ADDRESSES]->(c)",
    ].join("\n"),
    params: { links: links.map(({ solution, concern }) => ({ solution, concern })) },
  };
}
