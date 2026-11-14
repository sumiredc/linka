// popup と sidepanel からの依頼を、DB を持つ offscreen document へ取り次ぐ。
// service worker からは dedicated worker を作れないため、DB は offscreen document 側に置く。
let creating = null;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "Keep the Relate graph database open in a dedicated worker.",
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.to !== "background") return false;
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ ...msg, to: "offscreen" }))
    .then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
