import init, { RelateDb } from "@relate/relate-wasm";
import wasmUrl from "@relate/relate-wasm/relate_bg.wasm?url";

export type Request =
  | { id: number; op: "open"; mode: "opfs" | "memory"; name?: string }
  | { id: number; op: "execute"; query: string; params?: Record<string, unknown> }
  | { id: number; op: "executeScript"; script: string }
  | { id: number; op: "reset" };

export type Response =
  | { id: number; ok: true; result: unknown; ms: number }
  | { id: number; ok: false; error: { name: string; message: string }; ms: number };

let ready: Promise<unknown> | null = null;
let db: RelateDb | null = null;

async function handle(req: Request): Promise<unknown> {
  ready ??= init({ module_or_path: wasmUrl });
  await ready;
  switch (req.op) {
    case "open":
      db?.free();
      db = req.mode === "opfs" ? await RelateDb.open(`opfs://${req.name}`) : new RelateDb();
      return { mode: req.mode };
    case "execute":
      return JSON.parse(requireDb().execute(req.query, req.params ? JSON.stringify(req.params) : null));
    case "executeScript":
      return requireDb().executeScript(req.script).map((e) => JSON.parse(e));
    case "reset":
      requireDb().reset();
      return null;
  }
}

function requireDb(): RelateDb {
  if (!db) throw new Error("database is not open");
  return db;
}

// execute は同期なので、メッセージを 1 件ずつ順に処理すれば呼び出しが重ならない。
let queue: Promise<void> = Promise.resolve();
self.onmessage = (ev: MessageEvent<Request>) => {
  const req = ev.data;
  queue = queue.then(async () => {
    const start = performance.now();
    try {
      const result = await handle(req);
      self.postMessage({ id: req.id, ok: true, result, ms: performance.now() - start } satisfies Response);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      self.postMessage({
        id: req.id,
        ok: false,
        error: { name: err.name, message: err.message },
        ms: performance.now() - start,
      } satisfies Response);
    }
  });
};
