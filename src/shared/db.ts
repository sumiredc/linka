// 画面（吹き出し・サイドパネル）から DB を使う入口。
// service worker には offscreen document を用意させるだけで、依頼は offscreen document に直接送る
import {
  type DbFailure,
  type DbNotification,
  type DbRequest,
  type DbResponse,
  type DbResultOf,
  type EnsureResponse,
  failure,
  isMessageFor,
  type RuntimeMessage,
} from "./messages";

async function send<T>(message: RuntimeMessage, unanswered: string): Promise<T | DbFailure> {
  try {
    const response: T | undefined = await chrome.runtime.sendMessage(message);
    return response ?? failure("unreachable", unanswered);
  } catch (error) {
    return failure("unreachable", error instanceof Error ? error.message : String(error));
  }
}

export async function askDb<R extends DbRequest>(request: R): Promise<DbResponse<DbResultOf<R>>> {
  const ensured = await send<EnsureResponse>(
    { target: "background", type: "ensureOffscreen" },
    "the service worker did not answer",
  );
  if (!ensured.ok) return ensured;
  return send<DbResponse<DbResultOf<R>>>(
    { target: "offscreen", type: "db", request },
    "the offscreen document did not answer",
  );
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
