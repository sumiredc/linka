import type { ModelStatus } from "../shared/model-status";

export type AiBadge = {
  /** 色分け。モックの `.ai-status[data-state]` と同じ 3 つ */
  tone: "ready" | "downloading" | "unavailable";
  text: string;
  /** 理由など、バッジに収まらない説明 */
  detail: string | null;
};

/** Gemini Nano の状態を、サイドパネルの見出しのバッジにする。null はまだ尋ねている途中 */
export function aiBadge(status: ModelStatus | null): AiBadge {
  if (status === null) return { tone: "unavailable", text: "Checking AI…", detail: null };
  switch (status.kind) {
    case "available":
      return { tone: "ready", text: "AI ready", detail: "Gemini Nano runs on this device." };
    case "downloading":
      return {
        tone: "downloading",
        text:
          status.progress === null
            ? "Downloading AI"
            : `Downloading AI ${Math.floor(status.progress * 100)}%`,
        detail: "Clipping and questions work once the download finishes.",
      };
    case "downloadable":
      return {
        tone: "downloading",
        text: "AI not downloaded",
        detail: status.error
          ? `The download could not start: ${status.error}`
          : "Gemini Nano can run here but is not downloaded yet.",
      };
    case "unavailable":
      return { tone: "unavailable", text: "AI not available", detail: status.reason };
  }
}
