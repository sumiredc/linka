// 画面から Gemini Nano のモデルの状態を尋ね、ダウンロードを頼む入口。DB と同じく offscreen document に直接送る
import { createSendToOffscreen, type SendMessage } from "./db";
import { type DbResponse, isMessageFor, type ModelRequest } from "./messages";
import type { ModelStatus } from "./model-status";

export function createAskModel(sendMessage: SendMessage) {
  const sendToOffscreen = createSendToOffscreen(sendMessage);
  return function askModel(request: ModelRequest): Promise<DbResponse<ModelStatus>> {
    return sendToOffscreen({ target: "offscreen", type: "model", request });
  };
}

export const askModel = createAskModel((message) => chrome.runtime.sendMessage(message));

/** モデルの状態の変化（ダウンロードの進み具合を含む）を受け取る。戻り値を呼ぶと受け取りをやめる */
export function onModelStatus(listener: (status: ModelStatus) => void): () => void {
  const handle = (message: unknown) => {
    if (isMessageFor(message, "ui") && message.type === "model") listener(message.status);
    return false;
  };
  chrome.runtime.onMessage.addListener(handle);
  return () => chrome.runtime.onMessage.removeListener(handle);
}
