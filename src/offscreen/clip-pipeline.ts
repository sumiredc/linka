// 記憶（UC1）の処理本体。本文の抽出（またはサンプルの事前抽出データ）からグラフへの書き込みまでを offscreen document で行う
import { unreadableUrlReason } from "../content/unreadable-url";
import { chunkText } from "../shared/chunk-text";
import { claimId } from "../shared/claim-id";
import type {
  ClipBody,
  ClipEvent,
  ClipFailure,
  ClipProgress,
  ClippedPage,
  ClipResult,
  ClipStage,
  ClipTarget,
} from "../shared/clip-status";
import { pageUrlOf } from "../shared/clip-status";
import type { CypherStatement } from "../shared/cypher";
import type { Clip } from "../shared/extraction";
import {
  type AddressesLink,
  buildAddressesStatement,
  buildClipStatements,
  buildReclipStatements,
  clipRows,
} from "../shared/graph-statements";
import { type DbResponse, failure } from "../shared/messages";
import type { LanguageModelStatic } from "../shared/prompt-api";
import { loadSample } from "../shared/sample-page";
import { normalizeUrl } from "../shared/url";
import { buildUndoStatements, type ClipDb, readSnapshot, type UndoJournal } from "./clip-undo";
import { type ExtractOptions, extractPage } from "./extract";

/** 取り消しの文はどれも何度流しても同じ結果になるので、DB の作り直しなどで失敗しても流し直す */
const UNDO_ATTEMPTS = 3;

export type ClipPipelineOptions = {
  db: ClipDb;
  api(): LanguageModelStatic | null;
  journal: UndoJournal;
  /** 拡張機能のルートの URL（`chrome-extension://<id>/`）。サンプルページの見分けに使う */
  extensionRoot: string;
  onEvent(event: ClipEvent): void;
  now?(): string;
  fetchFile?(url: string): Promise<Response>;
  extract?: Omit<ExtractOptions, "onPart">;
};

type Prepared = { clip: Clip; addresses: AddressesLink[] | null };

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
    const url = pageUrlOf(tabUrl, this.options.extensionRoot);
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
      url = body.kind === "sample" ? body.page.url : normalizeUrl(tabUrl);
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
    let prepared: Prepared;
    try {
      prepared = await this.#prepare(target, body);
    } catch (error) {
      if (error instanceof StepFailure) return { ok: false, error: error.failure };
      throw error;
    }
    this.#setStage(target, { kind: "writing" });
    return this.#write(prepared);
  }

  async #prepare(target: ClipTarget, body: ClipBody): Promise<Prepared> {
    const clippedAt = this.options.now?.() ?? new Date().toISOString();
    if (body.kind === "sample") {
      let loaded: Awaited<ReturnType<typeof loadSample>>;
      try {
        loaded = await loadSample(body.page, clippedAt, this.options.fetchFile);
      } catch (error) {
        throw new StepFailure({ kind: "sample", message: messageOf(error) });
      }
      // 事前抽出データの組は、ストアに今ある Claim に対してだけ張る（Reset 後などで相手が無ければ黙って飛ばす）
      const addresses = loaded.addresses.map(({ solution, concern }) => ({
        solution: claimId(solution.page, solution.statement),
        concern: claimId(concern.page, concern.statement),
      }));
      return { clip: loaded.clip, addresses };
    }

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
    return {
      clip: {
        url: target.url,
        title: target.title,
        clippedAt,
        source: "page",
        extraction: extracted.extraction,
      },
      // ページをまたぐつながりの判定（UC2）はここではしない
      addresses: null,
    };
  }

  /**
   * 書く前に触れうる部分を読み、取り消しの文を先に残してから書く。
   * 途中で失敗したら取り消しの文を流し、記憶の前のグラフに戻す
   */
  async #write({ clip, addresses }: Prepared): Promise<ClipResult> {
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
      this.options.journal.set({ url: rows.url, statements: undo });
    } catch (error) {
      // まだ何も書いていない
      return writeFailure(`could not prepare to write: ${messageOf(error)}`, true);
    }

    const statements = [
      ...(isNew ? [] : buildReclipStatements(rows.url)),
      ...buildClipStatements(clip),
    ];
    for (const statement of statements) {
      const response = await this.#db.execute(statement);
      if (!response.ok) return this.#undo(undo, dbError(response));
    }
    let connections: number | null = null;
    if (addresses) {
      const response = await this.#db.execute(buildAddressesStatement(addresses));
      if (!response.ok) return this.#undo(undo, dbError(response));
      connections = response.value.stats.relationships_created ?? 0;
    }
    this.options.journal.clear();
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
