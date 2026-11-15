import { useRef, useState } from "react";
import {
  createSession,
  environmentText,
  errorText,
  LANGUAGES,
  languageModel,
} from "./language-model";

// 検証 5：権限。`tabs` 無しでタブの URL が読めるか、モデルのダウンロードの開始に利用者の操作が要るか。
// サイドパネルのボタンで activeTab が付くかは、サイドパネルの一時的なボタン（src/sidepanel/TemporaryActiveTabCheck.tsx）で試す

const MANUAL_TEMPLATE = `### 5. 権限（手で確かめた結果）

- manifest の permissions: sidePanel, offscreen, activeTab, scripting, storage（tabs 無し）
- 印（tabs）: タブを切り替え・移動したとき tab.url が読めたか:（記入。下の記録を見る）／ action.setBadgeText({tabId}) の印が出たか:（記入）
- activeTab（サイドパネル）: 開いた直後（操作なし）の executeScript:（記入）／ボタンを押した後:（記入）／吹き出しを一度も開いていないタブで試したか:（はい・いいえ）
- ダウンロードの開始: 最初の availability:（記入）／ 6 秒後の create（操作なし）:（記入）／ クリック直後の create:（記入）`;

function useLog() {
  const [lines, setLines] = useState<string[]>([]);
  const add = (line: string) =>
    setLines((previous) => [...previous, `${new Date().toISOString().slice(11, 19)} ${line}`]);
  return [lines, add] as const;
}

export function PermissionChecks({ onReport }: { onReport: (text: string) => void }) {
  const [tabLog, addTabLog] = useLog();
  const [downloadLog, addDownloadLog] = useLog();
  const watching = useRef(false);

  const describeTab = async (tabId: number, changedUrl: string | undefined, event: string) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      const readable = typeof tab.url === "string" && tab.url !== "";
      // 本番では service worker が URL を見て、記憶済みなら印を付ける。ここでは読めたかだけを印にする
      await chrome.action.setBadgeText({ tabId, text: readable ? "URL" : "?" });
      addTabLog(
        `${event} tab ${tabId}: tab.url=${tab.url ?? "(無し)"} / changeInfo.url=${changedUrl ?? "(無し)"} / title=${tab.title ?? "(無し)"} / 印=${readable ? "URL" : "?"}`,
      );
    } catch (error) {
      addTabLog(`${event} tab ${tabId}: エラー ${errorText(error)}`);
    }
  };

  const startWatching = () => {
    if (watching.current) return;
    watching.current = true;
    chrome.tabs.onActivated.addListener(({ tabId }) => {
      void describeTab(tabId, undefined, "onActivated");
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status !== "complete" && changeInfo.url === undefined) return;
      void describeTab(tabId, changeInfo.url, `onUpdated(${changeInfo.status ?? "url"})`);
    });
    addTabLog("監視を始めた。ほかのタブに切り替えたり、ページを移動したりする");
  };

  const queryAll = async () => {
    const tabs = await chrome.tabs.query({});
    const readable = tabs.filter((tab) => tab.url);
    addTabLog(
      `tabs.query({}): ${tabs.length} タブ中 ${readable.length} タブの url が読める: ${readable.map((tab) => tab.url).join(", ")}`,
    );
  };

  const availability = async () => {
    const api = languageModel();
    if (!api) {
      addDownloadLog("LanguageModel 無し");
      return;
    }
    addDownloadLog(`availability(en): ${await api.availability(LANGUAGES)}`);
  };

  const create = async (label: string) => {
    const activation = (navigator as { userActivation?: { isActive: boolean } }).userActivation;
    addDownloadLog(`${label}: create を呼ぶ。userActivation.isActive=${activation?.isActive}`);
    try {
      let lastPercent = -1;
      const session = await createSession({
        monitor: (monitor) =>
          monitor.addEventListener("downloadprogress", (event) => {
            const percent = Math.floor(event.loaded * 100);
            if (percent >= lastPercent + 10 || percent === 100) {
              lastPercent = percent;
              addDownloadLog(`${label}: downloadprogress ${percent}%`);
            }
          }),
      });
      addDownloadLog(`${label}: create が成功した`);
      session.destroy();
    } catch (error) {
      addDownloadLog(`${label}: create が失敗した ${errorText(error)}`);
    }
  };

  const report = async () => {
    onReport(
      [
        MANUAL_TEMPLATE,
        "",
        "```text",
        await environmentText(),
        "--- tabs の記録 ---",
        ...tabLog,
        "--- ダウンロードの記録 ---",
        ...downloadLog,
        "```",
      ].join("\n"),
    );
  };

  return (
    <section>
      <h2>5. 権限</h2>
      <h3>アイコンの印に tabs が要るか</h3>
      <p>
        監視を始めてから、別のタブ（https のページ）に切り替える・リンクで移動する。tab.url
        が「(無し)」なら
        tabs（またはホスト権限）が要る。ツールバーのアイコンに「URL」か「?」の印が付くかも見る
      </p>
      <button id="watch-tabs" type="button" onClick={startWatching}>
        タブの監視を始める
      </button>{" "}
      <button id="query-tabs" type="button" onClick={queryAll}>
        tabs.query で全タブを読む
      </button>
      <pre id="tab-log">{tabLog.join("\n")}</pre>
      <h3>モデルのダウンロードの開始に利用者の操作が要るか</h3>
      <p>
        availability が downloadable のときだけ意味がある。先に「6 秒後に
        create」（クリックの有効期限が切れてから呼ぶ）、失敗したら「すぐ create」を押す
      </p>
      <button id="availability" type="button" onClick={availability}>
        availability
      </button>{" "}
      <button
        id="create-later"
        type="button"
        onClick={() => setTimeout(() => void create("6 秒後"), 6000)}
      >
        6 秒後に create（操作なし）
      </button>{" "}
      <button id="create-now" type="button" onClick={() => void create("クリック直後")}>
        すぐ create
      </button>
      <pre id="download-log">{downloadLog.join("\n")}</pre>
      <button id="report-permissions" type="button" onClick={report}>
        5 の記録を結果に入れる
      </button>
    </section>
  );
}
