// service worker は dedicated worker を作れないので DB を持たない。
// 画面からの依頼を offscreen document に取り次ぎ、DB の変化を全画面に知らせる
import { type DbResponse, failure, isMessageFor, type RuntimeMessage } from "../shared/messages";
import { createOffscreenEnsurer } from "./offscreen";

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

async function relay(message: RuntimeMessage & { type: "db" }): Promise<DbResponse> {
  await ensureOffscreen();
  const forward: RuntimeMessage = { target: "offscreen", type: "db", request: message.request };
  const response: DbResponse | undefined = await chrome.runtime.sendMessage(forward);
  return response ?? failure("relay", "the offscreen document did not answer");
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (response: DbResponse) => void) => {
    if (!isMessageFor(message, "background")) return false;
    if (message.type === "notify") {
      const broadcast: RuntimeMessage = {
        target: "ui",
        type: "notify",
        notification: message.notification,
      };
      // 開いている画面が無ければ受け手がいないだけなので捨てる
      chrome.runtime.sendMessage(broadcast).catch(() => {});
      return false;
    }
    relay(message).then(sendResponse, (error: unknown) =>
      sendResponse(failure("relay", error instanceof Error ? error.message : String(error))),
    );
    return true;
  },
);
