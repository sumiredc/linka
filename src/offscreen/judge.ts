// ページをまたぐ solution と concern の組を、Gemini Nano に「解決するか」で判定させる（PRD UC2）
import { z } from "zod";
import type { AddressesCandidate, AddressesLink } from "../shared/graph-statements";
import {
  LANGUAGES,
  type LanguageModelSession,
  type LanguageModelStatic,
} from "../shared/prompt-api";
import { promptWithTimeout } from "./prompt-timeout";

/** #47 より前の指示。「同じ話題だけなら false」としか言っていない */
const CURRENT_JUDGE_INSTRUCTIONS = [
  "You decide whether a solution taken from one web page about software development addresses a concern taken from another page.",
  "Answer addresses: true only if the solution solves, avoids or reduces the problem, risk or limitation that the concern describes.",
  "Answer addresses: false if they only talk about the same technology or topic, or if the solution is about a different problem.",
].join("\n");

/** 解決策の文そのものが、懸念の文の問題への手立てを述べているときだけ true にさせる版（#47） */
const STRICT_JUDGE_INSTRUCTIONS = [
  "You decide whether a solution taken from one web page about software development addresses a concern taken from another page.",
  "Consider the specific problem, risk or limitation that the concern states.",
  "Answer addresses: true only if the solution statement itself names a way to solve, avoid or reduce that specific problem, so that someone who has the problem could act on the solution to get rid of it.",
  "Answer addresses: false if the solution only states a fact about what a technology is or can do without tackling that problem, if they only share a technology or topic, or if the solution is about a different problem, even a related one.",
  "If you are not sure, answer addresses: false.",
].join("\n");

/**
 * 答える前に、懸念の問題と、解決策の文が示す手立てを 1 文ずつ書かせる版（#47）。
 * strict でも、技術の性質を述べただけの文を手立てとみなす誤りが残ったため
 */
const REASONED_JUDGE_INSTRUCTIONS = [
  "You decide whether a solution taken from one web page about software development addresses a concern taken from another page.",
  "First write problem: the specific problem, risk or limitation that the concern states, in one short sentence.",
  "Then write remedy: the action or mechanism named in the solution statement that removes or reduces exactly that problem, in one short sentence. Write none if the solution statement does not name one.",
  "A fact about what a technology is or can do is not a remedy unless it removes that exact problem. A shared technology or topic is not a remedy. A fix for a different problem, even a related one, is not a remedy.",
  "Then answer addresses: true only if remedy is not none.",
].join("\n");

export const JUDGE_INSTRUCTION_VARIANTS = {
  current: CURRENT_JUDGE_INSTRUCTIONS,
  strict: STRICT_JUDGE_INSTRUCTIONS,
  reasoned: REASONED_JUDGE_INSTRUCTIONS,
} as const;

export type JudgeInstructionVariant = keyof typeof JUDGE_INSTRUCTION_VARIANTS;

/**
 * 本番の判定で使う指示。dev.html の「UC2 judge accuracy」で版ごとの一致率を Chrome + Nano で測り、良い方に切り替える。
 * 2026-11-16 の測定（21 組）で strict が一致 13/21・FP 7・FN 1、current が 10/21・FP 9・FN 2 だったので strict を使う
 */
export const PRODUCTION_JUDGE_VARIANT: JudgeInstructionVariant = "strict";

export const JUDGE_INSTRUCTIONS = JUDGE_INSTRUCTION_VARIANTS[PRODUCTION_JUDGE_VARIANT];

/**
 * 判定 1 回の打ち切り。入力は 2 つの文と Concept の名前だけで、出力も 1 語なので、
 * 抽出の 1 回（約 8,000 文字、PROMPT_TIMEOUT_MS = 90 秒）より短くする。値の理由は PRD UC2
 */
export const JUDGE_TIMEOUT_MS = 30_000;

export const JudgementSchema = z.object({ addresses: z.boolean() });

/** reasoned の版の答え。モデルは項目を順に書くので、addresses を最後に置き、先に書いた 2 文を踏まえて答えさせる */
export const ReasonedJudgementSchema = z.object({
  problem: z.string().max(200),
  remedy: z.string().max(200),
  addresses: z.boolean(),
});

/** 版ごとの responseConstraint。どの版の答えも parseJudgement で addresses だけを読む */
export const JUDGE_RESPONSE_CONSTRAINTS: Record<JudgeInstructionVariant, object> = {
  current: z.toJSONSchema(JudgementSchema),
  strict: z.toJSONSchema(JudgementSchema),
  reasoned: z.toJSONSchema(ReasonedJudgementSchema),
};

const RESPONSE_CONSTRAINT = JUDGE_RESPONSE_CONSTRAINTS[PRODUCTION_JUDGE_VARIANT];

export type JudgeFailureKind =
  /** この環境では Nano が使えない、またはモデルがまだ入っていない */
  | "unavailable"
  /** 出力が期待する形でなかった（やり直しても） */
  | "invalidOutput"
  /** Prompt API の呼び出しが失敗した、または時間切れ */
  | "prompt";

export type JudgeResult =
  | { ok: true; links: AddressesLink[] }
  | { ok: false; error: { kind: JudgeFailureKind; message: string } };

export interface JudgeOptions {
  timeoutMs?: number;
  /** `pair` 番目（1 から）の組を判定し始めるときに呼ぶ */
  onPair?(pair: number, pairs: number): void;
}

export function judgePrompt(candidate: AddressesCandidate): string {
  const concepts =
    candidate.concepts.length > 0 ? `\nShared concepts: ${candidate.concepts.join(", ")}` : "";
  return `Concern: ${candidate.concern.statement}\nSolution: ${candidate.solution.statement}${concepts}`;
}

/** モデルの出力を読む。形が違えば null */
export function parseJudgement(raw: string): boolean | null {
  try {
    const parsed = JudgementSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.addresses : null;
  } catch {
    return null;
  }
}

type JudgeFailure = Extract<JudgeResult, { ok: false }>;

function failed(kind: JudgeFailureKind, message: string): JudgeFailure {
  return { ok: false, error: { kind, message } };
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export type PairResult = { ok: true; addresses: boolean } | JudgeFailure;

/** 判定の元にするセッションを、指示を system に入れて開く。使い終えたら呼び出し側が destroy する */
export async function openJudgeSession(
  api: LanguageModelStatic | null,
  instructions: string = JUDGE_INSTRUCTIONS,
): Promise<{ ok: true; base: LanguageModelSession } | JudgeFailure> {
  if (!api) return failed("unavailable", "the Prompt API is not available in this browser");
  let availability: string;
  try {
    availability = await api.availability(LANGUAGES);
  } catch (error) {
    return failed("unavailable", errorText(error));
  }
  if (availability !== "available") return failed("unavailable", `the model is ${availability}`);
  try {
    const base = await api.create({
      ...LANGUAGES,
      initialPrompts: [{ role: "system", content: instructions }],
    });
    return { ok: true, base };
  } catch (error) {
    return failed("prompt", errorText(error));
  }
}

/** 1 組を判定する。`responseConstraint` は指示の版に合わせる（JUDGE_RESPONSE_CONSTRAINTS）。抽出と同じく 1 回ごとに base を clone し、出力の形が違うときだけ 1 回やり直す */
export async function judgePair(
  base: LanguageModelSession,
  candidate: AddressesCandidate,
  timeoutMs: number = JUDGE_TIMEOUT_MS,
  responseConstraint: object = RESPONSE_CONSTRAINT,
): Promise<PairResult> {
  const input = judgePrompt(candidate);
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: string;
    let session: LanguageModelSession | null = null;
    try {
      session = await base.clone();
      raw = await promptWithTimeout(session, input, {
        responseConstraint,
        timeoutMs,
      });
    } catch (error) {
      return { ok: false, error: { kind: "prompt", message: errorText(error) } };
    } finally {
      session?.destroy();
    }
    const addresses = parseJudgement(raw);
    if (addresses !== null) return { ok: true, addresses };
  }
  return {
    ok: false,
    error: { kind: "invalidOutput", message: "the answer did not match the schema twice" },
  };
}

/**
 * 組を順に判定し、解決すると答えた組を返す。
 * どれか 1 つでも失敗したら、全体を失敗にする（PRD UC2：判定が失敗したら ADDRESSES を張らずに終える）
 */
export async function judgeCandidates(
  api: LanguageModelStatic | null,
  candidates: readonly AddressesCandidate[],
  options: JudgeOptions = {},
): Promise<JudgeResult> {
  if (candidates.length === 0) return { ok: true, links: [] };
  const opened = await openJudgeSession(api);
  if (!opened.ok) return opened;
  const { base } = opened;
  const timeoutMs = options.timeoutMs ?? JUDGE_TIMEOUT_MS;
  try {
    const links: AddressesLink[] = [];
    for (const [index, candidate] of candidates.entries()) {
      options.onPair?.(index + 1, candidates.length);
      const started = performance.now();
      const result = await judgePair(base, candidate, timeoutMs);
      // 組の数の上限を実測で調整するため、1 回ごとの所要時間を残す
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const outcome = result.ok
        ? result.addresses
          ? "addresses"
          : "does not address"
        : `failed: ${result.error.kind}`;
      console.info(
        `[linka] judge pair ${index + 1}/${candidates.length}: ${seconds} s (${outcome})`,
      );
      if (!result.ok) {
        return failed(
          result.error.kind,
          `pair ${index + 1} of ${candidates.length}: ${result.error.message}`,
        );
      }
      if (result.addresses) {
        links.push({ solution: candidate.solution.id, concern: candidate.concern.id });
      }
    }
    return { ok: true, links };
  } finally {
    base.destroy();
  }
}
