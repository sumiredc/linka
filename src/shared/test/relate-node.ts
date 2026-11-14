import { initSync, RelateDb } from "@relate/relate-wasm";
import type { CypherStatement } from "../cypher";

// Node 上のテストで本物の Relate（メモリ上）を開くための補助。
// 同梱の init() は .wasm を fetch で読むが、Node の fetch は file: URL を読めないので、
// バイト列を読んで initSync に渡す。@types/node は入れていないので、使う形だけを型にする
interface NodeBuiltins {
  getBuiltinModule(id: "node:fs"): { readFileSync(path: string): Uint8Array };
  getBuiltinModule(id: "node:module"): {
    createRequire(from: string): { resolve(specifier: string): string };
  };
}

let initialized = false;

function initRelate(): void {
  if (initialized) return;
  const { process } = globalThis as unknown as { process: NodeBuiltins };
  const require = process.getBuiltinModule("node:module").createRequire(import.meta.url);
  const wasmPath = require.resolve("@relate/relate-wasm/relate_bg.wasm");
  initSync({ module: process.getBuiltinModule("node:fs").readFileSync(wasmPath) });
  initialized = true;
}

/** Relate の 1 文の結果（wire envelope のうちテストで見る部分）。 */
export interface RelateResult {
  columns: string[];
  rows: Record<string, unknown>[];
  error: string | null;
  stats: Record<string, number>;
}

/** 空のメモリ上の Relate を開く。 */
export function openMemoryDb(): RelateDb {
  initRelate();
  return new RelateDb();
}

function parseEnvelope(json: string, query: string): RelateResult {
  const result = JSON.parse(json) as RelateResult;
  if (result.error !== null) {
    throw new Error(`Relate がエラーを返しました: ${result.error}\n${query}`);
  }
  return result;
}

/** 1 文を流す。エラーは例外にする。 */
export function run(db: RelateDb, query: string, params?: CypherStatement["params"]): RelateResult {
  return parseEnvelope(db.execute(query, params ? JSON.stringify(params) : null), query);
}

/** パラメータ付きの文を順に流す。 */
export function runStatements(db: RelateDb, statements: readonly CypherStatement[]): void {
  for (const statement of statements) run(db, statement.query, statement.params);
}

/** `executeScript` でスクリプトを流す。途中でエラーになった文があれば例外にする。 */
export function runScript(db: RelateDb, script: string): RelateResult[] {
  return db.executeScript(script, null).map((json) => parseEnvelope(json, script));
}

/** 1 列 1 行を返す問い合わせの値。 */
export function scalar(db: RelateDb, query: string, params?: CypherStatement["params"]): unknown {
  const { columns, rows } = run(db, query, params);
  const column = columns[0];
  if (column === undefined || rows.length !== 1) {
    throw new Error(`1 列 1 行ではありません: ${query}`);
  }
  return rows[0]?.[column];
}
