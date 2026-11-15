const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "CAPTION",
  "CENTER",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LEGEND",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TR",
  "UL",
]);

const CELL_TAGS = new Set(["TD", "TH"]);

// Readability の textContent は段落の切れ目を失うので、ブロック要素の前後に空行を入れて文字にする
function collectText(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push((node.textContent ?? "").replace(/\s+/g, " "));
    return;
  }
  if (!(node instanceof Element)) return;
  if (node.tagName === "BR") {
    out.push("\n");
    return;
  }
  const block = BLOCK_TAGS.has(node.tagName);
  if (block) out.push("\n\n");
  for (const child of node.childNodes) collectText(child, out);
  if (block) out.push("\n\n");
  else if (CELL_TAGS.has(node.tagName)) out.push(" ");
}

/** HTML の文字列を、ブロック要素の切れ目を空行にした文字にする（空白は normalizeText で揃える前のまま） */
export function htmlToText(html: string): string {
  // DOMParser で作った文書は表示されず、スクリプトも動かない
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  collectText(parsed.body, out);
  return out.join("");
}
