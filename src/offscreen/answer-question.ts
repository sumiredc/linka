// 質問（PRD UC3）に答える。Gemini Nano に問い合わせの種類と対象を選ばせ、
// コードが作った読むだけの Cypher を DB で実行する。Prompt API と DB は引数で受け取り、テストでは偽物に差し替える
import { z } from "zod";
import { type CypherStatement, inlineParameters } from "../shared/cypher";
import {
  type AskResult,
  buildQuery,
  CANDIDATE_QUERIES,
  type Candidates,
  describePlan,
  KIND_SPECS,
  QUERY_KINDS,
  QUESTION_MAX_LENGTH,
  type QuestionChoice,
  QuestionChoiceSchema,
  RESULT_LIMIT,
  resolveChoice,
  toConceptRefs,
  toPageRefs,
} from "../shared/graph-question";
import type { DbResponse, RelateResult } from "../shared/messages";
import {
  LANGUAGES,
  type LanguageModelSession,
  type LanguageModelStatic,
} from "../shared/prompt-api";
import { detectWrite } from "../shared/write-detection";
import { promptWithTimeout } from "./prompt-timeout";

const KIND_LINES = QUERY_KINDS.map(
  (kind) => `- ${kind}: ${KIND_SPECS[kind].meaning}. Example: "${KIND_SPECS[kind].example}"`,
);

export const QUESTION_INSTRUCTIONS = [
  "You map a question about a personal knowledge graph of web pages to one of the query kinds below and pick its targets. You never answer the question yourself.",
  "",
  "Query kinds:",
  ...KIND_LINES,
  "- none: the question fits none of the kinds above, or it is too vague to pick one.",
  "",
  "Fields:",
  "- kind: one of the query kinds.",
  "- concepts: the concept names the question is about, copied exactly from the list of concepts in the graph. One name for kinds about one concept, two names for pagesMentioningBoth, [] for the other kinds. If the question names a concept that is not in the list, copy the name as written in the question.",
  '- page: for pagesSolvingConcernsOfPage, the page title copied exactly from the list of page titles; "" for the other kinds.',
  '- moreThan: for conceptsOnManyPages, the number of pages a concept must exceed ("more than three pages" is 3, "at least three pages" is 2); 0 for the other kinds.',
].join("\n");

/** 実測では抽出 1 回が 10〜12 秒。質問は入力も出力も短いので、抽出より短く打ち切る */
export const QUESTION_TIMEOUT_MS = 60_000;

const RESPONSE_CONSTRAINT = z.toJSONSchema(QuestionChoiceSchema);

export function questionPrompt(question: string, candidates: Candidates): string {
  return [
    `Concepts in the graph: ${candidates.concepts.map((concept) => concept.name).join("; ")}`,
    "Page titles in the graph:",
    ...candidates.pages.map((page) => `- ${page.title}`),
    "",
    `Question: ${question}`,
  ].join("\n");
}

export type ParsedChoice = { ok: true; choice: QuestionChoice } | { ok: false; issues: string };

export function parseChoiceOutput(raw: string): ParsedChoice {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { ok: false, issues: `not JSON: ${error instanceof Error ? error.message : error}` };
  }
  const parsed = QuestionChoiceSchema.safeParse(json);
  if (parsed.success) return { ok: true, choice: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; "),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

const modelFailed = (message: string): AskResult => ({
  kind: "failed",
  stage: "model",
  message,
  cypher: null,
});

export interface GraphQuestionsOptions {
  api(): LanguageModelStatic | null;
  execute(statement: CypherStatement): Promise<DbResponse<RelateResult>>;
  timeoutMs?: number;
}

/**
 * offscreen document で質問に答える。指示を入れたセッションを 1 つ持ち、質問ごとに clone して使う
 * （同じセッションへの 2 回目の prompt は失敗するため。PRD §4）
 */
export class GraphQuestions {
  #base: Promise<LanguageModelSession> | null = null;

  constructor(private readonly options: GraphQuestionsOptions) {}

  async ask(rawQuestion: string): Promise<DbResponse<AskResult>> {
    const question = rawQuestion.trim();
    const candidates = await this.#candidates();
    if (!candidates.ok) return candidates;
    const conceptNames = candidates.value.concepts.map((concept) => concept.name);
    const unanswerable = (
      reason: Extract<AskResult, { kind: "unanswerable" }>["reason"],
      missing: string[] = [],
    ): DbResponse<AskResult> => ({
      ok: true,
      value: { kind: "unanswerable", reason, missing, concepts: conceptNames },
    });

    if (candidates.value.pages.length === 0) return unanswerable("emptyGraph");
    if (question === "") return unanswerable("noKind");
    if (question.length > QUESTION_MAX_LENGTH) return unanswerable("tooLong");

    const chosen = await this.#choose(question, candidates.value);
    if (!chosen.ok) return { ok: true, value: modelFailed(chosen.message) };
    const resolved = resolveChoice(chosen.choice, candidates.value);
    if (!resolved.ok) {
      return unanswerable(
        resolved.reason,
        resolved.reason === "unknownTarget" ? resolved.missing : [],
      );
    }

    const statement = buildQuery(resolved.plan);
    const cypher = inlineParameters(statement);
    // 用意した文はテストで確かめているが、グラフを変えないことを実行の直前にも確かめる
    const write = detectWrite(statement.query);
    if (write) {
      return {
        ok: true,
        value: {
          kind: "failed",
          stage: "query",
          message: "the query would change the graph",
          cypher,
        },
      };
    }
    const result = await this.options.execute(statement);
    if (!result.ok) {
      return {
        ok: true,
        value: { kind: "failed", stage: "query", message: queryFailureText(result.error), cypher },
      };
    }
    return {
      ok: true,
      value: {
        kind: "answer",
        plan: resolved.plan,
        title: describePlan(resolved.plan),
        cypher,
        columns: result.value.columns,
        rows: result.value.rows,
        truncated: result.value.rows.length >= RESULT_LIMIT,
      },
    };
  }

  async #candidates(): Promise<DbResponse<Candidates>> {
    const concepts = await this.options.execute(CANDIDATE_QUERIES.concepts);
    if (!concepts.ok) return concepts;
    const pages = await this.options.execute(CANDIDATE_QUERIES.pages);
    if (!pages.ok) return pages;
    return {
      ok: true,
      value: { concepts: toConceptRefs(concepts.value.rows), pages: toPageRefs(pages.value.rows) },
    };
  }

  async #choose(
    question: string,
    candidates: Candidates,
  ): Promise<{ ok: true; choice: QuestionChoice } | { ok: false; message: string }> {
    const api = this.options.api();
    if (!api) return { ok: false, message: "the Prompt API is not available in this browser" };
    let availability: string;
    try {
      availability = await api.availability(LANGUAGES);
    } catch (error) {
      return { ok: false, message: errorText(error) };
    }
    if (availability !== "available") return { ok: false, message: `the model is ${availability}` };

    const timeoutMs = this.options.timeoutMs ?? QUESTION_TIMEOUT_MS;
    const started = performance.now();
    let session: LanguageModelSession | null = null;
    let raw: string;
    try {
      session = await (await this.#baseSession(api)).clone();
      raw = await promptWithTimeout(session, questionPrompt(question, candidates), {
        responseConstraint: RESPONSE_CONSTRAINT,
        timeoutMs,
      });
    } catch (error) {
      // 指示を入れたセッションが壊れていたかもしれないので、次の質問では作り直す
      this.#dropBase();
      return { ok: false, message: errorText(error) };
    } finally {
      session?.destroy();
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      console.info(`[linka] question: ${seconds} s`);
    }
    const parsed = parseChoiceOutput(raw);
    if (!parsed.ok)
      return { ok: false, message: `the answer had an unexpected shape: ${parsed.issues}` };
    return parsed;
  }

  #baseSession(api: LanguageModelStatic): Promise<LanguageModelSession> {
    if (!this.#base) {
      this.#base = api.create({
        ...LANGUAGES,
        initialPrompts: [{ role: "system", content: QUESTION_INSTRUCTIONS }],
      });
      this.#base.catch(() => {
        this.#base = null;
      });
    }
    return this.#base;
  }

  #dropBase() {
    const base = this.#base;
    this.#base = null;
    base?.then(
      (session) => session.destroy(),
      () => {},
    );
  }
}

function queryFailureText(error: { kind: string; message: string }): string {
  switch (error.kind) {
    case "timeout":
      return "the query did not finish in time and was stopped. The graph can be used again";
    case "restarting":
    case "trap":
      return `the database was restarting (${error.message}). Try again`;
    default:
      return error.message;
  }
}
