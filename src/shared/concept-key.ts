/**
 * 機械的な正規化のあとで、同じものを指す別名を 1 つの key に寄せる表。
 * 左右とも {@link mechanicalConceptKey} を通した形で書く（テストで確かめている）。
 * 寄せ先が別の別名になる連鎖は作らない。
 * 表を変えても、すでにグラフにある key は書き換わらない（新しいクリップから効く）。
 */
export const CONCEPT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  wasm: "webassembly",
  js: "javascript",
  ecmascript: "javascript",
  ts: "typescript",
  nodejs: "node.js",
  node: "node.js",
  k8s: "kubernetes",
  postgres: "postgresql",
  originprivatefilesystem: "opfs",
  llms: "llm",
  largelanguagemodel: "llm",
  largelanguagemodels: "llm",
  webworker: "webworkers",
  serviceworkers: "serviceworker",
});

/**
 * 別名表を引く前の key。互換文字を揃え（NFKC）、小文字にし、空白・ハイフン類・
 * アンダースコアを取り除く。`Web Assembly` と `web-assembly` と `WebAssembly` はここで同じになる。
 * ドットは `.NET` や `Next.js` のように名前の一部なので残す。
 */
export function mechanicalConceptKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{Pd}_]+/gu, "");
}

/** Concept の MERGE キー。 */
export function normalizeConceptKey(name: string): string {
  const key = mechanicalConceptKey(name);
  return CONCEPT_ALIASES[key] ?? key;
}
