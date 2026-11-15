// 画面からグラフに質問する入口（PRD UC3）。DB と同じく offscreen document に直接送る
import { createSendToOffscreen, type SendMessage } from "./db";
import type { AskResult } from "./graph-question";
import type { DbResponse } from "./messages";

export function createAskGraph(sendMessage: SendMessage) {
  const sendToOffscreen = createSendToOffscreen(sendMessage);
  return function askGraph(question: string): Promise<DbResponse<AskResult>> {
    return sendToOffscreen({
      target: "offscreen",
      type: "ask",
      request: { kind: "ask", question },
    });
  };
}

export const askGraph = createAskGraph((message) => chrome.runtime.sendMessage(message));
