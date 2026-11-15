/** ページから読み取った記事。ページに注入したスクリプトが返し、拡張機能のページが受け取る */
export type PageReading = {
  url: string;
  title: string;
  text: string;
};

/**
 * 読み取った本文の空白を揃える。行の前後の空白を除き、空行は 1 行までにする。
 * 段落の切れ目（空行）は分割（chunkText）が使うので残す。
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Readability の本文を使い、空なら body の innerText に戻す */
export function chooseText(articleText: string | null, bodyText: string): string {
  const article = articleText === null ? "" : normalizeText(articleText);
  return article !== "" ? article : normalizeText(bodyText);
}

export function isPageReading(value: unknown): value is PageReading {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.url === "string" &&
    typeof record.title === "string" &&
    typeof record.text === "string"
  );
}
