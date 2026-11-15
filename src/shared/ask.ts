// 画面からグラフに質問する入口（PRD UC3）。DB と同じく offscreen document に直接送る
import { createSendToOffscreen, type SendMessage } from "./db";
import type { AskResult } from "./graph-question";
import { type DbResponse, failure } from "./messages";

/**
 * 画面が返事を待つ上限。offscreen document 側の打ち切り（候補と対象と答えを読む DB の 30 秒ずつ、
 * モデルの選択の 60 秒）より長くし、それでも返事が無ければ失敗として入力欄を使える状態に戻す
 */
export const ASK_TIMEOUT_MS = 180_000;

export function createAskGraph(sendMessage: SendMessage, timeoutMs = ASK_TIMEOUT_MS) {
  const sendToOffscreen = createSendToOffscreen(sendMessage);
  return async function askGraph(question: string): Promise<DbResponse<AskResult>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<DbResponse<AskResult>>((resolve) => {
      timer = setTimeout(
        () => resolve(failure("timeout", `no answer within ${timeoutMs / 1000} s`)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([
        sendToOffscreen<AskResult>({
          target: "offscreen",
          type: "ask",
          request: { kind: "ask", question },
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

export const askGraph = createAskGraph((message) => chrome.runtime.sendMessage(message));
