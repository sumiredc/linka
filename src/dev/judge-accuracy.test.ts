import { describe, expect, it } from "vitest";
import { judgePrompt } from "../offscreen/judge";
import type {
  LanguageModelCreateOptions,
  LanguageModelSession,
  LanguageModelStatic,
} from "../shared/prompt-api";
import {
  formatReport,
  type LabeledPair,
  type PairOutcome,
  runJudge,
  scoreOutcomes,
  toCandidate,
} from "./judge-accuracy";

function pair(id: string, expected: boolean): LabeledPair {
  return {
    id,
    solution: { page: "https://a/", statement: `Solution ${id}.` },
    concern: { page: "https://b/", statement: `Concern ${id}.` },
    concepts: ["OPFS"],
    expected,
    reason: "",
  };
}

function answered(id: string, addresses: boolean, seconds = 1): PairOutcome {
  return { id, seconds, result: { ok: true, addresses } };
}

function failedOutcome(id: string, seconds = 1): PairOutcome {
  return { id, seconds, result: { ok: false, error: { kind: "prompt", message: "x" } } };
}

const PAIRS = [pair("t1", true), pair("t2", true), pair("f1", false), pair("f2", false)];

describe("scoreOutcomes", () => {
  it("counts agreements, false positives and false negatives against the labels", () => {
    const score = scoreOutcomes(PAIRS, [
      answered("t1", true),
      answered("t2", false),
      answered("f1", true),
      answered("f2", false),
    ]);
    expect(score).toMatchObject({
      pairs: 4,
      agreed: 2,
      falsePositives: ["f1"],
      falseNegatives: ["t2"],
      failed: [],
    });
  });

  it("counts a failed or missing judgement as a failure, not as an agreement", () => {
    const score = scoreOutcomes(PAIRS, [
      answered("t1", true),
      failedOutcome("f1"),
      answered("f2", false),
    ]);
    expect(score).toMatchObject({ agreed: 2, failed: ["t2", "f1"], falsePositives: [] });
  });

  it("averages and maximises the seconds of the pairs that were judged", () => {
    const score = scoreOutcomes(PAIRS, [answered("t1", true, 0.2), failedOutcome("t2", 0.6)]);
    expect(score.meanSeconds).toBeCloseTo(0.4);
    expect(score.maxSeconds).toBeCloseTo(0.6);
  });

  it("has no time when nothing was judged", () => {
    expect(scoreOutcomes(PAIRS, [])).toMatchObject({ meanSeconds: 0, maxSeconds: 0 });
  });
});

describe("toCandidate", () => {
  it("gives the judge the statements and concepts of the pair", () => {
    expect(judgePrompt(toCandidate(pair("t1", true)))).toBe(
      "Concern: Concern t1.\nSolution: Solution t1.\nShared concepts: OPFS",
    );
  });
});

describe("formatReport", () => {
  const report = formatReport({
    environment: "Chrome: test",
    production: "current",
    pairs: PAIRS,
    reports: [
      {
        variant: "current",
        run: {
          ok: true,
          outcomes: [
            answered("t1", true),
            answered("t2", true),
            answered("f1", true),
            answered("f2", true),
          ],
        },
      },
      { variant: "strict", run: { ok: false, message: "unavailable: the model is downloadable" } },
    ],
  });

  it("has one summary row per instruction variant", () => {
    expect(report).toContain("| current | 2/4 | 50% | 2 | 0 | 0 | 1.0 秒 | 1.0 秒 |");
    expect(report).toContain("| strict | 測れなかった：unavailable: the model is downloadable |");
  });

  it("lists the false positives by id and marks them per pair", () => {
    expect(report).toContain("- current：FP f1, f2／FN 無し／失敗 無し");
    expect(report).toContain("| f1 | false | true FP 1.0 秒 |");
  });
});

/** 答えを順に返す偽の Prompt API。base の destroy を数える */
function fakeModel(answers: (string | Error)[], state = "available") {
  const model = {
    baseDestroyed: false,
    systemPrompts: [] as unknown[],
    api: {
      availability: async () => state,
      create: async (options?: LanguageModelCreateOptions) => {
        model.systemPrompts.push(options?.initialPrompts?.[0]?.content);
        const clone = async (): Promise<LanguageModelSession> => ({
          prompt: async () => {
            const answer = answers.shift();
            if (answer === undefined) throw new Error("no more answers");
            if (answer instanceof Error) throw answer;
            return answer;
          },
          clone,
          destroy: () => {},
        });
        return {
          prompt: () => Promise.reject(new Error("the base session must not be prompted")),
          clone,
          destroy: () => {
            model.baseDestroyed = true;
          },
        };
      },
    } satisfies LanguageModelStatic,
  };
  return model;
}

const yes = JSON.stringify({ addresses: true });
const no = JSON.stringify({ addresses: false });

describe("runJudge", () => {
  it("judges every pair with the given instructions, going on after a failed pair", async () => {
    const model = fakeModel([yes, new Error("kErrorUnknown"), no, no]);
    const result = await runJudge(model.api, "strict rules", PAIRS);
    expect(model.systemPrompts).toEqual(["strict rules"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcomes.map((outcome) => [outcome.id, outcome.result])).toEqual([
      ["t1", { ok: true, addresses: true }],
      ["t2", { ok: false, error: { kind: "prompt", message: "Error: kErrorUnknown" } }],
      ["f1", { ok: true, addresses: false }],
      ["f2", { ok: true, addresses: false }],
    ]);
    expect(model.baseDestroyed).toBe(true);
  });

  it("reports why it could not measure when the model is not available", async () => {
    const model = fakeModel([], "downloadable");
    expect(await runJudge(model.api, "rules", PAIRS)).toEqual({
      ok: false,
      message: "unavailable: the model is downloadable",
    });
  });
});
