// ツールバーのアイコンを押すと開く吹き出し。開いた時点で今のタブを読み取り、記憶を依頼する。
const status = document.querySelector("#status")!;
const detail = document.querySelector("#detail")!;
const next = document.querySelector("#next")!;
const show = (s: string, d = "", n = "") => {
  status.textContent = s;
  detail.textContent = d;
  next.textContent = n;
  (next as HTMLElement).hidden = !n;
};

async function readActiveTab() {
  // ?test=1 は自動確認用。アイコンのクリックを Playwright から起こせないため、ページの読み取りを省く。
  if (new URLSearchParams(location.search).has("test")) {
    return { url: "https://example.com/test", title: "Test page", text: "OPFS sync access handles are exclusive." };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("今のタブが見つかりません");
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ url: location.href, title: document.title, text: document.body.innerText.slice(0, 20000) }),
  });
  return res.result as { url: string; title: string; text: string };
}

// sidePanel.open はクリック直後に呼ばないと開けないので、ウィンドウ ID は先に取っておく
let windowId: number | undefined;
chrome.windows.getCurrent().then((w) => (windowId = w.id));
document.querySelector("#open-panel")!.addEventListener("click", () => {
  if (windowId === undefined) return;
  chrome.sidePanel.open({ windowId }).then(() => window.close());
});

(async () => {
  try {
    show("ページを読み取っています…");
    const page = await readActiveTab();
    const r = chrome.runtime.sendMessage({ to: "background", type: "clip", page, delayMs: 4000, useAi: true });
    show(
      "記憶しています…",
      `${page.title}\n本文 ${page.text.length} 文字を読み取りました。`,
      "今すぐページをクリックしてこの吹き出しを閉じてください。閉じても処理が続くかを確かめます。",
    );
    const res = await r;
    if (!res?.ok) return show("失敗しました", String(res?.error ?? JSON.stringify(res)));
    show("記憶しました", "吹き出しを開いたままでも完了しました。閉じた場合の確認は、もう一度別のページで試してください。");
    (globalThis as unknown as { done: unknown }).done = res;
  } catch (e) {
    show("失敗しました", e instanceof Error ? e.message : String(e));
  }
})();
