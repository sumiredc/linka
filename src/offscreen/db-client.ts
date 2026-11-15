import {
  changedGraph,
  classifyExecute,
  classifyScript,
  type DbFailureKind,
  type DbNotification,
  type DbRequest,
  type DbResponse,
  type DbResultOf,
  failure,
  type RelateResult,
  type StorageState,
} from "../shared/messages";
import { EMPTINESS_QUERY, resetScript, type SeedProgressStore, seedPlan, shouldSeed } from "./seed";
import type { WorkerOp, WorkerRequest, WorkerResponse } from "./worker-protocol";

export type WorkerPort = { post(request: WorkerRequest): void; terminate(): void };

export type WorkerHandlers = {
  onMessage(response: WorkerResponse): void;
  /** worker のスクリプトが読み込めない、捕まえられなかった例外が起きた、など */
  onError(message: string): void;
};

export type Timers = {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export type DbClientOptions = {
  createWorker(handlers: WorkerHandlers): WorkerPort;
  uri: string;
  timeoutMs: number;
  /** OPFS が `storage locked` で開けないときに開き直す回数と間隔 */
  lockRetry?: { attempts: number; delayMs: number };
  onNotify?(notification: DbNotification): void;
  timers?: Timers;
  /** 空の DB を開いたときに入れ、`resetToDemo` で入れ直す Cypher スクリプト（`seed/demo.cypher`） */
  seed?: string;
  /** OPFS のストアへの投入の進み具合を、グラフの外に残す先 */
  seedProgress?: SeedProgressStore;
};

type DbOp = Exclude<DbRequest, { kind: "status" }>;
type Job = { request: DbOp; resolve(response: DbResponse): void };
type OpenFailure = {
  reason: string;
  /** refused は OPFS が使えないと言われたとき。locked と lost（時間切れ・trap）は使えない証拠にならない */
  cause: "locked" | "refused" | "lost";
};
type Outcome =
  | { kind: "response"; response: WorkerResponse }
  | { kind: "timeout" }
  | { kind: "crash"; message: string };

const defaultTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Relate を持つ worker に依頼を 1 件ずつ渡す。
 * execute は同期で途中で止められないので、時間切れと trap のときは worker ごと捨てて作り直す。
 */
export class DbClient {
  private readonly options: DbClientOptions;
  private readonly timers: Timers;
  private worker: WorkerPort | null = null;
  private inflight: { id: number; settle(outcome: Outcome): void } | null = null;
  private nextId = 1;
  private queue: Job[] = [];
  private pumping = false;
  private needsOpen = true;
  private opening = false;
  private opfsOpened = false;
  private storage: StorageState = { kind: "starting" };

  constructor(options: DbClientOptions) {
    this.options = options;
    this.timers = options.timers ?? defaultTimers;
    void this.pump();
  }

  request<R extends DbRequest>(request: R): Promise<DbResponse<DbResultOf<R>>>;
  request(request: DbRequest): Promise<DbResponse> {
    if (request.kind === "status") return Promise.resolve({ ok: true, value: this.storage });
    // 開き直しの最中なら、その結果をこの依頼にも使う（重ねて開くと自分のロックで失敗する）
    if (this.storage.kind === "unavailable" && !this.opening) this.needsOpen = true;
    return new Promise((resolve) => {
      this.queue.push({ request, resolve });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.needsOpen || this.queue.length > 0) {
        if (this.needsOpen) {
          this.needsOpen = false;
          this.opening = true;
          try {
            await this.open();
          } finally {
            this.opening = false;
          }
        }
        if (this.storage.kind === "unavailable") {
          this.failQueue("unavailable", `database is unavailable: ${this.storage.reason}`);
          continue;
        }
        const job = this.queue.shift();
        if (job) await this.run(job);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async run(job: Job): Promise<void> {
    let op: WorkerOp;
    try {
      op = toWorkerOp(job.request, this.options.seed);
    } catch (error) {
      job.resolve(failure("exception", messageOf(error)));
      return;
    }
    // メモリ上の DB は開くたびに入れ直すので、進み具合は OPFS のストアの分だけ残す
    const progress =
      job.request.kind === "resetToDemo" && this.storage.kind === "opfs"
        ? this.options.seedProgress
        : undefined;
    progress?.set("pending");
    const outcome = await this.call(op);
    if (outcome.kind === "response" && outcome.response.ok) {
      try {
        const value = outcome.response.value ?? [];
        const jsons = typeof value === "string" ? [value] : value;
        const result = typeof value === "string" ? classifyExecute(value) : classifyScript(jsons);
        if (result.ok) progress?.set("done");
        job.resolve(result);
        if (changedGraph(jsons)) this.notify({ type: "graphChanged" });
      } catch (error) {
        job.resolve(failure("exception", messageOf(error)));
      }
      return;
    }
    if (outcome.kind === "response" && !outcome.response.ok && !outcome.response.trap) {
      job.resolve(failure("exception", outcome.response.message));
      return;
    }
    job.resolve(failure(...describeLoss(outcome)));
    this.failQueue("restarting", "the database worker is restarting; try again");
    this.loseWorker();
  }

  /** 開いていた DB ごと worker を捨てて、開き直しを予約する */
  private loseWorker(): void {
    this.discardWorker();
    this.needsOpen = true;
    // 止めた依頼の途中までの書き込みが残っている、またはメモリ上の中身が消えたかもしれない
    this.notify({ type: "graphChanged" });
  }

  private async open(): Promise<void> {
    try {
      const opfs = await this.openOpfs();
      if (opfs === null) {
        this.opfsOpened = true;
        this.setStorage({ kind: "opfs" });
        return;
      }
      // 一度 OPFS で開けたあとにメモリへ切り替えると、その後の書き込みが再起動で黙って消える。
      // ロック・時間切れ・trap も OPFS が使えない証拠ではないので、どちらも開けないままにして次の依頼で開き直す
      if (this.opfsOpened || opfs.cause !== "refused") {
        this.becomeUnavailable(opfs.reason);
        return;
      }
      const memory = await this.openIn("memory");
      if (memory === null) {
        this.setStorage({ kind: "memory", reason: opfs.reason });
        return;
      }
      this.becomeUnavailable(`opfs: ${opfs.reason}; memory: ${memory.reason}`);
    } catch (error) {
      this.becomeUnavailable(messageOf(error));
    }
  }

  private becomeUnavailable(reason: string): void {
    this.discardWorker();
    this.setStorage({ kind: "unavailable", reason });
  }

  private async openOpfs(): Promise<OpenFailure | null> {
    // terminate した worker の OPFS のロックはすぐには外れないので、作り直した直後は少し待って開き直す
    const { attempts, delayMs } = this.options.lockRetry ?? { attempts: 1, delayMs: 0 };
    for (let attempt = 1; ; attempt++) {
      const result = await this.openIn("opfs");
      if (result?.cause !== "locked" || attempt >= attempts) return result;
      await new Promise<void>((resolve) => this.timers.set(resolve, delayMs));
    }
  }

  private async openIn(mode: "opfs" | "memory"): Promise<OpenFailure | null> {
    if (!this.worker) this.spawn();
    const outcome = await this.call({ op: "open", mode, uri: this.options.uri });
    if (outcome.kind === "response" && outcome.response.ok) return this.seed(mode);
    const reason = describeLoss(outcome)[1];
    if (outcome.kind === "response" && !outcome.response.ok && !outcome.response.trap) {
      // 開くのに失敗しただけなので worker はそのまま使える
      return { reason, cause: /storage locked/i.test(reason) ? "locked" : "refused" };
    }
    return this.lostWhileOpening(outcome);
  }

  /** 開いた直後、待っている依頼より先にデモデータを入れる。メモリ上の DB は開くたびに空なので毎回入る */
  private async seed(mode: "opfs" | "memory"): Promise<OpenFailure | null> {
    const seed = this.options.seed;
    if (seed === undefined) return null;
    const progress = mode === "opfs" ? this.options.seedProgress : undefined;
    const plan = seedPlan(progress?.get() ?? null);
    if (plan === "none") return null;
    if (plan === "ifEmpty") {
      const check = await this.call({ op: "execute", query: EMPTINESS_QUERY, params: null });
      if (isLost(check)) return this.lostWhileOpening(check);
      const checked = classifyCheck(check);
      if (!shouldSeed(checked)) {
        // 記録の無いまま中身のあるストアは、投入の要らない利用者のグラフとして扱う
        if (checked.ok) progress?.set("done");
        return null;
      }
    }
    progress?.set("pending");
    const script = plan === "finish" ? resetScript(seed) : seed;
    const seeded = await this.call({ op: "executeScript", script, params: null });
    if (isLost(seeded)) return this.lostWhileOpening(seeded);
    // Relate のエラーで途中までしか入らなくても DB は使えるので開けたことにし、pending のまま次に開くときに入れ直す
    if (scriptSucceeded(seeded)) progress?.set("done");
    this.notify({ type: "graphChanged" });
    return null;
  }

  private lostWhileOpening(outcome: Outcome): OpenFailure {
    this.discardWorker();
    return { reason: describeLoss(outcome)[1], cause: "lost" };
  }

  private spawn(): void {
    const port: WorkerPort = this.options.createWorker({
      onMessage: (response) => {
        if (this.worker === port && this.inflight?.id === response.id) {
          this.inflight.settle({ kind: "response", response });
        }
      },
      onError: (message) => {
        if (this.worker !== port) return;
        if (this.inflight) {
          this.inflight.settle({ kind: "crash", message });
          return;
        }
        // 依頼の無いときに worker が落ちた。次の依頼に備えて作り直す
        this.loseWorker();
        void this.pump();
      },
    });
    this.worker = port;
  }

  private call(op: WorkerOp): Promise<Outcome> {
    const worker = this.worker;
    if (!worker) return Promise.resolve({ kind: "crash", message: "no worker" });
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = this.timers.set(() => settle({ kind: "timeout" }), this.options.timeoutMs);
      const settle = (outcome: Outcome) => {
        this.timers.clear(timer);
        this.inflight = null;
        resolve(outcome);
      };
      this.inflight = { id, settle };
      try {
        worker.post({ ...op, id });
      } catch (error) {
        settle({
          kind: "response",
          response: { id, ok: false, message: messageOf(error), trap: false },
        });
      }
    });
  }

  private discardWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private failQueue(kind: DbFailureKind, message: string): void {
    for (const job of this.queue.splice(0)) job.resolve(failure(kind, message));
  }

  private setStorage(storage: StorageState): void {
    // メモリ上の DB は開くたびに空なので、同じ状態でも知らせる
    if (storage.kind !== "memory" && JSON.stringify(storage) === JSON.stringify(this.storage)) {
      return;
    }
    this.storage = storage;
    this.notify({ type: "storageChanged", storage });
  }

  private notify(notification: DbNotification): void {
    try {
      this.options.onNotify?.(notification);
    } catch {
      // 通知を受け取る側の失敗で DB の処理を止めない
    }
  }
}

function toWorkerOp(request: DbOp, seed: string | undefined): WorkerOp {
  if (request.kind === "resetToDemo") {
    if (seed === undefined) throw new Error("no demo data is bundled to reset to");
    return { op: "executeScript", script: resetScript(seed), params: null };
  }
  const params = request.params ? JSON.stringify(request.params) : null;
  return request.kind === "execute"
    ? { op: "execute", query: request.query, params }
    : { op: "executeScript", script: request.script, params };
}

/** 時間切れ・trap・worker が落ちた、のどれか。worker は作り直すしかない */
function isLost(outcome: Outcome): boolean {
  return outcome.kind !== "response" || (!outcome.response.ok && outcome.response.trap);
}

/** 投入のスクリプトがすべての文で成功したか */
function scriptSucceeded(outcome: Outcome): boolean {
  if (outcome.kind !== "response" || !outcome.response.ok) return false;
  const { value } = outcome.response;
  if (!Array.isArray(value)) return false;
  try {
    return classifyScript(value).ok;
  } catch {
    return false;
  }
}

function classifyCheck(outcome: Outcome): DbResponse<RelateResult> {
  if (outcome.kind !== "response" || !outcome.response.ok) {
    return failure(...describeLoss(outcome));
  }
  const { value } = outcome.response;
  if (typeof value !== "string") return failure("exception", "unexpected response");
  try {
    return classifyExecute(value);
  } catch (error) {
    return failure("exception", messageOf(error));
  }
}

function describeLoss(outcome: Outcome): [DbFailureKind, string] {
  switch (outcome.kind) {
    case "timeout":
      return ["timeout", "the database did not answer in time"];
    case "crash":
      return ["trap", outcome.message];
    case "response":
      return outcome.response.ok
        ? ["exception", "unexpected response"]
        : [outcome.response.trap ? "trap" : "exception", outcome.response.message];
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
