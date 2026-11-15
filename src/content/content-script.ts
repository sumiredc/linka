// scripting.executeScript でページに注入するスクリプトの入口。vite.config.ts で IIFE の
// dist/content.js に単独でビルドし、最後に評価した readPage() の値が注入の結果になる
import { Readability } from "@mozilla/readability";
import { htmlToText } from "./html-text";
import { chooseText, type PageReading } from "./page-text";

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
