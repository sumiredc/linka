import { describe, expect, it } from "vitest";
import { type ExecuteResult, type QuestionRun, runWithRetry, summarize } from "./cypher-retry";

function scripted(outputs: string[], results: Record<string, ExecuteResult>) {
  const feedbacks: unknown[] = [];
  const executed: string[] = [];
  return {
    feedbacks,
    executed,
    deps: {
      generate: async (feedback: unknown) => {
        feedbacks.push(feedback);
        const next = outputs.shift();
        if (next === undefined) throw new Error("no more outputs");
        return next;
      },
      execute: (cypher: string) => {
        executed.push(cypher);
        return results[cypher] ?? { ok: false as const, error: `unknown ${cypher}` };
      },
    },
  };
}

const OK: ExecuteResult = { ok: true, rows: [{ n: 1 }] };

describe("runWithRetry", () => {
  it("counts a query that runs on the first attempt as first", async () => {
    const { deps, feedbacks } = scripted(["MATCH (n) RETURN n"], { "MATCH (n) RETURN n": OK });
    const run = await runWithRetry(deps);
    expect(run.outcome).toBe("first");
    expect(run.attempts).toHaveLength(1);
    expect(feedbacks).toEqual([null]);
  });

  it("feeds Relate's error back and counts a later success as retried", async () => {
    const { deps, feedbacks } = scripted(["BAD", "MATCH (n) RETURN n"], {
      BAD: { ok: false, error: "syntax error" },
      "MATCH (n) RETURN n": OK,
    });
    const run = await runWithRetry(deps);
    expect(run.outcome).toBe("retried");
    expect(feedbacks).toEqual([null, { cypher: "BAD", error: "syntax error" }]);
    expect(run.attempts.map((attempt) => attempt.error)).toEqual(["syntax error", null]);
  });

  it("gives up after two retries", async () => {
    const bad: ExecuteResult = { ok: false, error: "syntax error" };
    const { deps, executed } = scripted(["B1", "B2", "B3", "MATCH (n) RETURN n"], {
      B1: bad,
      B2: bad,
      B3: bad,
      "MATCH (n) RETURN n": OK,
    });
    const run = await runWithRetry(deps);
    expect(run.outcome).toBe("failed");
    expect(executed).toEqual(["B1", "B2", "B3"]);
  });

  it("rejects a write without running or retrying it", async () => {
    const { deps, executed } = scripted(["MATCH (n) DETACH DELETE n", "MATCH (n) RETURN n"], {
      "MATCH (n) RETURN n": OK,
    });
    const run = await runWithRetry(deps);
    expect(run.outcome).toBe("write");
    expect(run.attempts[0]?.write).toEqual({ kind: "clause", keyword: "DETACH" });
    expect(executed).toEqual([]);
  });

  it("counts a generation error as failed without retrying", async () => {
    const { deps } = scripted([], {});
    const run = await runWithRetry(deps);
    expect(run.outcome).toBe("failed");
    expect(run.attempts).toHaveLength(1);
    expect(run.attempts[0]?.error).toContain("no more outputs");
  });
});

function runOf(outcome: QuestionRun["outcome"], rows: unknown[] | null = [{}]): QuestionRun {
  return {
    outcome,
    totalMs: 0,
    attempts: [{ cypher: "", error: null, write: null, rows, generateMs: 0 }],
  };
}

describe("summarize", () => {
  it("counts first tries, successes within retries, empty results and marks", () => {
    const summary = summarize(
      [runOf("first"), runOf("retried", []), runOf("failed", null), runOf("write", null), null],
      [true, false, null, null, null],
    );
    expect(summary).toEqual({
      total: 5,
      first: 1,
      withinRetries: 2,
      empty: 1,
      write: 1,
      failed: 1,
      correct: 1,
      judged: 2,
    });
  });
});
