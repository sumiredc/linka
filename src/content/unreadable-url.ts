/** 注入する前に URL だけで分かる、ページを読めない理由 */
export type UnreadableUrlReason =
  /** chrome:// などブラウザ自身のページや、http(s)・file 以外のページ。拡張機能はスクリプトを実行できない */
  | "restricted"
  /** Chrome ウェブストア。拡張機能はスクリプトを実行できない */
  | "web-store"
  /** file:// のページで、拡張機能の詳細で「ファイルの URL へのアクセスを許可する」が切られている */
  | "file-access";

function isWebStore(url: URL): boolean {
  if (url.hostname === "chromewebstore.google.com") return true;
  return (
    url.hostname === "chrome.google.com" &&
    (url.pathname === "/webstore" || url.pathname.startsWith("/webstore/"))
  );
}

/**
 * URL だけで読めないと分かるときにその理由を、注入を試してよいときは null を返す。
 * null でも注入が失敗することはある（ほかの拡張機能のページ、ポリシーで禁止されたサイトなど）。
 */
export function unreadableUrlReason(
  rawUrl: string,
  fileAccessAllowed: boolean,
): UnreadableUrlReason | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "restricted";
  }
  if (url.protocol === "file:") return fileAccessAllowed ? null : "file-access";
  // chrome:・chrome-extension:・about:・devtools:・view-source:・data: など
  if (url.protocol !== "http:" && url.protocol !== "https:") return "restricted";
  if (isWebStore(url)) return "web-store";
  return null;
}
