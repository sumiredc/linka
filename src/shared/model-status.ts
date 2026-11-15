// Gemini Nano のモデルの状態を読み、ダウンロードを始める。Prompt API は引数で受け取る
import { type DownloadMonitor, LANGUAGES, type LanguageModelStatic } from "./prompt-api";

export type ModelStatus =
  | { kind: "available" }
  /** 入っていないが、ダウンロードすれば使える。`error` は前回のダウンロードの開始に失敗した理由 */
  | { kind: "downloadable"; error: string | null }
  /** `progress` は 0〜1。ほかの画面が始めたダウンロードなど、進み具合が分からなければ null */
  | { kind: "downloading"; progress: number | null }
  | { kind: "unavailable"; reason: string };

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export async function readModelStatus(api: LanguageModelStatic | null): Promise<ModelStatus> {
  if (!api) return { kind: "unavailable", reason: "the Prompt API is not available" };
  try {
    const availability = await api.availability(LANGUAGES);
    switch (availability) {
      case "available":
        return { kind: "available" };
      case "downloadable":
        return { kind: "downloadable", error: null };
      case "downloading":
        return { kind: "downloading", progress: null };
      default:
        return { kind: "unavailable", reason: `the model is ${availability}` };
    }
  } catch (error) {
    return { kind: "unavailable", reason: errorText(error) };
  }
}

/**
 * モデルが入っていなければダウンロードし、終わるまで待つ。進み具合は `onStatus` に知らせる。
 * create がダウンロードを始めるので、できたセッションはすぐ破棄する。
 * 利用者の操作の中で呼ぶ必要があるかは確かめられていない（PRD §13）ので、吹き出しを開いた処理から呼ぶ
 */
export async function downloadModel(
  api: LanguageModelStatic | null,
  onStatus: (status: ModelStatus) => void = () => {},
): Promise<ModelStatus> {
  const before = await readModelStatus(api);
  if (!api || (before.kind !== "downloadable" && before.kind !== "downloading")) return before;
  onStatus({ kind: "downloading", progress: before.kind === "downloading" ? null : 0 });
  try {
    const session = await api.create({
      ...LANGUAGES,
      monitor: (monitor: DownloadMonitor) =>
        monitor.addEventListener("downloadprogress", (event) =>
          onStatus({ kind: "downloading", progress: event.loaded }),
        ),
    });
    session.destroy();
  } catch (error) {
    const after = await readModelStatus(api);
    return after.kind === "downloadable"
      ? { kind: "downloadable", error: errorText(error) }
      : after;
  }
  return readModelStatus(api);
}
