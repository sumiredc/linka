import type { RelateDb } from "@relate/relate-wasm";
import { describe, expect, it } from "vitest";
import seed from "../../seed/demo.cypher?raw";
import type { DbNotification } from "../shared/messages";
import { openMemoryDb } from "../shared/test/relate-node";
import { DbClient, type WorkerHandlers } from "./db-client";
import type { SeedProgress } from "./seed";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

// DbClient を本物の Relate（Node 上のメモリ DB）につないで、初回の投入と Reset を確かめる

// PRD §13。CLI で seed/demo.cypher から作った data/linka.rl と同じ件数
const DEMO_COUNTS = { Page: 15, Concept: 29, Person: 9, Claim: 48, ADDRESSES: 11 };

/**
 * OPFS と localStorage の代わり。同じ store を開くと前回の中身が残っている。
 * interruptAfter を決めると、次のスクリプトはその数の文だけ流してから trap する
 */
type Store = {
  opfs: RelateDb | null;
  refuseOpfs: boolean;
  progress: SeedProgress | null;
  interruptAfter?: number;
};

function firstStatements(script: string, count: number): string {
  return `${script.split(";\n").slice(0, count).join(";\n")};`;
}

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
      case "executeScript": {
        const cut = store.interruptAfter;
        if (cut === undefined) {
          return { id, ok: true, value: requireDb().executeScript(request.script, request.params) };
        }
        store.interruptAfter = undefined;
        requireDb().executeScript(firstStatements(request.script, cut), request.params);
        return { id, ok: false, message: "unreachable", trap: true };
      }
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
    seedProgress: {
      get: () => store.progress,
      set: (progress) => {
        store.progress = progress;
      },
    },
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

const freshStore = (): Store => ({ opfs: null, refuseOpfs: false, progress: null });
const memoryOnly = (): Store => ({ opfs: null, refuseOpfs: true, progress: null });

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

  it("does not load the demo data again into a store the user emptied", async () => {
    const store = freshStore();
    const first = connect(store).client;
    await run(first, "MATCH (n) DETACH DELETE n");

    const { client } = connect(store);
    expect(await counts(client)).toEqual({
      Page: 0,
      Concept: 0,
      Person: 0,
      Claim: 0,
      ADDRESSES: 0,
    });
  });

  it("completes a seed that stopped partway when the store opens again", async () => {
    const store = { ...freshStore(), interruptAfter: 20 };
    const first = connect(store).client;
    expect(await first.request({ kind: "execute", query: "RETURN 1" })).toMatchObject({
      ok: false,
    });
    const partial = store.opfs?.execute("MATCH (p:Page) RETURN count(p) AS n", null);
    expect(JSON.parse(partial ?? "{}").rows[0].n).toBeLessThan(DEMO_COUNTS.Page);

    const { client } = connect(store);
    expect(await counts(client)).toEqual(DEMO_COUNTS);
    expect(store.progress).toBe("done");
  });

  it("does not add the demo data to a store holding only the user's own pages", async () => {
    const store = freshStore();
    store.opfs = openMemoryDb();
    store.opfs.execute("CREATE (:Page {url: 'https://example.com/mine'})", null);
    const { client } = connect(store);
    expect((await counts(client)).Page).toBe(1);
  });

  it("loads the demo data into the in-memory store when OPFS cannot be used", async () => {
    const store = memoryOnly();
    const { client } = connect(store);
    expect(await counts(client)).toEqual(DEMO_COUNTS);
    expect(store.progress).toBeNull();
    expect(await value(client.request({ kind: "status" }))).toMatchObject({ kind: "memory" });
  });

  it("loads the demo data again when the in-memory store is reopened empty", async () => {
    const { client, crash } = connect(memoryOnly());
    await run(client, "CREATE (:Page {url: 'https://example.com/lost'})");
    crash();
    expect(await counts(client)).toEqual(DEMO_COUNTS);
  });
});

describe("resetToDemo", () => {
  it("replaces whatever is in the graph with the demo data", async () => {
    const { client, notifications } = connect(freshStore());
    await run(client, "MATCH (c:Claim) WITH c LIMIT 5 DETACH DELETE c");
    await run(client, "CREATE (:Page {url: 'https://example.com/mine'})-[:MENTIONS]->(:Concept)");
    notifications.length = 0;

    const reset = await client.request({ kind: "resetToDemo" });
    expect(reset.ok).toBe(true);
    expect(await counts(client)).toEqual(DEMO_COUNTS);
    const mine = await run(client, "MATCH (p:Page {url: 'https://example.com/mine'}) RETURN p");
    expect(mine.rows).toEqual([]);
    expect(notifications).toContainEqual({ type: "graphChanged" });
  });

  it("keeps what the user adds after a reset on later starts", async () => {
    const store = freshStore();
    const first = connect(store).client;
    await first.request({ kind: "resetToDemo" });
    await run(first, "CREATE (:Page {url: 'https://example.com/mine'})");

    const { client } = connect(store);
    expect((await counts(client)).Page).toBe(DEMO_COUNTS.Page + 1);
  });

  it("completes a reset that stopped partway when the store opens again", async () => {
    const store = freshStore();
    const { client } = connect(store);
    await run(client, "CREATE (:Page {url: 'https://example.com/mine'})");
    store.interruptAfter = 30;
    expect(await client.request({ kind: "resetToDemo" })).toMatchObject({
      ok: false,
      error: { kind: "trap" },
    });
    expect(store.progress).toBe("pending");

    expect(await counts(client)).toEqual(DEMO_COUNTS);
    expect(store.progress).toBe("done");
  });

  it("fails without touching the graph when no demo data is bundled", async () => {
    const { client } = connect(freshStore(), {});
    await run(client, "CREATE (:Page {url: 'https://example.com/mine'})");
    const reset = await client.request({ kind: "resetToDemo" });
    expect(reset).toMatchObject({ ok: false, error: { kind: "exception" } });
    expect((await counts(client)).Page).toBe(1);
  });
});
