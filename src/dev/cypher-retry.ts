// 開発用。UC3 の流れ（Cypher を書かせる → 書き込みを拒否 → 実行 → Relate のエラー文を添えて作り直し）を
// 生成と実行を差し替えられる形で回し、1 問ごとの記録を残す
import { detectWrite, type WriteDetection } from "../shared/write-detection";

export const MAX_RETRIES = 2;

export type ExecuteResult = { ok: true; rows: unknown[] } | { ok: false; error: string };

export interface Attempt {
  cypher: string;
  /** 生成の失敗、書き込みの拒否、Relate のエラーのどれか。成功なら null */
  error: string | null;
  write: WriteDetection | null;
  /** 実行できたときの行 */
  rows: unknown[] | null;
  /** 生成にかかった時間 */
  generateMs: number;
}

export type Outcome =
  /** 1 回目で実行できた */
  | "first"
  /** 作り直して実行できた */
  | "retried"
  /** 作り直しても実行できなかった、または生成に失敗した */
  | "failed"
  /** 書き込みを含むので実行しなかった（作り直さない） */
  | "write";

export interface QuestionRun {
  attempts: Attempt[];
  outcome: Outcome;
  totalMs: number;
}

export interface RetryDeps {
  /** 1 回目は null、作り直しでは直前の Cypher と Relate のエラー文を受け取る */
  generate(feedback: { cypher: string; error: string } | null): Promise<string>;
  execute(cypher: string): ExecuteResult | Promise<ExecuteResult>;
  now?: () => number;
}

export async function runWithRetry(
  deps: RetryDeps,
  maxRetries = MAX_RETRIES,
): Promise<QuestionRun> {
  const now = deps.now ?? (() => performance.now());
  const started = now();
  const attempts: Attempt[] = [];
  let feedback: { cypher: string; error: string } | null = null;
  const finish = (outcome: Outcome): QuestionRun => ({
    attempts,
    outcome,
    totalMs: Math.round(now() - started),
  });

  for (let index = 0; index <= maxRetries; index++) {
    const before = now();
    let cypher: string;
    try {
      cypher = (await deps.generate(feedback)).trim();
    } catch (error) {
      attempts.push({
        cypher: "",
        error: `生成に失敗: ${error instanceof Error ? error.message : String(error)}`,
        write: null,
        rows: null,
        generateMs: Math.round(now() - before),
      });
      return finish("failed");
    }
    const generateMs = Math.round(now() - before);
    const write = detectWrite(cypher);
    if (write) {
      attempts.push({ cypher, error: "書き込みを含むので拒否", write, rows: null, generateMs });
      return finish("write");
    }
    const result = await deps.execute(cypher);
    if (result.ok) {
      attempts.push({ cypher, error: null, write: null, rows: result.rows, generateMs });
      return finish(index === 0 ? "first" : "retried");
    }
    attempts.push({ cypher, error: result.error, write: null, rows: null, generateMs });
    feedback = { cypher, error: result.error };
  }
  return finish("failed");
}

export interface Summary {
  total: number;
  first: number;
  withinRetries: number;
  /** 実行できたが 0 行だったもの */
  empty: number;
  write: number;
  failed: number;
  /** 利用者が正しいと付けたもの（実行できたものの中から） */
  correct: number;
  /** 正しいかどうかを付けたもの */
  judged: number;
}

export function summarize(
  runs: readonly (QuestionRun | null)[],
  correct: readonly (boolean | null)[],
): Summary {
  const summary: Summary = {
    total: runs.length,
    first: 0,
    withinRetries: 0,
    empty: 0,
    write: 0,
    failed: 0,
    correct: 0,
    judged: 0,
  };
  runs.forEach((run, index) => {
    if (!run) return;
    if (run.outcome === "first") summary.first++;
    if (run.outcome === "first" || run.outcome === "retried") {
      summary.withinRetries++;
      if (run.attempts.at(-1)?.rows?.length === 0) summary.empty++;
    }
    if (run.outcome === "write") summary.write++;
    if (run.outcome === "failed") summary.failed++;
    const mark = correct[index];
    if (mark !== null && mark !== undefined) {
      summary.judged++;
      if (mark) summary.correct++;
    }
  });
  return summary;
}

/** Nano への作り直しの依頼文 */
export function retryPrompt(feedback: { cypher: string; error: string }): string {
  return [
    "The query failed in Relate with this error:",
    feedback.error,
    "",
    "Failed query:",
    feedback.cypher,
    "",
    "Write a corrected single read-only Cypher query for the same question.",
  ].join("\n");
}
