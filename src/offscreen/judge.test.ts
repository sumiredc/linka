import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AddressesCandidate } from "../shared/graph-statements";
import type {
  LanguageModelCreateOptions,
  LanguageModelSession,
  LanguageModelStatic,
  PromptOptions,
} from "../shared/prompt-api";
import {
  JUDGE_INSTRUCTION_VARIANTS,
  JUDGE_INSTRUCTIONS,
  JUDGE_RESPONSE_CONSTRAINTS,
  JudgementSchema,
  judgeCandidates,
  judgePair,
  judgePrompt,
  openJudgeSession,
  parseJudgement,
  ReasonedJudgementSchema,
} from "./judge";

type Answer = string | Error | "hang";

/** 答えを順に返す偽の Prompt API。clone ごとに 1 回だけ prompt を受け付ける */
class FakeModel implements LanguageModelStatic {
  readonly prompts: { input: string; options?: PromptOptions }[] = [];
  created = 0;
  readonly systemPrompts: unknown[] = [];
  baseDestroyed = false;

  constructor(
    private readonly answers: Answer[],
    private readonly state = "available",
  ) {}

  async availability() {
    return this.state;
  }

  async create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession> {
    this.created++;
    this.systemPrompts.push(options?.initialPrompts?.[0]?.content);
    return this.session(true);
  }

  private session(isBase: boolean): LanguageModelSession {
    let used = false;
    return {
      prompt: (input, options) => {
        if (isBase) return Promise.reject(new Error("the base session must not be prompted"));
        if (used) return Promise.reject(new Error("kErrorUnknown"));
        used = true;
        this.prompts.push({ input, options });
        const answer = this.answers.shift();
        if (answer === undefined) return Promise.reject(new Error("no more answers"));
        if (answer === "hang") return new Promise<string>(() => {});
        if (answer instanceof Error) return Promise.reject(answer);
        return Promise.resolve(answer);
      },
      clone: async () => this.session(false),
      destroy: () => {
        if (isBase) this.baseDestroyed = true;
      },
    };
  }
}

const yes = JSON.stringify({ addresses: true });
const no = JSON.stringify({ addresses: false });

function candidate(n: number): AddressesCandidate {
  return {
    solution: { id: `s${n}`, statement: `Solution ${n}.`, pageUrl: "https://a/", pageTitle: "A" },
    concern: { id: `c${n}`, statement: `Concern ${n}.`, pageUrl: "https://b/", pageTitle: "B" },
    concepts: ["OPFS", "Web Worker"],
  };
}

describe("judgeCandidates", () => {
  it("returns the pairs Nano says are addressed, as solution to concern", async () => {
    const model = new FakeModel([no, yes, no]);
    const result = await judgeCandidates(model, [candidate(1), candidate(2), candidate(3)]);
    expect(result).toEqual({ ok: true, links: [{ solution: "s2", concern: "c2" }] });
  });

  it("asks one pair per prompt with the answer's schema", async () => {
    const model = new FakeModel([no]);
    await judgeCandidates(model, [candidate(1)]);
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0]?.input).toBe(judgePrompt(candidate(1)));
    expect(model.prompts[0]?.options?.responseConstraint).toEqual(z.toJSONSchema(JudgementSchema));
  });

  it("does not open a session when there is nothing to judge", async () => {
    const model = new FakeModel([]);
    expect(await judgeCandidates(model, [])).toEqual({ ok: true, links: [] });
    expect(model.created).toBe(0);
  });

  it("fails without links when a judgement fails, even after another said yes", async () => {
    const model = new FakeModel([yes, new Error("kErrorUnknown")]);
    const result = await judgeCandidates(model, [candidate(1), candidate(2), candidate(3)]);
    expect(result).toEqual({
      ok: false,
      error: { kind: "prompt", message: "pair 2 of 3: Error: kErrorUnknown" },
    });
    expect(model.prompts).toHaveLength(2);
    expect(model.baseDestroyed).toBe(true);
  });

  it("names the seconds when a judgement times out", async () => {
    const model = new FakeModel(["hang"]);
    const result = await judgeCandidates(model, [candidate(1)], { timeoutMs: 20 });
    expect(result).toEqual({
      ok: false,
      error: { kind: "prompt", message: "pair 1 of 1: Error: no answer within 0.02 s" },
    });
  });

  it("asks once more when the answer has the wrong shape, then gives up", async () => {
    expect(await judgeCandidates(new FakeModel(["maybe", yes]), [candidate(1)])).toEqual({
      ok: true,
      links: [{ solution: "s1", concern: "c1" }],
    });
    expect(await judgeCandidates(new FakeModel(["maybe", "{}"]), [candidate(1)])).toMatchObject({
      ok: false,
      error: { kind: "invalidOutput" },
    });
  });

  it.each(["unavailable", "downloadable", "downloading"])(
    "does not judge when the model is %s",
    async (state) => {
      const model = new FakeModel([yes], state);
      expect(await judgeCandidates(model, [candidate(1)])).toMatchObject({
        ok: false,
        error: { kind: "unavailable" },
      });
      expect(model.prompts).toHaveLength(0);
    },
  );

  it("does not judge without the Prompt API", async () => {
    expect(await judgeCandidates(null, [candidate(1)])).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
  });
});

describe("judge instructions", () => {
  it("judges production pairs with the production instructions", async () => {
    const model = new FakeModel([no]);
    await judgeCandidates(model, [candidate(1)]);
    expect(model.systemPrompts).toEqual([JUDGE_INSTRUCTIONS]);
  });

  it("asks the reasoned variant to write the problem and the remedy before the answer", () => {
    const constraint = JUDGE_RESPONSE_CONSTRAINTS.reasoned as { properties: object };
    expect(Object.keys(constraint.properties)).toEqual(["problem", "remedy", "addresses"]);
    expect(constraint).toEqual(z.toJSONSchema(ReasonedJudgementSchema));
  });

  it("judges a pair with the answer shape it is given", async () => {
    const model = new FakeModel([
      JSON.stringify({ problem: "p", remedy: "none", addresses: false }),
    ]);
    const opened = await openJudgeSession(model, JUDGE_INSTRUCTION_VARIANTS.reasoned);
    if (!opened.ok) throw new Error("the session did not open");
    const result = await judgePair(
      opened.base,
      candidate(1),
      1_000,
      JUDGE_RESPONSE_CONSTRAINTS.reasoned,
    );
    expect(result).toEqual({ ok: true, addresses: false });
    expect(model.prompts[0]?.options?.responseConstraint).toEqual(
      JUDGE_RESPONSE_CONSTRAINTS.reasoned,
    );
  });

  it("opens a session with the instructions it is given", async () => {
    const model = new FakeModel([]);
    const opened = await openJudgeSession(model, JUDGE_INSTRUCTION_VARIANTS.strict);
    expect(opened.ok).toBe(true);
    expect(model.systemPrompts).toEqual([JUDGE_INSTRUCTION_VARIANTS.strict]);
  });
});

describe("judge prompt and answer", () => {
  it("gives the concern, the solution and the shared concepts", () => {
    expect(judgePrompt(candidate(1))).toBe(
      "Concern: Concern 1.\nSolution: Solution 1.\nShared concepts: OPFS, Web Worker",
    );
  });

  it("reads only an answer with a boolean", () => {
    expect(parseJudgement(yes)).toBe(true);
    expect(parseJudgement(no)).toBe(false);
    expect(parseJudgement('{"addresses":"yes"}')).toBeNull();
    expect(parseJudgement("yes")).toBeNull();
    expect(parseJudgement(JSON.stringify({ problem: "p", remedy: "r", addresses: true }))).toBe(
      true,
    );
  });
});
