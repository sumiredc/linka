/**
 * 1 回の抽出に渡す本文の最大の文字数。出力に 700 トークンを残し、2 割の余裕を引いた
 * 約 6,700 トークンを、英語の約 4.5 文字/トークンで文字数にしたもの（PRD §7）
 */
export const CHUNK_MAX_CHARS = 30_000;

const PARAGRAPH_BREAK = /\n[^\S\n]*\n/g;
// 和文の句点は後ろに空白が無くても文の終わりとみなす
const SENTENCE_END = /[。！？]|[.!?]["'”’)\]]*(?=\s)/g;
const WHITESPACE = /\s/g;

/** pattern に合う箇所のうち、limit 以下で最も後ろの切れ目の位置（at が start なら一致の先頭、end なら末尾） */
function lastCut(
  window: string,
  pattern: RegExp,
  at: "start" | "end",
  min: number,
  limit: number,
): number | null {
  let found: number | null = null;
  for (const match of window.matchAll(pattern)) {
    const cut = at === "start" ? match.index : match.index + match[0].length;
    if (cut > limit) break;
    if (cut >= min) found = cut;
  }
  return found;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * 本文を maxChars 文字以下の塊に分ける。段落の切れ目、文の終わり、空白の順に切れ目を探し、
 * どれも無いときだけ文字の途中で切る。塊の前後の空白は除き、空の塊は返さない。
 */
export function chunkText(text: string, maxChars: number = CHUNK_MAX_CHARS): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 2) {
    throw new RangeError(`maxChars must be an integer of at least 2: ${maxChars}`);
  }
  const chunks: string[] = [];
  const push = (piece: string) => {
    const trimmed = piece.trim();
    if (trimmed !== "") chunks.push(trimmed);
  };

  let rest = text.trim();
  while (rest.length > maxChars) {
    // 切れ目がちょうど maxChars 文字目の直後にある場合も拾えるよう、1 文字多く見る
    const window = rest.slice(0, maxChars + 1);
    // 段落や文の切れ目が前の方にしか無いときに小さな塊が続かないよう、後ろ半分に限る
    const half = Math.floor(maxChars / 2);
    const cut =
      lastCut(window, PARAGRAPH_BREAK, "start", half, maxChars) ??
      lastCut(window, SENTENCE_END, "end", half, maxChars) ??
      lastCut(window, WHITESPACE, "start", 1, maxChars) ??
      // サロゲートペアの間では切らない
      (isHighSurrogate(rest.charCodeAt(maxChars - 1)) ? maxChars - 1 : maxChars);
    push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  push(rest);
  return chunks;
}
