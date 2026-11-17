import type { RelateDb } from "@relate/relate-wasm";
import { describe, expect, it } from "vitest";
import seed from "../../seed/demo.cypher?raw";
import type { DbNotification } from "../shared/messages";
import { openMemoryDb } from "../shared/test/relate-node";
import { DbClient, type WorkerHandlers } from "./db-client";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

// DbClient を本物の Relate（Node 上のメモリ DB）につないで、空から始めることと Clear graph を確かめる

const EMPTY = { Page: 0, Concept: 0, Person: 0, Claim: 0, ADDRESSES: 0 };

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

function connect(store: Store) {
  const notifications: DbNotification[] = [];
  const client = new DbClient({
    uri: "opfs://test",
    timeoutMs: 10_000,
    createWorker: (handlers) => relateWorker(store, handlers),
    onNotify: (n) => notifications.push(n),
  });
  return { client, notifications };
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

/** 前のバージョンが入れたデモデータのように、すでにグラフがある OPFS のストア */
function storeWith(script: string): Store {
  const opfs = openMemoryDb();
  opfs.executeScript(script, null);
  return { opfs, refuseOpfs: false };
}

describe("opening the store", () => {
  it("starts with an empty graph and does not report a change", async () => {
    const { client, notifications } = connect(freshStore());
    expect(await counts(client)).toEqual(EMPTY);
    expect(notifications).not.toContainEqual({ type: "graphChanged" });
  });

  it("keeps the graph a store already holds", async () => {
    const store = storeWith(seed);
    const { client } = connect(store);
    expect((await counts(client)).Page).toBe(15);
  });

  it("starts the in-memory fallback empty too", async () => {
    const { client } = connect({ opfs: null, refuseOpfs: true });
    expect(await counts(client)).toEqual(EMPTY);
  });
});

describe("clearGraph", () => {
  it("deletes every node and relationship and reports a change", async () => {
    const { client, notifications } = connect(storeWith(seed));
    expect(await client.request({ kind: "clearGraph" })).toMatchObject({ ok: true });
    expect(await counts(client)).toEqual(EMPTY);
    expect(await run(client, "MATCH ()-[r]->() RETURN count(r) AS n")).toMatchObject({
      rows: [{ n: 0 }],
    });
    expect(notifications).toContainEqual({ type: "graphChanged" });
  });

  it("leaves the store empty the next time it opens", async () => {
    const store = storeWith(seed);
    await connect(store).client.request({ kind: "clearGraph" });
    expect(await counts(connect(store).client)).toEqual(EMPTY);
  });

  it("succeeds on a graph that is already empty", async () => {
    const { client } = connect(freshStore());
    expect(await client.request({ kind: "clearGraph" })).toMatchObject({ ok: true });
    expect(await counts(client)).toEqual(EMPTY);
  });
});
