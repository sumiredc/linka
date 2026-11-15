// scripting.executeScript でページに注入するスクリプトの入口。vite.config.ts で IIFE の
// dist/content.js に単独でビルドし、最後に評価した readPage() の値が注入の結果になる
import { Readability } from "@mozilla/readability";
import { chooseText, type PageReading } from "./page-text";

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
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
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TR",
  "UL",
]);

// Readability の textContent は段落の切れ目を失うので、ブロック要素の前後に空行を入れて文字にする
function collectText(node: Node, inPre: boolean, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    out.push(inPre ? text : text.replace(/\s+/g, " "));
    return;
  }
  if (!(node instanceof Element)) return;
  if (node.tagName === "BR") {
    out.push("\n");
    return;
  }
  const block = BLOCK_TAGS.has(node.tagName);
  const pre = inPre || node.tagName === "PRE";
  if (block) out.push("\n\n");
  for (const child of node.childNodes) collectText(child, pre, out);
  if (block) out.push("\n\n");
}

function htmlToText(html: string): string {
  // DOMParser で作った文書は表示されず、スクリプトも動かない
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  collectText(parsed.body, false, out);
  return out.join("");
}

function readArticle(): { title: string; text: string } | null {
  try {
    // parse() は渡した文書を書き換えるので、表示中の文書ではなく複製を渡す
    const article = new Readability(document.cloneNode(true) as Document).parse();
    if (!article?.content) return null;
    return { title: article.title ?? "", text: htmlToText(article.content) };
  } catch {
    return null;
  }
}

export function readPage(): PageReading {
  const article = readArticle();
  // biome-ignore lint/performance/useDomNodeTextContent: 表示されていない要素を除き、改行を保つ表示上の文字が要る
  const bodyText = document.body?.innerText ?? "";
  return {
    url: location.href,
    title: article?.title || document.title,
    text: chooseText(article?.text ?? null, bodyText),
  };
}
