// 記憶（UC1）の処理本体。本文の抽出からグラフへの書き込みまでを offscreen document で行う
import { unreadableUrlReason } from "../content/unreadable-url";
import { chunkText } from "../shared/chunk-text";
import type {
  ClipBody,
  ClipEvent,
  ClipFailure,
  ClipProgress,
  ClippedPage,
  ClipResult,
  ClipStage,
  ClipTarget,
  ConnectionsOutcome,
} from "../shared/clip-status";
import { pageUrlOf } from "../shared/clip-status";
import type { CypherStatement } from "../shared/cypher";
import type { Clip } from "../shared/extraction";
import {
  buildAddressesCandidatesStatement,
  buildAddressesStatement,
  buildClipStatements,
  buildReclipStatements,
  buildRemoveAddressesStatement,
  clipRows,
  toAddressesCandidates,
} from "../shared/graph-statements";
import { type DbResponse, failure, type RelateResult } from "../shared/messages";
import type { LanguageModelStatic } from "../shared/prompt-api";
import { normalizeUrl } from "../shared/url";
import { buildUndoStatements, type ClipDb, readSnapshot, type UndoJournal } from "./clip-undo";
import { type ExtractOptions, extractPage } from "./extract";
import { type JudgeOptions, judgeCandidates } from "./judge";

/** 取り消しの文はどれも何度流しても同じ結果になるので、DB の作り直しなどで失敗しても流し直す */
const UNDO_ATTEMPTS = 3;

export type ClipPipelineOptions = {
  db: ClipDb;
  api(): LanguageModelStatic | null;
  journal: UndoJournal;
  onEvent(event: ClipEvent): void;
  now?(): string;
  extract?: Omit<ExtractOptions, "onPart">;
  judge?: Omit<JudgeOptions, "onPair">;
};

class StepFailure extends Error {
  constructor(readonly failure: ClipFailure) {
    super(failure.message);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dbError(response: DbResponse): string {
  return response.ok ? "" : `${response.error.kind}: ${response.error.message}`;
}

/**
 * 記憶は同時に 1 つだけ行う。Nano のセッションも DB への書き込みの取り消しも、
 * ほかの記憶と混ざらないことを前提にしているため。別のページの依頼は待たせず断り、終わってから押し直してもらう（PRD UC1）
 */
export class ClipPipeline {
  #current: ClipProgress | null = null;
  #recovery: Promise<boolean> = Promise.resolve(true);
  /** 取り消しの文を残してから書き終えるまで。その間の取り消しの記録は、書いている最中の記憶のもの */
  #writing = false;
  /** 例外も失敗の返事にそろえ、書き込みの途中で投げられても取り消しまで進める */
  readonly #db: ClipDb;

  constructor(private readonly options: ClipPipelineOptions) {
    this.#db = {
      execute: async (statement) => {
        try {
          return await options.db.execute(statement);
        } catch (error) {
          return failure("exception", messageOf(error));
        }
      },
    };
    // 前回、書き込みの途中で offscreen document が閉じていたら、記憶を受け付ける前に取り消しておく
    void this.#undoPending();
  }

  current(): ClipProgress | null {
    return this.#current;
  }

  async isClipped(tabUrl: string): Promise<DbResponse<ClippedPage | null>> {
    const url = pageUrlOf(tabUrl);
    if (url === null) return { ok: true, value: null };
    // 書きかけのページを記憶済みと答えないよう、取り消しが残っていれば先に済ませる
    await this.#undoPending();
    const response = await this.#db.execute({
      query: "MATCH (p:Page {url: $url}) RETURN p.clippedAt AS clippedAt",
      params: { url },
    });
    if (!response.ok) return response;
    const row = response.value.rows[0];
    if (!row) return { ok: true, value: null };
    const clippedAt = typeof row.clippedAt === "string" ? row.clippedAt : null;
    return { ok: true, value: { url, clippedAt } };
  }

  async clip(tabUrl: string, title: string, body: ClipBody): Promise<ClipResult> {
    let url: string;
    try {
      url = normalizeUrl(tabUrl);
    } catch {
      return { ok: false, error: { kind: "invalidUrl", message: `not a URL: ${tabUrl}` } };
    }
    const target: ClipTarget = { url, tabUrl, title };
    const running = this.#current;
    if (running) {
      return running.target.url === url
        ? {
            ok: false,
            error: { kind: "alreadyClipping", message: "this page is already being clipped" },
          }
        : {
            ok: false,
            error: {
              kind: "busy",
              message: `another page is being clipped: ${running.target.title}`,
              clipping: running.target,
            },
          };
    }
    // await より前に印を付ける。間に別の依頼が入っても、同時に 2 つ走らせない
    this.#current = { target, stage: { kind: "preparing" } };
    this.#emit({ kind: "progress", progress: this.#current });
    let result: ClipResult;
    try {
      result = await this.#run(target, body);
    } catch (error) {
      result = { ok: false, error: { kind: "write", message: messageOf(error), restored: false } };
    } finally {
      this.#current = null;
    }
    this.#emit({ kind: "finished", target, result });
    return result;
  }

  async #run(target: ClipTarget, body: ClipBody): Promise<ClipResult> {
    let clip: Clip;
    try {
      clip = await this.#prepare(target, body);
    } catch (error) {
      if (error instanceof StepFailure) return { ok: false, error: error.failure };
      throw error;
    }
    this.#setStage(target, { kind: "writing" });
    const written = await this.#write(clip);
    if (!written.ok) return written;
    // UC1 の書き込みが済んでから判定する。ここで何が起きても、UC1 で入れた内容は戻さない
    const connections = await this.#connect(target, written.summary.url);
    return { ok: true, summary: { ...written.summary, connections } };
  }

  /**
   * そのページの Claim と別のページの Claim から組を集めて Nano に判定させ、解決すると答えた組に ADDRESSES を張る（UC2）。
   * 判定のどれかが失敗したら何も張らない
   */
  async #connect(target: ClipTarget, url: string): Promise<ConnectionsOutcome> {
    /** ADDRESSES を書き始めたか。そのあとの失敗では「何も張っていない」と言えない */
    let saving = false;
    try {
      const found = await this.#db.execute(buildAddressesCandidatesStatement(url));
      if (!found.ok) return notJudged(`could not look for candidates: ${dbError(found)}`);
      const candidates = toAddressesCandidates(found.value.rows);
      if (candidates.length === 0) return { kind: "judged", links: [] };
      const judged = await judgeCandidates(this.options.api(), candidates, {
        ...this.options.judge,
        onPair: (pair, pairs) => this.#setStage(target, { kind: "connecting", pair, pairs }),
      });
      if (!judged.ok) return notJudged(judged.error.message);
      if (judged.links.length === 0) return { kind: "judged", links: [] };
      saving = true;
      const written = await this.#db.execute(buildAddressesStatement(judged.links));
      if (!written.ok) {
        // 張りかけた分を消す。消しきれなくても、残るのは Nano が解決すると答えた組だけ
        const removed = await runUndo(this.#db, [buildRemoveAddressesStatement(judged.links)]);
        const reason = `could not save the connections: ${dbError(written)}`;
        return removed
          ? notJudged(reason)
          : unconfirmed(`${reason}; some of the connections Nano approved may remain`);
      }
      const linked = new Set(judged.links.map((link) => `${link.solution}\n${link.concern}`));
      return {
        kind: "judged",
        links: candidates
          .filter((pair) => linked.has(`${pair.solution.id}\n${pair.concern.id}`))
          .map(({ solution, concern }) => ({ solution, concern })),
      };
    } catch (error) {
      return saving ? unconfirmed(messageOf(error)) : notJudged(messageOf(error));
    }
  }

  async #prepare(target: ClipTarget, body: ClipBody): Promise<Clip> {
    const clippedAt = this.options.now?.() ?? new Date().toISOString();
    if (unreadableUrlReason(target.tabUrl, true) !== null) {
      throw new StepFailure({
        kind: "unreadable",
        message: `extensions cannot read this page: ${target.tabUrl}`,
      });
    }
    const extracted = await extractPage(
      this.options.api(),
      { title: target.title, chunks: chunkText(body.text) },
      {
        ...this.options.extract,
        onPart: (part, parts) => this.#setStage(target, { kind: "extracting", part, parts }),
      },
    );
    if (!extracted.ok) throw new StepFailure(extracted.error);
    // ページをまたぐつながりの判定（UC2）はここではしない
    return {
      url: target.url,
      title: target.title,
      clippedAt,
      source: "page",
      extraction: extracted.extraction,
    };
  }

  /**
   * 書く前に触れうる部分を読み、取り消しの文を先に残してから書く。
   * 途中で失敗したら取り消しの文を流し、記憶の前のグラフに戻す
   */
  async #write(clip: Clip): Promise<ClipResult> {
    if (!(await this.#undoPending())) {
      return writeFailure("an earlier clip that failed could not be undone yet", false);
    }
    const rows = clipRows(clip);
    let undo: CypherStatement[];
    let isNew: boolean;
    let newConcepts: number;
    try {
      const before = await readSnapshot(this.#db, rows);
      undo = buildUndoStatements(rows, before);
      isNew = before.page === null;
      const existing = new Set(before.concepts.map((concept) => concept.key));
      newConcepts = rows.concepts.filter((concept) => !existing.has(concept.key)).length;
    } catch (error) {
      // まだ何も書いていない
      return writeFailure(`could not prepare to write: ${messageOf(error)}`, true);
    }
    try {
      this.options.journal.set({ url: rows.url, statements: undo });
    } catch (error) {
      return writeFailure(`could not prepare to write: ${messageOf(error)}`, true);
    }

    this.#writing = true;
    try {
      const statements = [
        ...(isNew ? [] : buildReclipStatements(rows.url)),
        ...buildClipStatements(clip),
      ];
      for (const statement of statements) {
        const response = await this.#db.execute(statement);
        if (!response.ok) return await this.#undo(undo, dbError(response));
      }
      this.options.journal.clear();
      // #run が、書き込みのあとの判定（UC2）の結果で置き換える
      const connections: ConnectionsOutcome = notJudged("not judged yet");
      return {
        ok: true,
        summary: {
          url: rows.url,
          title: clip.title,
          concepts: rows.concepts.length,
          newConcepts,
          claims: rows.claims.length,
          newPage: isNew,
          connections,
        },
      };
    } finally {
      this.#writing = false;
    }
  }

  async #undo(statements: CypherStatement[], reason: string): Promise<ClipResult> {
    const restored = await runUndo(this.#db, statements);
    if (restored) this.options.journal.clear();
    return writeFailure(`could not write to the graph: ${reason}`, restored);
  }

  /** 取り消しの済んでいない書き込みがあれば取り消す。残っていなければ true */
  #undoPending(): Promise<boolean> {
    this.#recovery = this.#recovery.then(async () => {
      try {
        // 書いている最中の記憶の取り消しを流すと、その書き込みと混ざってグラフが壊れる
        if (this.#writing) return true;
        const pending = this.options.journal.get();
        if (!pending) return true;
        const restored = await runUndo(this.#db, pending.statements);
        if (restored) this.options.journal.clear();
        return restored;
      } catch {
        return false;
      }
    });
    return this.#recovery;
  }

  /**
   * グラフをまるごと消す依頼（Clear graph）を流す。記憶の最中は断る。
   * 取り消しの記録は読んだときのグラフにだけ使えるので、消す前に捨てる。
   * 流し終えられない取り消しが記憶を止め続けたときの逃げ道にもなる
   */
  async replaceGraph<T>(run: () => Promise<DbResponse<T>>): Promise<DbResponse<T>> {
    // 流している途中の取り消しが、消したあとのグラフに混ざらないよう終わるのを待つ
    await this.#recovery;
    const running = this.#current;
    if (running) {
      return failure(
        "busy",
        `Linka is clipping “${running.target.title}”. Try again when it finishes.`,
      );
    }
    this.options.journal.clear();
    return run();
  }

  /**
   * スクリプトを流す。サイドパネルはグラフを読むのにも使うので、記憶の最中でも断らない。
   * グラフを変えたなら、それより前に読んだ取り消しの記録は使えないので捨てる
   */
  async runScript(
    run: () => Promise<DbResponse<RelateResult[]>>,
  ): Promise<DbResponse<RelateResult[]>> {
    const response = await run();
    const changed =
      response.ok &&
      response.value.some((result) => Object.values(result.stats).some((count) => count > 0));
    if (changed && this.#current === null) this.options.journal.clear();
    return response;
  }

  #setStage(target: ClipTarget, stage: ClipStage): void {
    if (this.#current?.target !== target) return;
    this.#current = { target, stage };
    this.#emit({ kind: "progress", progress: this.#current });
  }

  #emit(event: ClipEvent): void {
    try {
      this.options.onEvent(event);
    } catch {
      // 通知を受け取る側の失敗で記憶を止めない
    }
  }
}

function notJudged(reason: string): ConnectionsOutcome {
  return { kind: "notJudged", reason };
}

function unconfirmed(reason: string): ConnectionsOutcome {
  return { kind: "unconfirmed", reason };
}

function writeFailure(message: string, restored: boolean): ClipResult {
  return { ok: false, error: { kind: "write", message, restored } };
}

async function runUndo(db: ClipDb, statements: readonly CypherStatement[]): Promise<boolean> {
  for (let attempt = 1; attempt <= UNDO_ATTEMPTS; attempt++) {
    let failed = false;
    for (const statement of statements) {
      const response = await db.execute(statement);
      if (!response.ok) {
        failed = true;
        break;
      }
    }
    if (!failed) return true;
  }
  return false;
}
