/// <reference lib="webworker" />
// OPFS は dedicated worker の中でしか開けないので、Relate はここで持つ。
// 依頼は offscreen document が 1 件ずつ送ってくるので、ここでは順番を管理しない。
import init, { RelateDb } from "@relate/relate-wasm";
import wasmUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import { isWasmTrap } from "@relate/relate-wasm/trap.js";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

declare const self: DedicatedWorkerGlobalScope;

let ready: Promise<unknown> | null = null;
let db: RelateDb | null = null;

async function handle(request: WorkerRequest): Promise<string | string[] | null> {
  ready ??= init({ module_or_path: wasmUrl });
  await ready;
  switch (request.op) {
    case "open":
      db?.free();
      db = null;
      db = request.mode === "opfs" ? await RelateDb.open(request.uri) : new RelateDb();
      return null;
    case "execute":
      return requireDb().execute(request.query, request.params);
    case "executeScript":
      return requireDb().executeScript(request.script, request.params);
  }
}

function requireDb(): RelateDb {
  if (!db) throw new Error("database is not open");
  return db;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data;
  let response: WorkerResponse;
  try {
    response = { id, ok: true, value: await handle(event.data) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response = { id, ok: false, message, trap: isWasmTrap(error) };
  }
  self.postMessage(response);
};
