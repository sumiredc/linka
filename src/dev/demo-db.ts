// 開発用。ページのスレッドでメモリ上の Relate を開き、seed/demo.cypher を入れる（offscreen の DB には触らない）
import init, { RelateDb } from "@relate/relate-wasm";
import wasmUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import { isWasmTrap } from "@relate/relate-wasm/trap.js";
import demoCypher from "../../seed/demo.cypher?raw";
import type { ExecuteResult } from "./cypher-retry";

let ready: Promise<unknown> | null = null;

interface Envelope {
  error: unknown;
  rows: unknown[];
}

function errorOf(envelope: Envelope): string | null {
  if (envelope.error === null || envelope.error === undefined) return null;
  return typeof envelope.error === "string" ? envelope.error : JSON.stringify(envelope.error);
}

export class DemoDb {
  #db: RelateDb | null = null;

  async open(): Promise<void> {
    ready ??= init({ module_or_path: wasmUrl });
    await ready;
    this.#db?.free();
    const db = new RelateDb();
    for (const json of db.executeScript(demoCypher, null)) {
      const error = errorOf(JSON.parse(json) as Envelope);
      if (error) throw new Error(`seed/demo.cypher の投入に失敗: ${error}`);
    }
    this.#db = db;
  }

  /** 1 文を実行する。panic（isWasmTrap）なら DB を開き直してからエラーとして返す */
  async execute(cypher: string): Promise<ExecuteResult> {
    if (!this.#db) await this.open();
    try {
      const envelope = JSON.parse((this.#db as RelateDb).execute(cypher, null)) as Envelope;
      const error = errorOf(envelope);
      return error ? { ok: false, error } : { ok: true, rows: envelope.rows };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isWasmTrap(error)) {
        await this.open();
        return { ok: false, error: `Relate が panic した（DB を開き直した）: ${message}` };
      }
      return { ok: false, error: message };
    }
  }
}
