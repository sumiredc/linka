// 開発用。抽出の検証（概念名の注記・本文の分割の大きさ）で使う、Nano を呼ばない部分
import type { Extraction } from "../shared/extraction";

export const MAX_CONCEPT_WORDS = 4;

/** 括弧・コロンを含むか、MAX_CONCEPT_WORDS 語より長い概念名。注記や説明が付いたものとみなす */
export function annotationReason(name: string): string | null {
  if (/[()（）[\]]/.test(name)) return "括弧";
  if (/[:：]/.test(name)) return "コロン";
  const words = name.trim().split(/\s+/).length;
  if (words > MAX_CONCEPT_WORDS) return `${words} 語`;
  return null;
}

/** 抽出結果に出てくる概念名（concepts・claims[].concepts・relatedConcepts）を重複なしで並べる */
export function conceptNames(extraction: Extraction): string[] {
  return [
    ...new Set([
      ...extraction.concepts.map((concept) => concept.name),
      ...extraction.claims.flatMap((claim) => claim.concepts),
      ...extraction.relatedConcepts.flatMap((link) => [link.from, link.to]),
    ]),
  ];
}

export function annotatedNames(extraction: Extraction): { name: string; reason: string }[] {
  return conceptNames(extraction).flatMap((name) => {
    const reason = annotationReason(name);
    return reason ? [{ name, reason }] : [];
  });
}

/** HTML から本文の文字列を取り出す（main があれば main、無ければ body。script・style・.badge は除く） */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const element of doc.querySelectorAll("script, style, .badge")) element.remove();
  const root = doc.querySelector("main") ?? doc.body;
  return (root?.textContent ?? "").replace(/\s+/g, " ").trim();
}

export interface ChunkInput {
  contextWindow: number;
  /** 本文を除いた依頼文とスキーマの分 */
  overheadTokens: number;
  /** 出力に残しておく分 */
  outputReserveTokens: number;
  /** 実測した 1 トークンあたりの文字数 */
  charsPerToken: number;
  /** 見積もりのずれに備えて削る割合 */
  margin?: number;
}

/** 1 回の抽出に入れられる本文の大きさ（トークンと文字数）。入らないなら 0 */
export function proposeChunk(input: ChunkInput): { tokens: number; chars: number } {
  const margin = input.margin ?? 0.2;
  const room = input.contextWindow - input.overheadTokens - input.outputReserveTokens;
  const tokens = Math.max(0, Math.floor(room * (1 - margin)));
  return { tokens, chars: Math.floor(tokens * input.charsPerToken) };
}

// 本番の抽出プロンプトはまだ無い（Phase 2 で作る）。ここでは素直な依頼文を「今の書き方」として、
// 概念名を名前だけにさせる指示を足した版と比べる
const BASE_INSTRUCTIONS =
  "Extract from this web page: a short summary, the technical concepts it discusses (name and category), the authors, the claims it makes (statement, type, and the names of the concepts each claim is about), and pairs of related concepts. Claim types: benefit, concern, solution, fact.";

const BARE_NAME_INSTRUCTIONS =
  'Concept names must be bare names as written in the page, such as "IndexedDB", "Web Worker" or "Storage quota": at most 4 words, with no parentheses, no colons, and no explanation, translation, abbreviation expansion or guess added to the name. Refer to each concept with exactly the same name everywhere.';

export const EXTRACTION_PROMPTS = [
  { id: "base", label: "今の書き方", instructions: BASE_INSTRUCTIONS },
  {
    id: "bare",
    label: "概念名は名前だけ、と指示",
    instructions: `${BASE_INSTRUCTIONS}\n${BARE_NAME_INSTRUCTIONS}`,
  },
] as const;

export function extractionPrompt(instructions: string, title: string, text: string): string {
  return `${instructions}\n\nTitle: ${title}\n\n${text}`;
}
