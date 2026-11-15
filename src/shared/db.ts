// 画面（吹き出し・サイドパネル）から DB を使う入口。
// service worker には offscreen document を用意させるだけで、依頼は offscreen document に直接送る
import {
  type DbNotification,
  type DbRequest,
  type DbResponse,
  type DbResultOf,
  type EnsureResponse,
  failure,
  isMessageFor,
  type RuntimeMessage,
} from "./messages";

export type SendMessage = (message: RuntimeMessage) => Promise<unknown>;

// 宛先が無くて届かなかったときの chrome.runtime.sendMessage のエラー。返事の途中で切れたときとは区別する
const NO_RECEIVER = /receiving end does not exist/i;

type Sent<T> = { response: T } | { error: string; delivered: boolean };

async function send<T>(sendMessage: SendMessage, message: RuntimeMessage): Promise<Sent<T>> {
  try {
    const response = (await sendMessage(message)) as T | undefined;
    if (response === undefined) return { error: "no answer", delivered: false };
    return { response };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return { error: text, delivered: !NO_RECEIVER.test(text) };
  }
}

/** service worker に offscreen document を用意させてから、offscreen document にメッセージを送る関数を返す */
export function createSendToOffscreen(sendMessage: SendMessage) {
  const ensure = async (): Promise<EnsureResponse> => {
    const sent = await send<EnsureResponse>(sendMessage, {
      target: "background",
      type: "ensureOffscreen",
    });
    return "response" in sent ? sent.response : failure("unreachable", sent.error);
  };

  return async function sendToOffscreen<T>(
    message: Extract<RuntimeMessage, { target: "offscreen" }>,
  ): Promise<DbResponse<T>> {
    let lastError = "";
    // ensure と送信の間に offscreen document が閉じられたなら、作り直させて 1 度だけ送り直す
    for (let attempt = 1; attempt <= 2; attempt++) {
      const ensured = await ensure();
      if (!ensured.ok) return ensured;
      const sent = await send<DbResponse<T>>(sendMessage, message);
      if ("response" in sent) return sent.response;
      lastError = sent.error;
      // 届いていたかもしれない依頼を送り直すと、書き込みが 2 回起きうる
      if (sent.delivered) break;
    }
    return failure("unreachable", lastError);
  };
}

export function createAskDb(sendMessage: SendMessage) {
  const sendToOffscreen = createSendToOffscreen(sendMessage);
  return function askDb<R extends DbRequest>(request: R): Promise<DbResponse<DbResultOf<R>>> {
    return sendToOffscreen({ target: "offscreen", type: "db", request });
  };
}

export const askDb = createAskDb((message) => chrome.runtime.sendMessage(message));

/** DB の変化の通知を受け取る。戻り値を呼ぶと受け取りをやめる */
export function onDbNotification(listener: (notification: DbNotification) => void): () => void {
  const handle = (message: unknown) => {
    if (isMessageFor(message, "ui") && message.type === "notify") listener(message.notification);
    return false;
  };
  chrome.runtime.onMessage.addListener(handle);
  return () => chrome.runtime.onMessage.removeListener(handle);
}
