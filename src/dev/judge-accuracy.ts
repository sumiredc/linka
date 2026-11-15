// 開発用。UC2 の判定（本番の openJudgeSession・judgePair）を、人が正解を付けた組に当てて一致率を測る（#47）
import {
  JUDGE_TIMEOUT_MS,
  type JudgeInstructionVariant,
  judgePair,
  openJudgeSession,
  type PairResult,
} from "../offscreen/judge";
import type { AddressesCandidate } from "../shared/graph-statements";
import type { LanguageModelStatic } from "../shared/prompt-api";

export interface LabeledPair {
  id: string;
  solution: { page: string; statement: string };
  concern: { page: string; statement: string };
  /** 両方の Claim が ABOUT で指す Concept の名前。本番の候補と同じく判定の入力に入る */
  concepts: string[];
  /** 人が付けた正解：この solution はこの concern を解決するか */
  expected: boolean;
  reason: string;
}

export interface PairOutcome {
  id: string;
  seconds: number;
  result: PairResult;
}

export interface JudgeScore {
  pairs: number;
  agreed: number;
  /** 正解は false なのに true と答えた組の id */
  falsePositives: string[];
  /** 正解は true なのに false と答えた組の id */
  falseNegatives: string[];
  /** 判定が失敗した、または結果が無い組の id */
  failed: string[];
  meanSeconds: number;
  maxSeconds: number;
}

/** 本番の候補と同じ形にする。id は組の id から作る（判定の入力には文と Concept だけが入る） */
export function toCandidate(pair: LabeledPair): AddressesCandidate {
  return {
    solution: {
      id: `${pair.id}#solution`,
      statement: pair.solution.statement,
      pageUrl: pair.solution.page,
      pageTitle: pair.solution.page,
    },
    concern: {
      id: `${pair.id}#concern`,
      statement: pair.concern.statement,
      pageUrl: pair.concern.page,
      pageTitle: pair.concern.page,
    },
    concepts: [...pair.concepts],
  };
}

/** 一致率の分母はすべての組。失敗した組は一致に数えない */
export function scoreOutcomes(
  pairs: readonly LabeledPair[],
  outcomes: readonly PairOutcome[],
): JudgeScore {
  const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  const score: JudgeScore = {
    pairs: pairs.length,
    agreed: 0,
    falsePositives: [],
    falseNegatives: [],
    failed: [],
    meanSeconds: 0,
    maxSeconds: 0,
  };
  const seconds: number[] = [];
  for (const pair of pairs) {
    const outcome = byId.get(pair.id);
    if (!outcome) {
      score.failed.push(pair.id);
      continue;
    }
    seconds.push(outcome.seconds);
    if (!outcome.result.ok) score.failed.push(pair.id);
    else if (outcome.result.addresses === pair.expected) score.agreed++;
    else if (outcome.result.addresses) score.falsePositives.push(pair.id);
    else score.falseNegatives.push(pair.id);
  }
  if (seconds.length > 0) {
    score.meanSeconds = seconds.reduce((sum, value) => sum + value, 0) / seconds.length;
    score.maxSeconds = Math.max(...seconds);
  }
  return score;
}

export type JudgeRun = { ok: true; outcomes: PairOutcome[] } | { ok: false; message: string };

/**
 * 指示を 1 つ決めて、すべての組を本番と同じ判定（clone・responseConstraint・打ち切り・1 回のやり直し）にかける。
 * 本番と違い、1 組が失敗しても残りの組を続ける
 */
export async function runJudge(
  api: LanguageModelStatic | null,
  instructions: string,
  pairs: readonly LabeledPair[],
  options: { timeoutMs?: number; onPair?(pair: number, pairs: number): void } = {},
): Promise<JudgeRun> {
  const opened = await openJudgeSession(api, instructions);
  if (!opened.ok) return { ok: false, message: `${opened.error.kind}: ${opened.error.message}` };
  const outcomes: PairOutcome[] = [];
  try {
    for (const [index, pair] of pairs.entries()) {
      options.onPair?.(index + 1, pairs.length);
      const started = performance.now();
      const result = await judgePair(
        opened.base,
        toCandidate(pair),
        options.timeoutMs ?? JUDGE_TIMEOUT_MS,
      );
      outcomes.push({ id: pair.id, seconds: (performance.now() - started) / 1000, result });
    }
    return { ok: true, outcomes };
  } finally {
    opened.base.destroy();
  }
}

export interface VariantReport {
  variant: JudgeInstructionVariant;
  run: JudgeRun;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "-" : `${Math.round((part / whole) * 100)}%`;
}

function answerText(outcome: PairOutcome | undefined): string {
  if (!outcome) return "-";
  if (!outcome.result.ok) return `失敗（${outcome.result.error.kind}）`;
  return String(outcome.result.addresses);
}

function mark(pair: LabeledPair, outcome: PairOutcome | undefined): string {
  if (!outcome?.result.ok) return "";
  if (outcome.result.addresses === pair.expected) return "";
  return outcome.result.addresses ? " FP" : " FN";
}

/** issue に貼る文。版ごとの集計の表と、組ごとの答えと秒数の表 */
export function formatReport(input: {
  environment: string;
  production: JudgeInstructionVariant;
  pairs: readonly LabeledPair[];
  reports: readonly VariantReport[];
}): string {
  const { pairs, reports } = input;
  const positives = pairs.filter((pair) => pair.expected).length;
  const lines = [
    "## UC2 judge accuracy",
    "",
    "```text",
    input.environment,
    `組: ${pairs.length}（正解 true ${positives}・false ${pairs.length - positives}）`,
    `本番の指示: ${input.production}`,
    "```",
    "",
    "| 指示 | 一致 | 一致率 | FP（false を true） | FN（true を false） | 失敗 | 1 組の平均 | 最大 |",
    "|---|---|---|---|---|---|---|---|",
  ];
  const outcomesByVariant = new Map<JudgeInstructionVariant, Map<string, PairOutcome>>();
  const misses: string[] = [];
  for (const report of reports) {
    if (!report.run.ok) {
      lines.push(`| ${report.variant} | 測れなかった：${report.run.message} |  |  |  |  |  |  |`);
      continue;
    }
    outcomesByVariant.set(
      report.variant,
      new Map(report.run.outcomes.map((outcome) => [outcome.id, outcome])),
    );
    const score = scoreOutcomes(pairs, report.run.outcomes);
    lines.push(
      `| ${report.variant} | ${score.agreed}/${score.pairs} | ${percent(score.agreed, score.pairs)} | ${score.falsePositives.length} | ${score.falseNegatives.length} | ${score.failed.length} | ${score.meanSeconds.toFixed(1)} 秒 | ${score.maxSeconds.toFixed(1)} 秒 |`,
    );
    const list = (ids: string[]) => ids.join(", ") || "無し";
    misses.push(
      `- ${report.variant}：FP ${list(score.falsePositives)}／FN ${list(score.falseNegatives)}／失敗 ${list(score.failed)}`,
    );
  }
  const variants = [...outcomesByVariant.keys()];
  if (misses.length > 0) lines.push("", ...misses);
  lines.push(
    "",
    `| 組 | 正解 | ${variants.join(" | ")} |`,
    `|---|---|${variants.map(() => "---|").join("")}`,
  );
  for (const pair of pairs) {
    const cells = variants.map((variant) => {
      const outcome = outcomesByVariant.get(variant)?.get(pair.id);
      const time = outcome ? ` ${outcome.seconds.toFixed(1)} 秒` : "";
      return `${answerText(outcome)}${mark(pair, outcome)}${time}`;
    });
    lines.push(`| ${pair.id} | ${pair.expected} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}
