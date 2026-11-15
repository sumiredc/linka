// Prompt API の 1 回の prompt を、時間を区切って待つ。抽出と質問の両方で使う
import type { LanguageModelSession } from "../shared/prompt-api";

/**
 * `timeoutMs` 以内に答えが無ければ「no answer within N s」で reject し、prompt を abort する。
 * `responseConstraint` はそのまま prompt に渡す
 */
export async function promptWithTimeout(
  session: LanguageModelSession,
  input: string,
  options: { responseConstraint: unknown; timeoutMs: number },
): Promise<string> {
  const { responseConstraint, timeoutMs } = options;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`no answer within ${timeoutMs / 1000} s`);
      // Chrome の prompt は abort の中で同期的に AbortError で reject するので、先に reject して race に勝たせる
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      session.prompt(input, { responseConstraint, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
