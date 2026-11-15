import { describe, expect, it } from "vitest";
import { judgePrompt } from "../offscreen/judge";
import {
  formatReport,
  type LabeledPair,
  type PairOutcome,
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
