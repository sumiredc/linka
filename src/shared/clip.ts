// 画面から記憶を頼み、進み具合と結果を受け取る入口。DB と同じく offscreen document に直接送る
import type { ClipEvent, ClipRequest, ClipResultOf } from "./clip-status";
import { createSendToOffscreen, type SendMessage } from "./db";
import { type DbResponse, isMessageFor } from "./messages";

export function createAskClip(sendMessage: SendMessage) {
  const sendToOffscreen = createSendToOffscreen(sendMessage);
  return function askClip<R extends ClipRequest>(request: R): Promise<DbResponse<ClipResultOf<R>>> {
    return sendToOffscreen({ target: "offscreen", type: "clip", request });
  };
}

export const askClip = createAskClip((message) => chrome.runtime.sendMessage(message));

/** 記憶の進み具合と結果を受け取る。ほかの画面が頼んだ記憶の分も届く。戻り値を呼ぶと受け取りをやめる */
export function onClipEvent(listener: (event: ClipEvent) => void): () => void {
  const handle = (message: unknown) => {
    if (isMessageFor(message, "ui") && message.type === "clip") listener(message.event);
    return false;
  };
  chrome.runtime.onMessage.addListener(handle);
  return () => chrome.runtime.onMessage.removeListener(handle);
}
