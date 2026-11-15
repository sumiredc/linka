// service worker は dedicated worker を作れないので DB を持たず、offscreen document を 1 つだけ用意する。
// 依頼は取り次がない。長い依頼の返事を待つ間に service worker が休止すると、返事が失われるため
import { createAskClip } from "../shared/clip";
import {
  type EnsureResponse,
  failure,
  isFromExtensionPage,
  isMessageFor,
} from "../shared/messages";
import { type Badge, createBadgeRefresher, tabsShowing } from "./badge";
import { createOffscreenEnsurer } from "./offscreen";

const EXTENSION_ROOT = chrome.runtime.getURL("");

const ensureOffscreen = createOffscreenEnsurer({
  hasDocument: async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    return contexts.length > 0;
  },
  createDocument: () =>
    chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Keep the Relate graph database open in a dedicated worker over OPFS.",
    }),
});

function ensured(): Promise<EnsureResponse> {
  return ensureOffscreen().then(
    () => ({ ok: true }),
    (error: unknown) =>
      failure("unreachable", error instanceof Error ? error.message : String(error)),
  );
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse: (response: EnsureResponse) => void) => {
    if (!isMessageFor(message, "background")) return false;
    if (!isFromExtensionPage(sender, EXTENSION_ROOT)) return false;
    ensured().then(sendResponse);
    return true;
  },
);

// runtime.sendMessage は送り主自身には届かないので、offscreen document の用意はここで直接行う。
// isClipped はすぐ返る問い合わせなので、service worker が返事を待ってよい
const askClip = createAskClip((message) =>
  message.target === "background" ? ensured() : chrome.runtime.sendMessage(message),
);

async function setBadge(tabId: number, badge: Badge): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: badge.text });
    if (badge.text !== "")
      await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  } catch {
    // 尋ねている間にタブが閉じられた
  }
}

const refreshBadge = createBadgeRefresher({
  extensionRoot: EXTENSION_ROOT,
  isClipped: (tabUrl) => askClip({ kind: "isClipped", tabUrl }),
  setBadge,
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(
    (tab) => refreshBadge(tabId, tab.url),
    () => {},
  );
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined) void refreshBadge(tabId, tab.url);
});

// offscreen document が拡張機能のすべてのページへ送る記憶の結果は、service worker にも届く
chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!isMessageFor(message, "ui") || message.type !== "clip") return false;
  if (message.event.kind !== "finished") return false;
  if (!isFromExtensionPage(sender, EXTENSION_ROOT)) return false;
  const pageUrl = message.event.target.url;
  chrome.tabs.query({}).then(
    (tabs) => {
      for (const tab of tabsShowing(tabs, pageUrl, EXTENSION_ROOT)) {
        void refreshBadge(tab.id, tab.url);
      }
    },
    () => {},
  );
  return false;
});
