import type { ModelStatus } from "../shared/model-status";

/** 質問の入力欄で押されたキーのうち、送信を決めるのに見る部分（KeyboardEvent と React の両方が持つ） */
export type SubmitKey = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  isComposing: boolean;
  keyCode?: number;
};

/**
 * ⌘/Ctrl + Enter で送る。Enter だけは改行にする。
 * 日本語の変換を確定する Enter は送らない（Safari 系は確定の keydown で isComposing を立てず、keyCode 229 を出す）
 */
export function shouldSubmit(event: SubmitKey): boolean {
  if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return false;
  return event.metaKey || event.ctrlKey;
}

/**
 * 入力欄を出してよいか。Nano が使えないときは入力欄の代わりに理由を出す（定型の質問は出さない。PRD §3）。
 * null はまだ尋ねている途中
 */
export function askGate(
  status: ModelStatus | null,
): { open: true } | { open: false; text: string } {
  if (status === null) return { open: false, text: "Checking whether on-device AI is available…" };
  switch (status.kind) {
    case "available":
      return { open: true };
    case "downloading":
      return {
        open: false,
        text: `Questions can be asked once the on-device AI model has downloaded${status.progress === null ? "" : ` (${Math.floor(status.progress * 100)}%)`}.`,
      };
    case "downloadable":
      return {
        open: false,
        text: "Questions need the on-device AI model, which is not downloaded yet. Open the Linka popup from the toolbar to start the download.",
      };
    case "unavailable":
      return {
        open: false,
        text: `Questions need on-device AI (Gemini Nano), which is not available here: ${status.reason}.`,
      };
  }
}
