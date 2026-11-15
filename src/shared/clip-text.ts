// 記憶の進み具合・結果・失敗を、吹き出しとサイドパネルに出す英語の文にする
import type { ClipFailure, ClipStage, ClipSummary } from "./clip-status";

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function stageText(stage: ClipStage): string {
  switch (stage.kind) {
    case "preparing":
      return "Preparing…";
    case "extracting":
      return stage.parts > 1
        ? `Extracting concepts and claims, part ${stage.part} of ${stage.parts}…`
        : "Extracting concepts and claims…";
    case "writing":
      return "Saving to the graph…";
  }
}

/** 件数の行。「3 concepts (1 new), 4 claims」 */
export function countsText(summary: ClipSummary): string {
  return `${plural(summary.concepts, "concept")} (${summary.newConcepts} new), ${plural(summary.claims, "claim")}`;
}

/** 新しいつながりの行。つながりを判定しなかった記憶では null */
export function connectionsText(summary: ClipSummary): string | null {
  if (summary.connections === null) return null;
  return summary.connections === 0
    ? "No new connections to other pages."
    : `${plural(summary.connections, "new connection")} to other pages.`;
}

/** Gemini Nano が使えないときの説明。`reason` は使えない理由 */
export function aiUnavailableText(reason?: string): string {
  const why = reason ? ` (${reason})` : "";
  return `On-device AI (Gemini Nano) is not available in this browser${why}. Only the bundled sample pages can be clipped.`;
}

export function failureText(error: ClipFailure): string {
  switch (error.kind) {
    case "invalidUrl":
      return "This page's URL cannot be clipped.";
    case "unreadable":
      return "Chrome does not let extensions read this page.";
    case "noText":
      return "This page has no text to clip.";
    case "unavailable":
      return aiUnavailableText();
    case "notReady":
      return "The on-device AI model is not downloaded yet. Try again when the download finishes.";
    case "invalidOutput":
      return "The AI's answer was not in the expected form, even after a retry. The graph was not changed.";
    case "prompt":
      return `The on-device AI failed: ${error.message}. The graph was not changed.`;
    case "sample":
      return `The bundled data for this sample could not be read: ${error.message}`;
    case "alreadyClipping":
      return "This page is already being clipped.";
    case "busy":
      return `Linka is clipping “${error.clipping.title}”. Try again when it finishes.`;
    case "write":
      return error.restored
        ? `Saving to the graph failed, and the graph was put back as it was: ${error.message}`
        : `Saving to the graph failed: ${error.message}. Linka removes the partial page before the next clip.`;
  }
}
