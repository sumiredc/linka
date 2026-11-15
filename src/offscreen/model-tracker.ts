import { downloadModel, type ModelStatus, readModelStatus } from "../shared/model-status";
import type { LanguageModelStatic } from "../shared/prompt-api";

export interface ModelTrackerOptions {
  api(): LanguageModelStatic | null;
  /** 状態が変わったときだけ呼ばれる */
  onChange(status: ModelStatus): void;
}

/**
 * offscreen document でモデルの状態を持ち、変化を知らせる。
 * ダウンロードは 1 つだけ走らせ、吹き出しが閉じても offscreen document の中で最後まで続ける
 */
export class ModelTracker {
  #last: ModelStatus | null = null;
  #downloading: Promise<void> | null = null;

  constructor(private readonly options: ModelTrackerOptions) {}

  async status(): Promise<ModelStatus> {
    // ダウンロード中は availability より、進み具合を知っている手元の状態のほうが詳しい
    if (this.#downloading && this.#last) return this.#last;
    return this.#set(await readModelStatus(this.options.api()));
  }

  /** モデルが入っていなければダウンロードを始め、終わるのを待たずに今の状態を返す */
  async download(): Promise<ModelStatus> {
    const before = await this.status();
    if (this.#downloading) return before;
    if (before.kind !== "downloadable" && before.kind !== "downloading") return before;
    const started = this.#set({
      kind: "downloading",
      progress: before.kind === "downloading" ? null : 0,
    });
    this.#downloading = downloadModel(this.options.api(), (status) => this.#set(status))
      .then((status) => {
        this.#set(status);
      })
      .finally(() => {
        this.#downloading = null;
      });
    return started;
  }

  #set(status: ModelStatus): ModelStatus {
    if (JSON.stringify(status) !== JSON.stringify(this.#last)) {
      this.#last = status;
      this.options.onChange(status);
    }
    return status;
  }
}
