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
  type StorageState,
} from "../shared/messages";
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
};

type DbOp = Exclude<DbRequest, { kind: "status" }>;
type Job = { request: DbOp; resolve(response: DbResponse): void };
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
  private storage: StorageState = { kind: "starting" };

  constructor(options: DbClientOptions) {
    this.options = options;
    this.timers = options.timers ?? defaultTimers;
    void this.pump();
  }

  request<R extends DbRequest>(request: R): Promise<DbResponse<DbResultOf<R>>>;
  request(request: DbRequest): Promise<DbResponse> {
    if (request.kind === "status") return Promise.resolve({ ok: true, value: this.storage });
    if (this.storage.kind === "unavailable") this.needsOpen = true;
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
          await this.open();
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
    const outcome = await this.call(toWorkerOp(job.request));
    if (outcome.kind === "response" && outcome.response.ok) {
      const value = outcome.response.value ?? [];
      const jsons = typeof value === "string" ? [value] : value;
      job.resolve(typeof value === "string" ? classifyExecute(value) : classifyScript(jsons));
      if (changedGraph(jsons)) this.options.onNotify?.({ type: "graphChanged" });
      return;
    }
    if (outcome.kind === "response" && !outcome.response.ok && !outcome.response.trap) {
      job.resolve(failure("exception", outcome.response.message));
      return;
    }
    job.resolve(failure(...describeLoss(outcome)));
    this.discardWorker();
    this.failQueue("restarting", "the database worker is restarting; try again");
    this.needsOpen = true;
  }

  private async open(): Promise<void> {
    const opfsFailure = await this.openOpfs();
    if (opfsFailure === null) {
      this.setStorage({ kind: "opfs" });
      return;
    }
    const memoryFailure = await this.openIn("memory");
    if (memoryFailure === null) {
      this.setStorage({ kind: "memory", reason: opfsFailure });
      return;
    }
    this.discardWorker();
    this.setStorage({
      kind: "unavailable",
      reason: `opfs: ${opfsFailure}; memory: ${memoryFailure}`,
    });
  }

  /** 開けたら null、開けなければ理由を返す */
  private async openOpfs(): Promise<string | null> {
    // terminate した worker の OPFS のロックはすぐには外れないので、作り直した直後は少し待って開き直す
    const { attempts, delayMs } = this.options.lockRetry ?? { attempts: 1, delayMs: 0 };
    for (let attempt = 1; ; attempt++) {
      const reason = await this.openIn("opfs");
      if (reason === null || attempt >= attempts || !/storage locked/i.test(reason)) return reason;
      await new Promise<void>((resolve) => this.timers.set(resolve, delayMs));
    }
  }

  private async openIn(mode: "opfs" | "memory"): Promise<string | null> {
    if (!this.worker) this.spawn();
    const outcome = await this.call({ op: "open", mode, uri: this.options.uri });
    if (outcome.kind === "response" && outcome.response.ok) return null;
    // 開くのに失敗しただけなら worker はそのまま使えるが、時間切れや trap なら作り直す
    if (outcome.kind !== "response" || (!outcome.response.ok && outcome.response.trap)) {
      this.discardWorker();
    }
    return describeLoss(outcome)[1];
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
        this.discardWorker();
        this.needsOpen = true;
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
      worker.post({ ...op, id });
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
    if (JSON.stringify(storage) === JSON.stringify(this.storage)) return;
    this.storage = storage;
    this.options.onNotify?.({ type: "storageChanged", storage });
  }
}

function toWorkerOp(request: DbOp): WorkerOp {
  const params = request.params ? JSON.stringify(request.params) : null;
  return request.kind === "execute"
    ? { op: "execute", query: request.query, params }
    : { op: "executeScript", script: request.script, params };
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
