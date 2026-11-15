import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CypherStatement } from "../shared/cypher";
import {
  CANDIDATE_QUERIES,
  QUESTION_MAX_LENGTH,
  type QuestionChoice,
  QuestionChoiceSchema,
  RESULT_LIMIT,
} from "../shared/graph-question";
import { type DbResponse, failure, type RelateResult } from "../shared/messages";
import type {
  LanguageModelSession,
  LanguageModelStatic,
  PromptOptions,
} from "../shared/prompt-api";
import {
  CONCEPT_NAME_MAX_CHARS,
  GraphQuestions,
  PROMPT_CHAR_BUDGET,
  QUESTION_INSTRUCTIONS,
  questionPrompt,
  TITLE_MAX_CHARS,
} from "./answer-question";

type Answer = string | Error | "hang";

/** 答えを順に返す偽の Prompt API。clone ごとに 1 回だけ prompt を受け付ける */
class FakeModel implements LanguageModelStatic {
  readonly prompts: { input: string; options?: PromptOptions }[] = [];
  creates = 0;
  clones = 0;
  destroyed = 0;
  basesDestroyed = 0;
  /** この段階で答えない（期限の確かめ） */
  hang: "availability" | "create" | "clone" | null = null;
  /** 指定すると、base のセッションが入力の上限とトークン数の測定を持つ（1 文字 1 トークンと数える） */
  quota: number | null = null;
  readonly measured: number[] = [];

  constructor(
    private readonly answers: Answer[],
    public state = "available",
  ) {}

  availability() {
    if (this.hang === "availability") return new Promise<string>(() => {});
    return Promise.resolve(this.state);
  }

  create(): Promise<LanguageModelSession> {
    this.creates++;
    if (this.hang === "create") return new Promise<LanguageModelSession>(() => {});
    return Promise.resolve(this.session(true));
  }

  private session(isBase: boolean): LanguageModelSession {
    let used = false;
    const measuring =
      isBase && this.quota !== null
        ? {
            inputQuota: this.quota,
            inputUsage: 100,
            measureInputUsage: async (input: string) => {
              this.measured.push(input.length);
              return input.length;
            },
          }
        : {};
    return {
      ...measuring,
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
      clone: () => {
        this.clones++;
        if (this.hang === "clone") return new Promise<LanguageModelSession>(() => {});
        return Promise.resolve(this.session(false));
      },
      destroy: () => {
        if (isBase) this.basesDestroyed++;
        else this.destroyed++;
      },
    };
  }
}

const CONCEPT_ROWS = [
  { key: "opfs", name: "OPFS" },
  { key: "webworker", name: "Web Worker" },
];
const PAGE_ROWS = [{ url: "https://example.com/opfs", title: "Origin private file system" }];
/** グラフにはあるが、候補の上限でプロンプトに入らなかった概念 */
const RARE_CONCEPT = { key: "rarething", name: "Rare thing" };

const isLookup = (statement: CypherStatement) =>
  statement.query.includes("IN $keys") || statement.query.includes("CONTAINS $text");

/** 対象を探す文に、グラフ（候補より多い）から当てはまる行を返す */
function lookupRows(statement: CypherStatement, pages: typeof PAGE_ROWS) {
  const params = statement.params as { keys?: string[]; names?: string[]; text?: string };
  if (params.keys) {
    return [...CONCEPT_ROWS, RARE_CONCEPT].filter(
      (row) => params.keys?.includes(row.key) || params.names?.includes(row.name.toLowerCase()),
    );
  }
  return pages.filter((row) => row.title.toLowerCase().includes(params.text ?? ""));
}

const ok = (rows: Record<string, unknown>[]): DbResponse<RelateResult> => ({
  ok: true,
  value: { columns: Object.keys(rows[0] ?? {}), rows, stats: {} },
});

/** 候補を読む 2 文には決まった行を返し、それ以外の文には `answer` を返す偽の DB */
function fakeDb(
  answer: DbResponse<RelateResult> = ok([{ page: "Origin private file system", url: "u" }]),
  pages = PAGE_ROWS,
) {
  const executed: CypherStatement[] = [];
  return {
    executed,
    execute: async (statement: CypherStatement) => {
      executed.push(statement);
      if (statement === CANDIDATE_QUERIES.concepts) return ok(CONCEPT_ROWS);
      if (statement === CANDIDATE_QUERIES.pages) return ok(pages);
      if (isLookup(statement)) return ok(lookupRows(statement, pages));
      return answer;
    },
  };
}

const choice = (fields: Partial<QuestionChoice>) =>
  JSON.stringify({ kind: "none", concepts: [], page: "", moreThan: 0, ...fields });

function setup(answers: Answer[], db = fakeDb(), timeoutMs?: number, clipping = false) {
  const model = new FakeModel(answers);
  const questions = new GraphQuestions({
    api: () => model,
    execute: db.execute,
    clipping: () => clipping,
    timeoutMs,
  });
  return { model, db, questions };
}

/** 候補を読んだあとに実行した文 */
const asked = (db: ReturnType<typeof fakeDb>) =>
  db.executed.filter(
    (statement) =>
      statement !== CANDIDATE_QUERIES.concepts &&
      statement !== CANDIDATE_QUERIES.pages &&
      !isLookup(statement),
  );

describe("GraphQuestions.ask", () => {
  it("runs the prepared query for the chosen kind and target", async () => {
    const { questions, db } = setup([choice({ kind: "pagesMentioning", concepts: ["OPFS"] })]);
    const response = await questions.ask("Which pages mention OPFS?");
    expect(response).toMatchObject({
      ok: true,
      value: {
        kind: "answer",
        title: "Pages that mention OPFS",
        rows: [{ page: "Origin private file system", url: "u" }],
        truncated: false,
      },
    });
    expect(asked(db)).toHaveLength(1);
    expect(asked(db)[0]?.params).toEqual({ concept: "opfs", limit: RESULT_LIMIT });
  });

  it("returns the executed query with its parameters filled in", async () => {
    const { questions } = setup([choice({ kind: "pagesMentioning", concepts: ["opfs"] })]);
    const response = await questions.ask("Which pages mention OPFS?");
    if (!response.ok || response.value.kind !== "answer") throw new Error("no answer");
    expect(response.value.cypher).toContain("(c:Concept {key: 'opfs'})");
    expect(response.value.cypher).toContain(`LIMIT ${RESULT_LIMIT}`);
  });

  it("marks the answer truncated when it reaches the result limit", async () => {
    const rows = Array.from({ length: RESULT_LIMIT }, (_, index) => ({ page: `p${index}` }));
    const { questions } = setup(
      [choice({ kind: "pagesMentioning", concepts: ["OPFS"] })],
      fakeDb(ok(rows)),
    );
    const response = await questions.ask("Which pages mention OPFS?");
    expect(response).toMatchObject({ ok: true, value: { kind: "answer", truncated: true } });
  });

  it("does not mark an answer one row below the limit as truncated", async () => {
    const rows = Array.from({ length: RESULT_LIMIT - 1 }, (_, index) => ({ page: `p${index}` }));
    const { questions } = setup(
      [choice({ kind: "pagesMentioning", concepts: ["OPFS"] })],
      fakeDb(ok(rows)),
    );
    const response = await questions.ask("Which pages mention OPFS?");
    expect(response).toMatchObject({ ok: true, value: { kind: "answer", truncated: false } });
  });

  it("returns an answer with no rows when nothing matches", async () => {
    const { questions } = setup(
      [choice({ kind: "pagesMentioning", concepts: ["OPFS"] })],
      fakeDb(ok([])),
    );
    const response = await questions.ask("Which pages mention OPFS?");
    expect(response).toMatchObject({ ok: true, value: { kind: "answer", rows: [] } });
  });

  it("runs nothing when the question fits no kind, and lists the concepts in the graph", async () => {
    const { questions, db } = setup([choice({ kind: "none" })]);
    const response = await questions.ask("What should I worry about?");
    expect(response).toEqual({
      ok: true,
      value: {
        kind: "unanswerable",
        reason: "noKind",
        missing: [],
        matches: [],
        concepts: ["OPFS", "Web Worker"],
      },
    });
    expect(asked(db)).toEqual([]);
  });

  it("runs nothing when the target concept is not in the graph", async () => {
    const { questions, db } = setup([choice({ kind: "pagesMentioning", concepts: ["SQLite"] })]);
    const response = await questions.ask("Which pages mention SQLite?");
    expect(response).toMatchObject({
      ok: true,
      value: { kind: "unanswerable", reason: "unknownTarget", missing: ["SQLite"] },
    });
    expect(asked(db)).toEqual([]);
  });

  it("does not prompt when the graph has no pages", async () => {
    const { questions, model } = setup([choice({ kind: "claimCountsByType" })], fakeDb(ok([]), []));
    const response = await questions.ask("How many claims of each type are there?");
    expect(response).toMatchObject({
      ok: true,
      value: { kind: "unanswerable", reason: "emptyGraph" },
    });
    expect(model.prompts).toEqual([]);
  });

  it("does not prompt with a question over the length limit", async () => {
    const { questions, model } = setup([choice({ kind: "claimCountsByType" })]);
    const response = await questions.ask("x".repeat(QUESTION_MAX_LENGTH + 1));
    expect(response).toMatchObject({
      ok: true,
      value: { kind: "unanswerable", reason: "tooLong" },
    });
    expect(model.prompts).toEqual([]);
  });

  it("accepts a question at the length limit", async () => {
    const { questions, model } = setup([choice({ kind: "claimCountsByType" })]);
    await questions.ask("x".repeat(QUESTION_MAX_LENGTH));
    expect(model.prompts).toHaveLength(1);
  });

  it("fails at the model stage when the model is not available", async () => {
    const { questions, model, db } = setup([choice({ kind: "claimCountsByType" })]);
    model.state = "downloading";
    const response = await questions.ask("How many claims of each type are there?");
    expect(response).toEqual({
      ok: true,
      value: { kind: "failed", stage: "model", message: "the model is downloading", cypher: null },
    });
    expect(asked(db)).toEqual([]);
  });

  it("fails at the model stage when there is no Prompt API", async () => {
    const db = fakeDb();
    const questions = new GraphQuestions({
      api: () => null,
      execute: db.execute,
      clipping: () => false,
    });
    const response = await questions.ask("How many claims of each type are there?");
    expect(response).toMatchObject({ ok: true, value: { kind: "failed", stage: "model" } });
  });

  it("gives up when the model does not answer in time, and runs nothing", async () => {
    const { questions, db } = setup(["hang"], fakeDb(), 20);
    const response = await questions.ask("How many claims of each type are there?");
    expect(response).toEqual({
      ok: true,
      value: {
        kind: "failed",
        stage: "model",
        message: "Error: no answer within 0.02 s",
        cypher: null,
      },
    });
    expect(asked(db)).toEqual([]);
  });

  it("fails at the model stage when the answer has the wrong shape", async () => {
    const { questions } = setup([JSON.stringify({ kind: "dropEverything" })]);
    const response = await questions.ask("Delete all pages");
    expect(response).toMatchObject({
      ok: true,
      value: { kind: "failed", stage: "model", message: expect.stringContaining("kind") },
    });
  });

  it("fails at the query stage with the query when the database fails", async () => {
    const { questions } = setup(
      [choice({ kind: "claimCountsByType" })],
      fakeDb(failure("timeout", "the database did not answer in time")),
    );
    const response = await questions.ask("How many claims of each type are there?");
    expect(response).toMatchObject({
      ok: true,
      value: {
        kind: "failed",
        stage: "query",
        message: expect.stringContaining("did not finish in time"),
        cypher: expect.stringContaining("MATCH (cl:Claim)"),
      },
    });
  });

  it("passes the choice schema as the response constraint and lists the graph's names", async () => {
    const { questions, model } = setup([choice({ kind: "claimCountsByType" })]);
    await questions.ask("How many claims of each type are there?");
    expect(model.prompts[0]?.options?.responseConstraint).toEqual(
      z.toJSONSchema(QuestionChoiceSchema),
    );
    expect(model.prompts[0]?.input).toBe(
      questionPrompt("How many claims of each type are there?", {
        concepts: CONCEPT_ROWS,
        pages: PAGE_ROWS,
      }),
    );
    expect(model.prompts[0]?.input).toContain("OPFS; Web Worker");
    expect(model.prompts[0]?.input).toContain("- Origin private file system");
  });

  it("keeps one instructed session and prompts a fresh clone for each question", async () => {
    const { questions, model } = setup([
      choice({ kind: "claimCountsByType" }),
      choice({ kind: "claimCountsByType" }),
    ]);
    await questions.ask("How many claims of each type are there?");
    await questions.ask("How many claims of each type are there?");
    expect({ creates: model.creates, clones: model.clones, destroyed: model.destroyed }).toEqual({
      creates: 1,
      clones: 2,
      destroyed: 2,
    });
  });

  it("creates the instructed session again after a failed prompt", async () => {
    const { questions, model } = setup([
      new Error("kErrorUnknown"),
      choice({ kind: "claimCountsByType" }),
    ]);
    await questions.ask("How many claims of each type are there?");
    const second = await questions.ask("How many claims of each type are there?");
    expect(second).toMatchObject({ ok: true, value: { kind: "answer" } });
    expect({ creates: model.creates, basesDestroyed: model.basesDestroyed }).toEqual({
      creates: 2,
      basesDestroyed: 1,
    });
  });

  it("passes on a failure to read the candidate names", async () => {
    const questions = new GraphQuestions({
      api: () => new FakeModel([]),
      clipping: () => false,
      execute: async () => failure("unavailable", "the graph cannot be opened"),
    });
    expect(await questions.ask("Which pages mention OPFS?")).toEqual(
      failure("unavailable", "the graph cannot be opened"),
    );
  });
});

describe("GraphQuestions.ask while clipping", () => {
  it("turns the question away without reading the graph or prompting", async () => {
    const { questions, db, model } = setup(
      [choice({ kind: "claimCountsByType" })],
      fakeDb(),
      undefined,
      true,
    );
    expect(await questions.ask("How many claims of each type are there?")).toEqual({
      ok: true,
      value: { kind: "busy" },
    });
    expect(db.executed).toEqual([]);
    expect(model.prompts).toEqual([]);
  });
});

describe("GraphQuestions.ask targets", () => {
  it("finds a concept in the graph that was not among the prompt's candidates", async () => {
    const { questions, db } = setup([
      choice({ kind: "pagesMentioning", concepts: ["rare thing"] }),
    ]);
    const response = await questions.ask("Which pages mention Rare thing?");
    expect(response).toMatchObject({ ok: true, value: { kind: "answer" } });
    expect(asked(db)[0]?.params).toMatchObject({ concept: "rarething" });
  });

  it("lists the matching pages and runs nothing when the page is ambiguous", async () => {
    const pages = [
      { url: "https://a.example/", title: "Origin private file system" },
      { url: "https://b.example/", title: "Origin private file system" },
    ];
    const { questions, db } = setup(
      [choice({ kind: "pagesSolvingConcernsOfPage", page: "Origin private file system" })],
      fakeDb(undefined, pages),
    );
    const response = await questions.ask("Which pages solve the concerns on the OPFS page?");
    expect(response).toMatchObject({
      ok: true,
      value: { kind: "unanswerable", reason: "ambiguous", matches: pages },
    });
    expect(asked(db)).toEqual([]);
  });
});

describe("GraphQuestions.ask deadline", () => {
  for (const step of ["availability", "create", "clone"] as const) {
    it(`gives up when ${step} does not finish in time`, async () => {
      const { questions, model, db } = setup([choice({ kind: "claimCountsByType" })], fakeDb(), 20);
      model.hang = step;
      expect(await questions.ask("How many claims of each type are there?")).toEqual({
        ok: true,
        value: {
          kind: "failed",
          stage: "model",
          message: "Error: no answer within 0.02 s",
          cypher: null,
        },
      });
      expect(asked(db)).toEqual([]);
    });
  }

  it("creates the instructed session again after a create that never finished", async () => {
    const { questions, model } = setup([choice({ kind: "claimCountsByType" })], fakeDb(), 20);
    model.hang = "create";
    await questions.ask("How many claims of each type are there?");
    model.hang = null;
    const second = await questions.ask("How many claims of each type are there?");
    expect(second).toMatchObject({ ok: true, value: { kind: "answer" } });
    expect(model.creates).toBe(2);
  });
});

describe("GraphQuestions.ask prompt size", () => {
  const manyPages = Array.from({ length: 100 }, (_, index) => ({
    url: `https://example.com/${index}`,
    title: `Page ${index} ${"x".repeat(100)}`,
  }));

  it("trims the candidates until the measured prompt fits the session's input quota", async () => {
    const { questions, model } = setup(
      [choice({ kind: "claimCountsByType" })],
      fakeDb(undefined, manyPages),
    );
    model.quota = 3_000;
    await questions.ask("How many claims of each type are there?");
    const sent = model.prompts[0]?.input ?? "";
    // 1 文字 1 トークンの偽物で、上限 3000 から使用済み 100 と答えの分 200 を引いた長さ
    expect(sent.length).toBeLessThanOrEqual(2_700);
    expect(sent.length).toBeGreaterThan(1_500);
    expect(sent).toContain("Question: How many claims of each type are there?");
    expect(model.measured.length).toBeGreaterThan(1);
  });

  it("does not trim a prompt that already fits", async () => {
    const { questions, model } = setup([choice({ kind: "claimCountsByType" })]);
    model.quota = 9_216;
    await questions.ask("How many claims of each type are there?");
    expect(model.prompts[0]?.input).toBe(
      questionPrompt("How many claims of each type are there?", {
        concepts: CONCEPT_ROWS,
        pages: PAGE_ROWS,
      }),
    );
  });

  it("keeps to the character budget when tokens cannot be measured", async () => {
    const { questions, model } = setup(
      [choice({ kind: "claimCountsByType" })],
      fakeDb(undefined, manyPages),
    );
    await questions.ask("How many claims of each type are there?");
    expect(model.prompts[0]?.input.length).toBeLessThanOrEqual(PROMPT_CHAR_BUDGET);
  });
});

describe("questionPrompt", () => {
  const question = "Which pages mention OPFS?";

  it("shortens a long title to the title limit with an ellipsis", () => {
    const title = "t".repeat(TITLE_MAX_CHARS + 30);
    const prompt = questionPrompt(question, { concepts: [], pages: [{ url: "u", title }] });
    expect(prompt).toContain(`- ${"t".repeat(TITLE_MAX_CHARS - 1)}…\n`);
  });

  it("keeps a title at the limit whole", () => {
    const title = "t".repeat(TITLE_MAX_CHARS);
    const prompt = questionPrompt(question, { concepts: [], pages: [{ url: "u", title }] });
    expect(prompt).toContain(`- ${title}\n`);
  });

  it("shortens a long concept name", () => {
    const name = "n".repeat(CONCEPT_NAME_MAX_CHARS + 5);
    const prompt = questionPrompt(question, { concepts: [{ key: "k", name }], pages: [] });
    expect(prompt).toContain(`${"n".repeat(CONCEPT_NAME_MAX_CHARS - 1)}…`);
  });

  it("drops the last candidates first to fit the limit and keeps the question", () => {
    const pages = Array.from({ length: 20 }, (_, index) => ({
      url: `u${index}`,
      title: `Title ${index}`,
    }));
    const prompt = questionPrompt(question, { concepts: CONCEPT_ROWS, pages }, 200);
    expect(prompt.length).toBeLessThanOrEqual(200);
    expect(prompt).toContain("- Title 0\n");
    expect(prompt).not.toContain("- Title 19");
    expect(prompt.endsWith(`Question: ${question}`)).toBe(true);
  });
});

describe("QUESTION_INSTRUCTIONS", () => {
  it("describes every query kind with its example", () => {
    expect(QUESTION_INSTRUCTIONS).toContain("- pagesSolvingConcernsOfPage: ");
    expect(QUESTION_INSTRUCTIONS).toContain("What concerns are there about OPFS?");
    expect(QUESTION_INSTRUCTIONS).toContain("- none: ");
  });
});
