// Prompt API（Gemini Nano）の型は @types/chrome に無いので、使う分だけを書く。
// Chrome の版によって名前が違う（inputQuota → contextWindow など）ので、どちらも任意にしておく。
// Web Worker からは使えない。offscreen document と拡張機能のページから呼ぶ

export interface PromptOptions {
  responseConstraint?: unknown;
  signal?: AbortSignal;
}

export interface LanguageModelSession {
  prompt(input: string, options?: PromptOptions): Promise<string>;
  clone(): Promise<LanguageModelSession>;
  destroy(): void;
  readonly contextWindow?: number;
  readonly contextUsage?: number;
  readonly inputQuota?: number;
  readonly inputUsage?: number;
  measureContextUsage?(input: string, options?: PromptOptions): Promise<number>;
  measureInputUsage?(input: string, options?: PromptOptions): Promise<number>;
}

export interface DownloadMonitor {
  addEventListener(type: "downloadprogress", listener: (event: { loaded: number }) => void): void;
}

export interface LanguageModelCreateOptions {
  initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
  monitor?: (monitor: DownloadMonitor) => void;
}

export interface LanguageModelStatic {
  availability(options?: unknown): Promise<string>;
  params?(): Promise<unknown>;
  create(options?: unknown): Promise<LanguageModelSession>;
}

/** 抽出と質問は英語だけを扱う */
export const LANGUAGES = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

export function languageModel(): LanguageModelStatic | null {
  return (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel ?? null;
}
