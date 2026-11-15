import { normalizeStatement } from "./claim-id";
import { normalizeConceptKey } from "./concept-key";
import { EXTRACTION_LIMITS, type Extraction } from "./extraction";
import { normalizePersonName } from "./person-name";

type Claim = Extraction["claims"][number];

/** どの分割でも `concepts` に挙げられず、Claim や関係からだけ参照された Concept の分類 */
export const UNLISTED_CATEGORY = "other";

/** 各リストの 1 件目を順に、次に 2 件目を順に…と並べる。上限で切るときに、前の分割だけが残らないようにする */
function interleave<T>(lists: readonly (readonly T[])[]): T[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const result: T[] = [];
  for (let index = 0; index < longest; index++) {
    for (const list of lists) {
      const item = list[index];
      if (item !== undefined) result.push(item);
    }
  }
  return result;
}

/**
 * 分割した本文ごとの抽出結果を、1 ページ分の抽出結果にまとめる。
 *
 * - Concept は {@link normalizeConceptKey} の key で 1 つにし、最初に出た名前と分類を使う。
 *   Claim と関係から参照する名前も、その名前に揃える。key が空になる名前は捨てる
 * - Claim と関係が参照するだけで、どの分割の `concepts` にも無い Concept は、分類を
 *   {@link UNLISTED_CATEGORY} にして加える（挙げられた Concept の名前と分類が優先する）
 * - 上限を超える Concept は、Claim と関係からの参照が少ないものから捨てる。同数なら、挙げられたものを
 *   interleave の順に、次に参照だけのものを最初に参照された順に残す。
 *   捨てた Concept への参照と、その端を失った関係も捨てる（グラフに分類の無い Concept を作らないため）
 * - Person は {@link normalizePersonName} で揃えて重複を除き、揃えてスキーマの長さを超えた名前は捨てる
 * - Claim は空白を揃えた文が同じなら 1 つにし（Claim の id と同じ判定）、参照する Concept を合わせる。種類は最初のものを使う
 * - 関係は向きを区別せずに重複を除き、同じ Concept 同士の関係は捨てる
 * - summary は最初の空でないもの（記事の冒頭を含む分割の要約）を使う
 *
 * 結果は {@link EXTRACTION_LIMITS} の件数に収める。
 */
export function mergeExtractions(extractions: readonly Extraction[]): Extraction {
  const names = new Map<string, string>();
  const canonical = (name: string): string | null => {
    const key = normalizeConceptKey(name);
    if (key === "") return null;
    if (!names.has(key)) names.set(key, name.trim());
    return key;
  };

  const concepts = new Map<string, string>();
  for (const concept of interleave(extractions.map((e) => e.concepts))) {
    const key = canonical(concept.name);
    if (key !== null && !concepts.has(key)) concepts.set(key, concept.category);
  }

  const claims = new Map<string, { claim: Claim; conceptKeys: Set<string> }>();
  for (const claim of interleave(extractions.map((e) => e.claims))) {
    const id = normalizeStatement(claim.statement);
    if (id === "") continue;
    const entry = claims.get(id) ?? { claim, conceptKeys: new Set<string>() };
    claims.set(id, entry);
    for (const name of claim.concepts) {
      const key = canonical(name);
      if (key !== null) entry.conceptKeys.add(key);
    }
  }

  const related = new Map<string, [string, string]>();
  for (const link of interleave(extractions.map((e) => e.relatedConcepts))) {
    const [a, b] = [canonical(link.from), canonical(link.to)];
    if (a === null || b === null || a === b) continue;
    const pair = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    if (!related.has(pair)) related.set(pair, [a, b]);
  }

  // NFKC で 1 文字が数文字に広がり、スキーマの長さを超える名前がありうる
  const authors = [
    ...new Set(interleave(extractions.map((e) => e.authors)).map(normalizePersonName)),
  ].filter((name) => name !== "" && name.length <= EXTRACTION_LIMITS.authorNameLength);

  const keptClaims = [...claims.values()].slice(0, EXTRACTION_LIMITS.claims);
  const references = new Map<string, number>();
  const count = (key: string) => {
    references.set(key, (references.get(key) ?? 0) + 1);
    // Nano は concepts に挙げずに Claim や関係で概念を名指しすることが多い。捨てると UC2 のつながりが減る
    if (!concepts.has(key)) concepts.set(key, UNLISTED_CATEGORY);
  };
  for (const { conceptKeys } of keptClaims) for (const key of conceptKeys) count(key);
  for (const [from, to] of related.values()) {
    count(from);
    count(to);
  }
  // 参照の多いものから残す。Array.prototype.sort は安定なので、同数なら interleave の順のまま
  const kept = new Map(
    [...concepts]
      .sort(([a], [b]) => (references.get(b) ?? 0) - (references.get(a) ?? 0))
      .slice(0, EXTRACTION_LIMITS.concepts),
  );

  const nameOf = (key: string) => names.get(key) ?? key;
  return {
    summary: extractions.map((e) => e.summary.trim()).find((summary) => summary !== "") ?? "",
    concepts: [...kept].map(([key, category]) => ({ name: nameOf(key), category })),
    authors: authors.slice(0, EXTRACTION_LIMITS.authors),
    claims: keptClaims.map(({ claim, conceptKeys }) => ({
      statement: claim.statement,
      type: claim.type,
      concepts: [...conceptKeys]
        .filter((key) => kept.has(key))
        .slice(0, EXTRACTION_LIMITS.conceptsPerClaim)
        .map(nameOf),
    })),
    relatedConcepts: [...related.values()]
      .filter(([from, to]) => kept.has(from) && kept.has(to))
      .slice(0, EXTRACTION_LIMITS.relatedConcepts)
      .map(([from, to]) => ({ from: nameOf(from), to: nameOf(to) })),
  };
}
