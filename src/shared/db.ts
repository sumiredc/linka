// 画面（吹き出し・サイドパネル）から DB を使う入口。DB は offscreen document にあり、service worker が取り次ぐ
import {
  type DbNotification,
  type DbRequest,
  type DbResponse,
  type DbResultOf,
  failure,
  isMessageFor,
  type RuntimeMessage,
} from "./messages";

export async function askDb<R extends DbRequest>(request: R): Promise<DbResponse<DbResultOf<R>>> {
  const message: RuntimeMessage = { target: "background", type: "db", request };
  try {
    const response: DbResponse<DbResultOf<R>> | undefined =
      await chrome.runtime.sendMessage(message);
    return response ?? failure("relay", "the service worker did not answer");
  } catch (error) {
    return failure("relay", error instanceof Error ? error.message : String(error));
  }
}

/** DB の変化の通知を受け取る。戻り値を呼ぶと受け取りをやめる */
export function onDbNotification(listener: (notification: DbNotification) => void): () => void {
  const handle = (message: unknown) => {
    if (isMessageFor(message, "ui")) listener(message.notification);
    return false;
  };
  chrome.runtime.onMessage.addListener(handle);
  return () => chrome.runtime.onMessage.removeListener(handle);
}
