import type { RelateDb } from "@relate/relate-wasm";
import { describe, expect, it } from "vitest";
import seed from "../../seed/demo.cypher?raw";
import type { DbNotification } from "../shared/messages";
import { openMemoryDb } from "../shared/test/relate-node";
import { DbClient, type WorkerHandlers } from "./db-client";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

// DbClient を本物の Relate（Node 上のメモリ DB）につないで、初回の投入を確かめる

// PRD §13。CLI で seed/demo.cypher から作った data/linka.rl と同じ件数
const DEMO_COUNTS = { Page: 15, Concept: 29, Person: 9, Claim: 48, ADDRESSES: 11 };

/** OPFS の代わり。同じ store を開くと前回の中身が残っている */
type Store = { opfs: RelateDb | null; refuseOpfs: boolean };

function relateWorker(store: Store, handlers: WorkerHandlers) {
  let db: RelateDb | null = null;
  const handle = (request: WorkerRequest): WorkerResponse => {
    const { id } = request;
    switch (request.op) {
      case "open":
        if (request.mode === "memory") {
          db = openMemoryDb();
        } else if (store.refuseOpfs) {
          return { id, ok: false, message: "OPFS is not available", trap: false };
        } else {
          store.opfs ??= openMemoryDb();
          db = store.opfs;
        }
        return { id, ok: true, value: null };
      case "execute":
        return { id, ok: true, value: requireDb().execute(request.query, request.params) };
      case "executeScript":
        return { id, ok: true, value: requireDb().executeScript(request.script, request.params) };
    }
  };
  const requireDb = () => {
    if (!db) throw new Error("database is not open");
    return db;
  };
  return {
    post: (request: WorkerRequest) => {
      const response = handle(request);
      queueMicrotask(() => handlers.onMessage(response));
    },
    terminate: () => {},
  };
}

function connect(store: Store, options: { seed?: string } = { seed }) {
  const notifications: DbNotification[] = [];
  let crash = () => {};
  const client = new DbClient({
    uri: "opfs://test",
    timeoutMs: 10_000,
    createWorker: (handlers) => {
      crash = () => handlers.onError("crashed");
      return relateWorker(store, handlers);
    },
    onNotify: (n) => notifications.push(n),
    ...options,
  });
  return { client, notifications, crash: () => crash() };
}

async function value<T>(promise: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const response = await promise;
  if (!response.ok) throw new Error(JSON.stringify(response));
  return response.value;
}

async function run(client: DbClient, query: string) {
  return value(client.request({ kind: "execute", query }));
}

async function counts(client: DbClient) {
  const count = async (pattern: string) =>
    (await run(client, `MATCH ${pattern} RETURN count(*) AS n`)).rows[0]?.n;
  return {
    Page: await count("(:Page)"),
    Concept: await count("(:Concept)"),
    Person: await count("(:Person)"),
    Claim: await count("(:Claim)"),
    ADDRESSES: await count("()-[:ADDRESSES]->()"),
  };
}

const freshStore = (): Store => ({ opfs: null, refuseOpfs: false });

describe("seeding on open", () => {
  it("loads the demo data into an empty store before the first request", async () => {
    const { client, notifications } = connect(freshStore());
    expect(await counts(client)).toEqual(DEMO_COUNTS);
    expect(notifications).toContainEqual({ type: "graphChanged" });
  });

  it("leaves a store that already has a graph as it was", async () => {
    const store = freshStore();
    const first = connect(store).client;
    await run(first, "MATCH (p:Page) WITH p LIMIT 1 DETACH DELETE p");
    await run(first, "CREATE (:Page {url: 'https://example.com/mine'})");
    const before = await counts(first);

    const { client, notifications } = connect(store);
    expect(await counts(client)).toEqual(before);
    expect(notifications).not.toContainEqual({ type: "graphChanged" });
  });

  it("does not add the demo data to a store holding only the user's own pages", async () => {
    const store = freshStore();
    store.opfs = openMemoryDb();
    store.opfs.execute("CREATE (:Page {url: 'https://example.com/mine'})", null);
    const { client } = connect(store);
    expect((await counts(client)).Page).toBe(1);
  });

  it("loads the demo data into the in-memory store when OPFS cannot be used", async () => {
    const { client } = connect({ opfs: null, refuseOpfs: true });
    expect(await counts(client)).toEqual(DEMO_COUNTS);
    expect(await value(client.request({ kind: "status" }))).toMatchObject({ kind: "memory" });
  });

  it("loads the demo data again when the in-memory store is reopened empty", async () => {
    const { client, crash } = connect({ opfs: null, refuseOpfs: true });
    await run(client, "CREATE (:Page {url: 'https://example.com/lost'})");
    crash();
    expect(await counts(client)).toEqual(DEMO_COUNTS);
  });
});
