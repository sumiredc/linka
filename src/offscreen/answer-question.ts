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
  ELLIPSIS,
  KIND_SPECS,
  type PageRef,
  QUERY_KINDS,
  QUESTION_MAX_LENGTH,
  type QuestionChoice,
  QuestionChoiceSchema,
  RESULT_LIMIT,
  resolveChoice,
  targetLookup,
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
  '- page: for pagesSolvingConcernsOfPage, the page title copied exactly from the list of page titles; "" for the other kinds. If the question names a page that is not in the list, copy the name as written in the question.',
  '- moreThan: for conceptsOnManyPages, the number of pages a concept must exceed ("more than three pages" is 3, "at least three pages" is 2); 0 for the other kinds.',
].join("\n");

/**
 * 質問の 1 回の選択（モデルの用意・clone・プロンプトの大きさの測定・prompt）全体の打ち切り。
 * 実測では抽出 1 回が 10〜12 秒。質問は入力も出力も短いので、抽出より短く打ち切る
 */
export const QUESTION_TIMEOUT_MS = 60_000;

/** プロンプトに入れる名前 1 つの長さの上限 */
export const TITLE_MAX_CHARS = 120;
export const CONCEPT_NAME_MAX_CHARS = 60;

/**
 * トークン数を測れないときの、候補の名前を含むプロンプトの文字数の上限。
 * 日本語の題名は 1 文字が 1 トークン近くになるので、1 文字 1 トークンと見ても
 * 指示（約 700 トークン）と出力を足してコンテキスト（9216 トークン）に収まる長さにする
 */
export const PROMPT_CHAR_BUDGET = 6_000;

/** 測ったトークン数で詰めるとき、答えの分として残すトークン数 */
const OUTPUT_RESERVE_TOKENS = 200;

const RESPONSE_CONSTRAINT = z.toJSONSchema(QuestionChoiceSchema);

const shorten = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}${ELLIPSIS}` : text;

/**
 * 候補の名前と質問を並べたプロンプト。名前は 1 つずつ切り詰め、全体が `maxChars` を超えるなら
 * 一覧の後ろ（ページの少ない概念・古いページ）から、長いほうの一覧を削って収める
 */
export function questionPrompt(
  question: string,
  candidates: Candidates,
  maxChars = Number.POSITIVE_INFINITY,
): string {
  const names = candidates.concepts.map((concept) => shorten(concept.name, CONCEPT_NAME_MAX_CHARS));
  const titles = candidates.pages.map((page) => `- ${shorten(page.title, TITLE_MAX_CHARS)}`);
  const build = () =>
    [
      `Concepts in the graph: ${names.join("; ")}`,
      "Page titles in the graph:",
      ...titles,
      "",
      `Question: ${question}`,
    ].join("\n");
  let text = build();
  while (text.length > maxChars && names.length + titles.length > 0) {
    const titleChars = titles.reduce((sum, line) => sum + line.length + 1, 0);
    const nameChars = names.reduce((sum, name) => sum + name.length + 2, 0);
    if (titles.length > 0 && titleChars >= nameChars) titles.pop();
    else names.pop();
    text = build();
  }
  return text;
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

/**
 * 複数の段階をまとめて 1 つの期限で打ち切る。期限を過ぎると待っている段階を reject し、signal を abort する。
 * 期限の後に決着した値は `onLate` に渡す（できてしまったセッションを破棄するため）
 */
export class Deadline {
  readonly #controller = new AbortController();
  readonly #expired: Promise<never>;
  readonly #timer: ReturnType<typeof setTimeout>;
  #rejectExpired: (error: Error) => void = () => {};

  constructor(timeoutMs: number) {
    this.#expired = new Promise<never>((_, reject) => {
      this.#rejectExpired = reject;
    });
    this.#expired.catch(() => {});
    this.#timer = setTimeout(() => {
      const error = new Error(`no answer within ${timeoutMs / 1000} s`);
      // Chrome の prompt は abort の中で同期的に AbortError で reject するので、先に reject して race に勝たせる
      this.#rejectExpired(error);
      this.#controller.abort(error);
    }, timeoutMs);
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  race<T>(step: Promise<T>, onLate?: (value: T) => void): Promise<T> {
    if (onLate) {
      step.then(
        (value) => {
          if (this.signal.aborted) onLate(value);
        },
        () => {},
      );
    }
    return Promise.race([step, this.#expired]);
  }

  clear() {
    clearTimeout(this.#timer);
  }
}

export interface GraphQuestionsOptions {
  api(): LanguageModelStatic | null;
  execute(statement: CypherStatement): Promise<DbResponse<RelateResult>>;
  /** ページの記憶の最中か。記憶の抽出が Nano と DB を使っている間は、質問を後ろで待たせない */
  clipping(): boolean;
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
    if (this.options.clipping()) return { ok: true, value: { kind: "busy" } };
    const question = rawQuestion.trim();
    const candidates = await this.#candidates();
    if (!candidates.ok) return candidates;
    const conceptNames = candidates.value.concepts.map((concept) => concept.name);
    const unanswerable = (
      reason: Extract<AskResult, { kind: "unanswerable" }>["reason"],
      details: { missing?: string[]; matches?: PageRef[] } = {},
    ): DbResponse<AskResult> => ({
      ok: true,
      value: {
        kind: "unanswerable",
        reason,
        missing: details.missing ?? [],
        matches: details.matches ?? [],
        concepts: conceptNames,
      },
    });

    if (candidates.value.pages.length === 0) return unanswerable("emptyGraph");
    if (question === "") return unanswerable("noKind");
    if (question.length > QUESTION_MAX_LENGTH) return unanswerable("tooLong");

    const chosen = await this.#choose(question, candidates.value);
    if (!chosen.ok) return { ok: true, value: modelFailed(chosen.message) };
    const targets = await this.#targets(chosen.choice);
    if (!targets.ok) return targets;
    const resolved = resolveChoice(chosen.choice, targets.value);
    if (!resolved.ok) {
      switch (resolved.reason) {
        case "noKind":
          return unanswerable("noKind");
        case "unknownTarget":
          return unanswerable("unknownTarget", { missing: resolved.missing });
        case "ambiguous":
          return unanswerable("ambiguous", { matches: resolved.matches });
      }
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

  /** 選ばれた対象を DB で探す。プロンプトの候補は上限で切っているので、そこに無くてもグラフにはありうる */
  async #targets(choice: QuestionChoice): Promise<DbResponse<Candidates>> {
    const lookup = targetLookup(choice);
    if (!lookup) return { ok: true, value: { concepts: [], pages: [] } };
    const found = await this.options.execute(lookup);
    if (!found.ok) return found;
    return {
      ok: true,
      value: { concepts: toConceptRefs(found.value.rows), pages: toPageRefs(found.value.rows) },
    };
  }

  async #choose(
    question: string,
    candidates: Candidates,
  ): Promise<{ ok: true; choice: QuestionChoice } | { ok: false; message: string }> {
    const api = this.options.api();
    if (!api) return { ok: false, message: "the Prompt API is not available in this browser" };
    const started = performance.now();
    const deadline = new Deadline(this.options.timeoutMs ?? QUESTION_TIMEOUT_MS);
    let session: LanguageModelSession | null = null;
    let raw: string;
    try {
      const availability = await deadline.race(api.availability(LANGUAGES));
      if (availability !== "available") {
        return { ok: false, message: `the model is ${availability}` };
      }
      const base = await deadline.race(this.#baseSession(api));
      const input = await this.#fitPrompt(base, question, candidates, deadline);
      session = await deadline.race(base.clone(), (late) => late.destroy());
      raw = await deadline.race(
        session.prompt(input, { responseConstraint: RESPONSE_CONSTRAINT, signal: deadline.signal }),
      );
    } catch (error) {
      // 指示を入れたセッションが壊れていたか、作り終わらなかったかもしれないので、次の質問では作り直す
      this.#dropBase();
      return { ok: false, message: errorText(error) };
    } finally {
      deadline.clear();
      session?.destroy();
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      console.info(`[linka] question: ${seconds} s`);
    }
    const parsed = parseChoiceOutput(raw);
    if (!parsed.ok)
      return { ok: false, message: `the answer had an unexpected shape: ${parsed.issues}` };
    return parsed;
  }

  /**
   * セッションの入力の上限に収まるプロンプトを作る。トークン数を測れるなら測って、超えた分の割合だけ詰める。
   * 測れないときや、3 回詰めても収まらないときは、控えめな文字数の上限で作る
   */
  async #fitPrompt(
    base: LanguageModelSession,
    question: string,
    candidates: Candidates,
    deadline: Deadline,
  ): Promise<string> {
    const quota = base.inputQuota ?? base.contextWindow;
    const used = base.inputUsage ?? base.contextUsage ?? 0;
    const measure = (base.measureInputUsage ?? base.measureContextUsage)?.bind(base);
    if (!measure || !quota) return questionPrompt(question, candidates, PROMPT_CHAR_BUDGET);
    const available = quota - used - OUTPUT_RESERVE_TOKENS;
    let maxChars = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 3; attempt++) {
      const input = questionPrompt(question, candidates, maxChars);
      let tokens: number;
      try {
        tokens = await deadline.race(measure(input, { responseConstraint: RESPONSE_CONSTRAINT }));
      } catch (error) {
        if (deadline.signal.aborted) throw error;
        break;
      }
      if (tokens <= available) return input;
      maxChars = Math.floor(input.length * (available / tokens) * 0.9);
    }
    return questionPrompt(question, candidates, PROMPT_CHAR_BUDGET);
  }

  #baseSession(api: LanguageModelStatic): Promise<LanguageModelSession> {
    if (!this.#base) {
      const created = api.create({
        ...LANGUAGES,
        initialPrompts: [{ role: "system", content: QUESTION_INSTRUCTIONS }],
      });
      this.#base = created;
      created.catch(() => {
        if (this.#base === created) this.#base = null;
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
