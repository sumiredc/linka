import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DbNotification } from "../shared/messages";
import { DbClient, type DbClientOptions, type WorkerHandlers } from "./db-client";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

const TIMEOUT_MS = 1000;
const ok = (rows: Record<string, unknown>[] = [], stats: Record<string, number> = {}) =>
  JSON.stringify({ columns: [], rows, stats, error: null });

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

class FakeWorker {
  posted: WorkerRequest[] = [];
  terminated = false;
  constructor(readonly handlers: WorkerHandlers) {}
  post(request: WorkerRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  get last(): WorkerRequest {
    const request = this.posted.at(-1);
    if (!request) throw new Error("nothing posted");
    return request;
  }
  reply(response: DistributiveOmit<WorkerResponse, "id">) {
    this.handlers.onMessage({ ...response, id: this.last.id });
  }
}

function setup(options: Partial<DbClientOptions> = {}) {
  const workers: FakeWorker[] = [];
  const notifications: DbNotification[] = [];
  const client = new DbClient({
    uri: "opfs://test",
    timeoutMs: TIMEOUT_MS,
    createWorker: (handlers) => {
      const worker = new FakeWorker(handlers);
      workers.push(worker);
      return worker;
    },
    onNotify: (n) => notifications.push(n),
    ...options,
  });
  const current = () => {
    const worker = workers.at(-1);
    if (!worker) throw new Error("no worker");
    return worker;
  };
  return { client, workers, notifications, current };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function openedClient() {
  const ctx = setup();
  ctx.current().reply({ ok: true, value: null });
  await flush();
  return ctx;
}

function track<T>(promise: Promise<T>) {
  const state: { value?: T } = {};
  promise.then((value) => {
    state.value = value;
  });
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("DbClient", () => {
  it("sends the next request to the worker only after the previous one is answered", async () => {
    const { client, current } = await openedClient();
    client.request({ kind: "execute", query: "RETURN 1" });
    client.request({ kind: "execute", query: "RETURN 2" });
    await flush();
    expect(current().posted.map((r) => r.op)).toEqual(["open", "execute"]);

    current().reply({ ok: true, value: ok() });
    await flush();
    expect(current().posted.at(-1)).toMatchObject({ op: "execute", query: "RETURN 2" });
  });

  it("holds requests made before the database is open until the open finishes", async () => {
    const { client, current } = setup();
    client.request({ kind: "execute", query: "RETURN 1" });
    await flush();
    expect(current().posted.map((r) => r.op)).toEqual(["open"]);
  });

  it("returns the rows of a successful Relate result", async () => {
    const { client, current } = await openedClient();
    const response = client.request({ kind: "execute", query: "RETURN 1 AS n" });
    await flush();
    current().reply({ ok: true, value: ok([{ n: 1 }]) });
    expect(await response).toMatchObject({ ok: true, value: { rows: [{ n: 1 }] } });
  });

  it("classifies a Relate result with an error as a failure", async () => {
    const { client, current } = await openedClient();
    const response = client.request({ kind: "execute", query: "MATCH (n RETURN n" });
    await flush();
    current().reply({
      ok: true,
      value: JSON.stringify({ columns: [], rows: [], stats: {}, error: "syntax error" }),
    });
    expect(await response).toEqual({
      ok: false,
      error: { kind: "relate", message: "syntax error" },
    });
  });

  it("keeps the worker after a Relate error", async () => {
    const { client, workers, current } = await openedClient();
    const response = client.request({ kind: "execute", query: "BAD" });
    await flush();
    current().reply({ ok: true, value: JSON.stringify({ error: "syntax error" }) });
    await response;
    expect(workers).toHaveLength(1);
  });

  describe("when a request times out", () => {
    it("fails that request with a timeout", async () => {
      const { client } = await openedClient();
      const response = client.request({ kind: "execute", query: "slow" });
      await flush();
      vi.advanceTimersByTime(TIMEOUT_MS);
      expect(await response).toMatchObject({ ok: false, error: { kind: "timeout" } });
    });

    it("terminates the worker and opens the database in a new one", async () => {
      const { client, workers } = await openedClient();
      client.request({ kind: "execute", query: "slow" });
      await flush();
      vi.advanceTimersByTime(TIMEOUT_MS);
      await flush();
      expect(workers[0]?.terminated).toBe(true);
      expect(workers[1]?.posted).toMatchObject([{ op: "open", mode: "opfs", uri: "opfs://test" }]);
    });

    it("fails the requests that were waiting behind it", async () => {
      const { client } = await openedClient();
      client.request({ kind: "execute", query: "slow" });
      const waiting = client.request({ kind: "execute", query: "RETURN 1" });
      await flush();
      vi.advanceTimersByTime(TIMEOUT_MS);
      expect(await waiting).toMatchObject({ ok: false, error: { kind: "restarting" } });
    });

    it("does not count the time a request waited in the queue", async () => {
      const { client, current } = await openedClient();
      client.request({ kind: "execute", query: "first" });
      const second = track(client.request({ kind: "execute", query: "second" }));
      await flush();
      vi.advanceTimersByTime(TIMEOUT_MS - 1);
      current().reply({ ok: true, value: ok() });
      await flush();
      vi.advanceTimersByTime(TIMEOUT_MS - 1);
      await flush();
      expect(second.value).toBeUndefined();
    });
  });

  describe("when the wasm traps", () => {
    async function trapped() {
      const ctx = await openedClient();
      const response = ctx.client.request({ kind: "execute", query: "panic" });
      const waiting = ctx.client.request({ kind: "execute", query: "RETURN 1" });
      await flush();
      ctx.current().reply({ ok: false, message: "unreachable", trap: true });
      await flush();
      return { ...ctx, response, waiting };
    }

    it("fails that request with a trap", async () => {
      const { response } = await trapped();
      expect(await response).toMatchObject({ ok: false, error: { kind: "trap" } });
    });

    it("terminates the worker and opens the database in a new one", async () => {
      const { workers } = await trapped();
      expect(workers[0]?.terminated).toBe(true);
      expect(workers[1]?.posted).toMatchObject([{ op: "open", mode: "opfs" }]);
    });

    it("fails the requests that were waiting behind it", async () => {
      const { waiting } = await trapped();
      expect(await waiting).toMatchObject({ ok: false, error: { kind: "restarting" } });
    });

    it("runs a later request on the new worker", async () => {
      const { client, workers } = await trapped();
      workers[1]?.reply({ ok: true, value: null });
      client.request({ kind: "execute", query: "RETURN 1" });
      await flush();
      expect(workers[1]?.posted.at(-1)).toMatchObject({ op: "execute", query: "RETURN 1" });
    });
  });

  it("recreates the worker when it crashes during a request", async () => {
    const { client, workers, current } = await openedClient();
    const response = client.request({ kind: "execute", query: "RETURN 1" });
    await flush();
    current().handlers.onError("boom");
    await flush();
    expect(await response).toMatchObject({ ok: false, error: { kind: "trap" } });
    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });

  it("keeps the worker when it throws an error that is not a trap", async () => {
    const { client, workers, current } = await openedClient();
    const response = client.request({ kind: "execute", query: "RETURN 1" });
    await flush();
    current().reply({ ok: false, message: "bad params", trap: false });
    expect(await response).toMatchObject({ ok: false, error: { kind: "exception" } });
    expect(workers).toHaveLength(1);
  });

  describe("storage", () => {
    it("reports OPFS once the OPFS database is open", async () => {
      const { client } = await openedClient();
      expect(await client.request({ kind: "status" })).toEqual({
        ok: true,
        value: { kind: "opfs" },
      });
    });

    it("falls back to an in-memory database when OPFS cannot be opened", async () => {
      const { client, current } = setup();
      current().reply({ ok: false, message: "no OPFS here", trap: false });
      await flush();
      expect(current().last).toMatchObject({ op: "open", mode: "memory" });
      current().reply({ ok: true, value: null });
      await flush();
      expect(await client.request({ kind: "status" })).toEqual({
        ok: true,
        value: { kind: "memory", reason: "no OPFS here" },
      });
    });

    it("notifies the in-memory fallback", async () => {
      const { current, notifications } = setup();
      current().reply({ ok: false, message: "no OPFS here", trap: false });
      await flush();
      current().reply({ ok: true, value: null });
      await flush();
      expect(notifications).toContainEqual({
        type: "storageChanged",
        storage: { kind: "memory", reason: "no OPFS here" },
      });
    });

    it("fails requests as unavailable when neither OPFS nor memory can be opened", async () => {
      const { client, current } = setup();
      const response = client.request({ kind: "execute", query: "RETURN 1" });
      current().reply({ ok: false, message: "no opfs", trap: false });
      await flush();
      current().reply({ ok: false, message: "no wasm", trap: false });
      expect(await response).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    });

    it("opens OPFS again after a delay while the store is locked", async () => {
      const { current } = setup({ lockRetry: { attempts: 3, delayMs: 100 } });
      current().reply({ ok: false, message: "storage locked: opfs://test", trap: false });
      await flush();
      vi.advanceTimersByTime(100);
      await flush();
      expect(current().posted.map((r) => r.op === "open" && r.mode)).toEqual(["opfs", "opfs"]);
    });

    it("falls back to memory once the lock retries are used up", async () => {
      const { current } = setup({ lockRetry: { attempts: 2, delayMs: 100 } });
      for (let i = 0; i < 2; i++) {
        current().reply({ ok: false, message: "storage locked: opfs://test", trap: false });
        await flush();
        vi.advanceTimersByTime(100);
        await flush();
      }
      expect(current().posted.map((r) => r.op === "open" && r.mode)).toEqual([
        "opfs",
        "opfs",
        "memory",
      ]);
    });

    it("does not retry OPFS for a failure other than the lock", async () => {
      const { current } = setup({ lockRetry: { attempts: 3, delayMs: 100 } });
      current().reply({ ok: false, message: "no OPFS here", trap: false });
      await flush();
      expect(current().last).toMatchObject({ op: "open", mode: "memory" });
    });
  });

  it("notifies a graph change when a request wrote to the graph", async () => {
    const { client, current, notifications } = await openedClient();
    const response = client.request({ kind: "execute", query: "CREATE (:A)" });
    await flush();
    current().reply({ ok: true, value: ok([], { nodes_created: 1 }) });
    await response;
    expect(notifications).toContainEqual({ type: "graphChanged" });
  });

  it("does not notify a graph change for a read", async () => {
    const { client, current, notifications } = await openedClient();
    const response = client.request({ kind: "execute", query: "MATCH (n) RETURN n" });
    await flush();
    current().reply({ ok: true, value: ok([], { nodes_created: 0 }) });
    await response;
    expect(notifications).not.toContainEqual({ type: "graphChanged" });
  });

  it("sends Cypher parameters to the worker as JSON", async () => {
    const { client, current } = await openedClient();
    client.request({ kind: "execute", query: "RETURN $x", params: { x: 1 } });
    await flush();
    expect(current().last).toMatchObject({ params: '{"x":1}' });
  });
});
