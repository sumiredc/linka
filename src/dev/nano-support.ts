// 開発用。Nano の検証の画面で共有する小物（検証用ページの読み込み・抽出の 1 回・時間切れ）
import { z } from "zod";
import { type Extraction, ExtractionSchema } from "../shared/extraction";
import { htmlToText } from "./extraction-checks";
import type { LanguageModelSession } from "./language-model";
import crdtNotesSync from "./pages/crdt-notes-sync.html?raw";
import keepOfflineData from "./pages/keep-offline-data.html?raw";
import sqliteWorkerOwner from "./pages/sqlite-worker-owner.html?raw";
import { type Json, SCHEMA_VARIANTS, stripKeywords } from "./schema-keywords";

/** 抽出を試すページ。dev.html と一緒にだけバンドルに入る */
const PAGES: readonly { file: string; html: string }[] = [
  { file: "keep-offline-data.html", html: keepOfflineData },
  { file: "crdt-notes-sync.html", html: crdtNotesSync },
  { file: "sqlite-worker-owner.html", html: sqliteWorkerOwner },
];

export interface PageText {
  title: string;
  text: string;
}

/** 検証用のページ（src/dev/pages）の、タグを除いた本文 */
export async function loadSamples(): Promise<PageText[]> {
  return PAGES.map(({ file, html }) => {
    const title = new DOMParser().parseFromString(html, "text/html").title || file;
    return { title, text: htmlToText(html) };
  });
}

export function extractionJsonSchema(variantIndex: number): Json {
  const variant = SCHEMA_VARIANTS[variantIndex] ?? SCHEMA_VARIANTS[0];
  return stripKeywords(z.toJSONSchema(ExtractionSchema) as Json, variant?.strip ?? []);
}

export const PROMPT_TIMEOUT_MS = 90_000;

export function withTimeout<T>(promise: Promise<T>, ms = PROMPT_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${ms / 1000} 秒で打ち切り`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type ExtractionRun =
  | { ok: true; ms: number; extraction: Extraction; schemaIssues: string | null }
  | { ok: false; ms: number; error: string };

/** 1 回抽出する。zod で検査し、スキーマに合わない出力は schemaIssues に理由を入れて返す */
export async function extractOnce(
  session: LanguageModelSession,
  prompt: string,
  schema: Json,
): Promise<ExtractionRun> {
  const started = performance.now();
  try {
    const raw = await withTimeout(session.prompt(prompt, { responseConstraint: schema }));
    const ms = Math.round(performance.now() - started);
    const parsed = ExtractionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { ok: true, ms, extraction: parsed.data, schemaIssues: null };
    // 長さ・件数の制限を外したときは、制限を超えた出力でも中身は見たいので、そのまま使う
    return {
      ok: true,
      ms,
      extraction: JSON.parse(raw) as Extraction,
      schemaIssues: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  } catch (error) {
    return {
      ok: false,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}
