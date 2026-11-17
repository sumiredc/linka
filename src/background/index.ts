// service worker は dedicated worker を作れないので DB を持たず、offscreen document を 1 つだけ用意する。
// 依頼は取り次がない。長い依頼の返事を待つ間に service worker が休止すると、返事が失われるため
import { createAskClip } from "../shared/clip";
import {
  type EnsureResponse,
  failure,
  isFromExtensionPage,
  isMessageFor,
} from "../shared/messages";
import {
  type Badge,
  badgeTriggerOf,
  createBadgeRefresher,
  debounce,
  refreshesOnUpdate,
  tabsShowing,
} from "./badge";
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
  if (refreshesOnUpdate(changeInfo)) void refreshBadge(tabId, tab.url);
});

function refreshTabs(pageUrl: string | null): void {
  chrome.tabs.query({}).then(
    (tabs) => {
      const targets =
        pageUrl === null
          ? tabs.flatMap(({ id, url }) => (id === undefined ? [] : [{ id, url }]))
          : tabsShowing(tabs, pageUrl);
      for (const tab of targets) void refreshBadge(tab.id, tab.url);
    },
    () => {},
  );
}

const GRAPH_CHANGED_DEBOUNCE_MS = 500;
const refreshAllTabs = debounce(() => refreshTabs(null), GRAPH_CHANGED_DEBOUNCE_MS);

// offscreen document が拡張機能のすべてのページへ送る通知は、service worker にも届く
chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const trigger = badgeTriggerOf(message);
  if (trigger === null || !isFromExtensionPage(sender, EXTENSION_ROOT)) return false;
  if (trigger.kind === "page") refreshTabs(trigger.url);
  else refreshAllTabs();
  return false;
});
