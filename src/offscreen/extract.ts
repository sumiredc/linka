// Gemini Nano で本文から抽出する。Prompt API は引数で受け取り、テストでは偽物に差し替える
import { z } from "zod";
import { type Extraction, ExtractionSchema } from "../shared/extraction";
import { mergeExtractions } from "../shared/merge-extractions";
import {
  LANGUAGES,
  type LanguageModelSession,
  type LanguageModelStatic,
} from "../shared/prompt-api";
import { promptWithTimeout } from "./prompt-timeout";

export const EXTRACTION_INSTRUCTIONS = [
  "You extract structured notes from a part of a web page about software development.",
  "Return: a short summary of the text, the technical concepts it discusses (name and category), the authors of the page if the text names them, the claims it makes (statement, type, and the names of the concepts each claim is about), and pairs of related concepts.",
  "Claim types: benefit (an advantage of something), concern (a problem, risk or limitation), solution (a way to solve or avoid a problem), fact (a neutral statement).",
  'Concept names must be bare names as written in the page, such as "IndexedDB", "Web Worker" or "Storage quota": at most 4 words, with no parentheses, no colons, and no explanation, translation, abbreviation expansion or guess added to the name. Refer to each concept with exactly the same name everywhere.',
].join("\n");

/** 実測では 1 回 10〜12 秒。止まったままにしないための打ち切り */
export const PROMPT_TIMEOUT_MS = 90_000;

const RESPONSE_CONSTRAINT = z.toJSONSchema(ExtractionSchema);

export type ExtractionFailureKind =
  /** この環境では Nano が使えない */
  | "unavailable"
  /** モデルがまだ入っていない（downloadable・downloading） */
  | "notReady"
  /** 抽出する本文が無い */
  | "noText"
  /** 出力が期待する形でなかった（やり直しても） */
  | "invalidOutput"
  /** Prompt API の呼び出しが失敗した、または時間切れ */
  | "prompt";

export type ExtractionResult =
  | { ok: true; extraction: Extraction }
  | { ok: false; error: { kind: ExtractionFailureKind; message: string } };

export type ParsedOutput = { ok: true; extraction: Extraction } | { ok: false; issues: string };

/** モデルの出力を JSON として読み、共有のスキーマで確かめる */
export function parseExtractionOutput(raw: string): ParsedOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { ok: false, issues: `not JSON: ${error instanceof Error ? error.message : error}` };
  }
  const parsed = ExtractionSchema.safeParse(json);
  if (parsed.success) return { ok: true, extraction: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; "),
  };
}

export function chunkPrompt(title: string, chunk: string, index: number, count: number): string {
  const part = count > 1 ? `Part ${index + 1} of ${count} of the page.\n` : "";
  return `Title: ${title}\n${part}\n${chunk}`;
}

function failed(kind: ExtractionFailureKind, message: string): ExtractionResult {
  return { ok: false, error: { kind, message } };
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export interface ExtractOptions {
  timeoutMs?: number;
  /** 分割した本文の `part` 番目（1 から）を抽出し始めるときに呼ぶ */
  onPart?(part: number, parts: number): void;
}

/**
 * 分割した本文の 1 つを抽出する。同じセッションへの 2 回目の prompt は失敗するので、
 * 1 回ごとに指示を入れた base を clone して使い、使い終えたら破棄する。
 * 出力の形が違うときだけ、新しい clone で 1 回やり直す
 */
export async function extractChunk(
  base: LanguageModelSession,
  input: string,
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  const timeoutMs = options.timeoutMs ?? PROMPT_TIMEOUT_MS;
  let issues = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: string;
    let session: LanguageModelSession | null = null;
    try {
      session = await base.clone();
      raw = await promptWithTimeout(session, input, {
        responseConstraint: RESPONSE_CONSTRAINT,
        timeoutMs,
      });
    } catch (error) {
      return failed("prompt", errorText(error));
    } finally {
      session?.destroy();
    }
    const parsed = parseExtractionOutput(raw);
    if (parsed.ok) return parsed;
    issues = parsed.issues;
  }
  return failed("invalidOutput", `the output did not match the schema twice: ${issues}`);
}

/**
 * ページの本文を分割ごとに抽出し、{@link mergeExtractions} でまとめる。
 * どれか 1 つでも失敗したら、ページ全体を失敗にする（グラフを中途半端に変えないため）
 */
export async function extractPage(
  api: LanguageModelStatic | null,
  page: { title: string; chunks: readonly string[] },
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  const chunks = page.chunks.filter((chunk) => chunk.trim() !== "");
  if (chunks.length === 0) return failed("noText", "the page has no text to extract");
  if (!api) return failed("unavailable", "the Prompt API is not available in this browser");

  let availability: string;
  try {
    availability = await api.availability(LANGUAGES);
  } catch (error) {
    return failed("unavailable", errorText(error));
  }
  if (availability === "downloadable" || availability === "downloading") {
    return failed("notReady", `the model is ${availability}`);
  }
  if (availability !== "available") return failed("unavailable", `the model is ${availability}`);

  let base: LanguageModelSession;
  try {
    base = await api.create({
      ...LANGUAGES,
      initialPrompts: [{ role: "system", content: EXTRACTION_INSTRUCTIONS }],
    });
  } catch (error) {
    return failed("prompt", errorText(error));
  }
  try {
    const extractions: Extraction[] = [];
    for (const [index, chunk] of chunks.entries()) {
      options.onPart?.(index + 1, chunks.length);
      const started = performance.now();
      const result = await extractChunk(
        base,
        chunkPrompt(page.title, chunk, index, chunks.length),
        options,
      );
      // 分割の大きさを実測で調整するため、1 回ごとの所要時間を残す
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      console.info(
        `[linka] extract part ${index + 1}/${chunks.length}: ${seconds} s${result.ok ? "" : ` (failed: ${result.error.kind})`}`,
      );
      if (!result.ok) {
        return failed(
          result.error.kind,
          `part ${index + 1} of ${chunks.length}: ${result.error.message}`,
        );
      }
      extractions.push(result.extraction);
    }
    return { ok: true, extraction: mergeExtractions(extractions) };
  } finally {
    base.destroy();
  }
}
