// service worker は dedicated worker を作れないので DB を持たず、offscreen document を 1 つだけ用意する。
// 依頼は取り次がない。長い依頼の返事を待つ間に service worker が休止すると、返事が失われるため
import { type EnsureResponse, failure, isMessageFor } from "../shared/messages";
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

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (response: EnsureResponse) => void) => {
    if (!isMessageFor(message, "background")) return false;
    ensureOffscreen().then(
      () => sendResponse({ ok: true }),
      (error: unknown) =>
        sendResponse(
          failure("unreachable", error instanceof Error ? error.message : String(error)),
        ),
    );
    return true;
  },
);
