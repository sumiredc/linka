import { claimId, normalizeStatement } from "./claim-id";
import { normalizeConceptKey } from "./concept-key";
import type { CypherStatement } from "./cypher";
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

/**
 * 1 回分のクリップを、パラメータ付きの MERGE 文の並びにする。同じクリップを何度流してもノードと関係は増えない。
 * 再クリップでは、先に {@link buildReclipStatements} で古い内容を消してから流す。
 */
export function buildClipStatements(clip: Clip): CypherStatement[] {
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
  const statements: CypherStatement[] = [
    {
      // 選択範囲のクリップは既存の Page に Claim を足すだけで、ページ全体の要約などは上書きしない
      query:
        clip.source === "selection"
          ? "MERGE (p:Page {url: $page.url})\nON CREATE SET p += $page"
          : "MERGE (p:Page {url: $page.url})\nSET p += $page",
      params: { page },
    },
  ];
  const conceptRows = concepts.rows();
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
        source: clip.source,
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
 * 選択範囲から足した Claim と、他のページも参照しうる Concept・Person は残す。
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
  ];
}

/** 「solution が concern を解決する」組。値は Claim の id。 */
export interface AddressesLink {
  solution: string;
  concern: string;
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
