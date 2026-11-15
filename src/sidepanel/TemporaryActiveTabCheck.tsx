import { useEffect, useState } from "react";

// 一時的な検証用のコード（issue #10）。サイドパネルのボタンを押すと activeTab が付与されるかを確かめる。
// 結果を PRD に書いたら、このファイルと SidePanel.tsx の呼び出しを消す

async function tryActiveTab(label: string): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return `${label}: アクティブなタブが無い`;
  const head = `${label}: tab ${tab.id} url=${tab.url ?? "(読めない)"}`;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => `${location.href} | ${document.title}`,
    });
    return `${head} / executeScript 成功: ${String(result?.result)}`;
  } catch (error) {
    return `${head} / executeScript 失敗: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function TemporaryActiveTabCheck() {
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((previous) => [...previous, line]);

  // 比べるために、開いた直後（利用者の操作なし）にも 1 回試す
  useEffect(() => {
    void tryActiveTab("開いた直後（操作なし）").then((line) =>
      setLog((previous) => [...previous, line]),
    );
  }, []);

  return (
    <section style={{ border: "2px dashed #c00", padding: 8 }}>
      <strong>一時的な検証（issue #10）: activeTab</strong>
      <div>
        <button
          id="temporary-active-tab"
          type="button"
          onClick={async () => add(await tryActiveTab("ボタンを押した後"))}
        >
          今のタブで executeScript を試す
        </button>{" "}
        <button
          id="temporary-copy"
          type="button"
          onClick={() => navigator.clipboard.writeText(log.join("\n"))}
        >
          記録をコピー
        </button>
      </div>
      <pre style={{ whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>
    </section>
  );
}
