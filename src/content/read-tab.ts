import { isPageReading, type PageReading } from "./page-text";
import { type UnreadableUrlReason, unreadableUrlReason } from "./unreadable-url";

// vite.config.ts の contentScript() が dist/ 直下に出すファイル
const CONTENT_SCRIPT_FILE = "content.js";

export type ReadTabFailureReason =
  | UnreadableUrlReason
  /** スクリプトは動いたが、本文が空だった */
  | "no-text"
  /** タブが無い、注入が拒まれた、結果が期待する形でないなど */
  | "failed";

export type ReadTabResult =
  | { ok: true; page: PageReading }
  | { ok: false; reason: ReadTabFailureReason; message?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * タブの記事のタイトル・URL・本文を読み取る。読めないときも例外にせず理由を返す。
 * activeTab の付与を受けた拡張機能のページ（ツールバーのアイコンで開いた吹き出し）から呼ぶ。
 */
export async function readTab(tabId: number): Promise<ReadTabResult> {
  try {
    const tab = await chrome.tabs.get(tabId);
    // url は activeTab が付与されていないと空なので、そのときは注入を試して結果で判断する
    if (tab.url !== undefined) {
      const fileAccess = await chrome.extension.isAllowedFileSchemeAccess();
      const reason = unreadableUrlReason(tab.url, fileAccess);
      if (reason !== null) return { ok: false, reason };
    }
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
    const page: unknown = injection?.result;
    if (!isPageReading(page)) {
      return { ok: false, reason: "failed", message: "The page script returned no result" };
    }
    if (page.text === "") return { ok: false, reason: "no-text" };
    return { ok: true, page };
  } catch (error) {
    return { ok: false, reason: "failed", message: errorMessage(error) };
  }
}
