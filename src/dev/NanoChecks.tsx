import { useState } from "react";
import { z } from "zod";
import demoJson from "../../seed/demo.json?raw";
import { ExtractionSchema } from "../shared/extraction";
import { CypherCheck } from "./CypherCheck";
import {
  annotatedNames,
  conceptNames,
  EXTRACTION_PROMPTS,
  extractionPrompt,
  proposeChunk,
} from "./extraction-checks";
import {
  createSession,
  environmentText,
  errorText,
  type LanguageModelSession,
} from "./language-model";
import { extractionJsonSchema, extractOnce, loadSamples, type PageText } from "./nano-support";
import { PermissionChecks } from "./PermissionChecks";
import { type Json, listKeywords, SCHEMA_VARIANTS, stripKeywords } from "./schema-keywords";

// 開発用。PRD §13 の未決事項（Nano・権限）を確かめ、issue に貼る結果の文を作る。本番の画面からは使わない

type Reports = Record<string, string>;

const SHORT_TEXT =
  "OPFS gives each origin a private file system. SQLite Wasm can store its database there, but synchronous access handles only work inside a Web Worker.";

function measure(
  session: LanguageModelSession,
  input: string,
  options?: { responseConstraint?: unknown },
): Promise<number> | null {
  if (session.measureContextUsage) return session.measureContextUsage(input, options);
  if (session.measureInputUsage) return session.measureInputUsage(input, options);
  return null;
}

function SchemaCheck({ onReport }: { onReport: (text: string) => void }) {
  const [status, setStatus] = useState("");
  const run = async () => {
    const lines = [
      "## 1. responseConstraint に z.toJSONSchema(ExtractionSchema) を渡す",
      "",
      "```text",
    ];
    try {
      lines.push(await environmentText());
      const full = z.toJSONSchema(ExtractionSchema) as Json;
      lines.push(`スキーマのキーワード: ${listKeywords(full).join(", ")}`);
      const base = await createSession();
      for (const variant of SCHEMA_VARIANTS) {
        setStatus(`${variant.label} を試しています`);
        const session = await base.clone();
        const result = await extractOnce(
          session,
          extractionPrompt(EXTRACTION_PROMPTS[0].instructions, "OPFS note", SHORT_TEXT),
          stripKeywords(full, variant.strip),
        );
        session.destroy();
        lines.push(
          result.ok
            ? `${variant.label}: 受け付けた（${result.ms} ms）。出力の zod 検査: ${result.schemaIssues ?? "合格"}`
            : `${variant.label}: 拒否（${result.ms} ms） ${result.error}`,
        );
      }
      base.destroy();
      setStatus("完了");
    } catch (error) {
      lines.push(`中断: ${errorText(error)}`);
      setStatus(`中断: ${errorText(error)}`);
    }
    lines.push("```");
    onReport(lines.join("\n"));
  };
  return (
    <section>
      <h2>1. responseConstraint が受け付けるキーワード</h2>
      <button id="run-schema" type="button" onClick={run}>
        6 通りのスキーマで試す
      </button>{" "}
      <span>{status}</span>
    </section>
  );
}

function pagesWithPasted(samples: PageText[], pasted: string): PageText[] {
  return pasted.trim() ? [...samples, { title: "貼り付けた本文", text: pasted.trim() }] : samples;
}

function ContextCheck({
  onReport,
  pasted,
  schemaVariant,
}: {
  onReport: (text: string) => void;
  pasted: string;
  schemaVariant: number;
}) {
  const [status, setStatus] = useState("");
  const run = async () => {
    const lines = ["## 3. コンテキストの大きさと本文の分割", "", "```text"];
    try {
      lines.push(await environmentText());
      const schema = extractionJsonSchema(schemaVariant);
      lines.push(`スキーマ: ${SCHEMA_VARIANTS[schemaVariant]?.label}`);
      setStatus("セッションを作っています");
      const session = await createSession();
      const contextWindow = session.contextWindow ?? session.inputQuota;
      lines.push(
        `contextWindow: ${session.contextWindow ?? "無し"} / inputQuota: ${session.inputQuota ?? "無し"}`,
        `作った直後の使用量 contextUsage: ${session.contextUsage ?? "無し"} / inputUsage: ${session.inputUsage ?? "無し"}`,
        `計測の関数: ${session.measureContextUsage ? "measureContextUsage" : session.measureInputUsage ? "measureInputUsage" : "無し"}`,
      );
      const instructions = EXTRACTION_PROMPTS[1].instructions;
      const empty = extractionPrompt(instructions, "", "");
      const overhead = await measure(session, empty, { responseConstraint: schema });
      const overheadNoSchema = await measure(session, empty);
      if (overhead === undefined || overhead === null) throw new Error("計測の関数がありません");
      lines.push(
        `本文を除いた依頼文: ${overhead} トークン（スキーマ込み） / ${overheadNoSchema} トークン（スキーマ無し）`,
      );
      // 出力の大きさの目安：seed で一番大きい抽出結果を JSON にしたもの
      const clips = (JSON.parse(demoJson) as { clips: { extraction: unknown }[] }).clips;
      const largest = clips
        .map((clip) => JSON.stringify(clip.extraction))
        .sort((a, b) => b.length - a.length)[0];
      const outputTokens = largest ? await measure(session, largest) : 0;
      lines.push(
        `seed で一番大きい抽出結果の JSON: ${largest?.length} 文字 = ${outputTokens} トークン`,
      );

      let ratioSum = 0;
      let ratioCount = 0;
      const samples = pagesWithPasted(await loadSamples(), pasted);
      for (const page of samples) {
        const total = await measure(
          session,
          extractionPrompt(instructions, page.title, page.text),
          {
            responseConstraint: schema,
          },
        );
        const textTokens = (total ?? 0) - overhead;
        const ratio = textTokens > 0 ? page.text.length / textTokens : 0;
        if (ratio > 0) {
          ratioSum += ratio;
          ratioCount++;
        }
        lines.push(
          `${page.title}: 本文 ${page.text.length} 文字 = ${textTokens} トークン（${ratio.toFixed(2)} 文字/トークン）、依頼全体 ${total} トークン`,
        );
      }
      session.destroy();
      if (contextWindow) {
        const charsPerToken = ratioCount > 0 ? ratioSum / ratioCount : 4;
        const reserve = Math.ceil(((outputTokens ?? 0) * 2) / 100) * 100;
        const chunk = proposeChunk({
          contextWindow,
          overheadTokens: overhead,
          outputReserveTokens: reserve,
          charsPerToken,
        });
        lines.push(
          `提案: 出力に ${reserve} トークン（seed の最大の 2 倍）を残し、2 割の余裕を引いて、1 回に本文 ${chunk.tokens} トークン ≒ ${chunk.chars} 文字（${charsPerToken.toFixed(2)} 文字/トークン）`,
        );
      }
      setStatus("完了");
    } catch (error) {
      lines.push(`中断: ${errorText(error)}`);
      setStatus(`中断: ${errorText(error)}`);
    }
    lines.push("```");
    onReport(lines.join("\n"));
  };
  return (
    <section>
      <h2>3. コンテキストの大きさ（本文の分割）</h2>
      <button id="run-context" type="button" onClick={run}>
        計測する
      </button>{" "}
      <span>{status}</span>
    </section>
  );
}

function AnnotationCheck({
  onReport,
  pasted,
  schemaVariant,
}: {
  onReport: (text: string) => void;
  pasted: string;
  schemaVariant: number;
}) {
  const [status, setStatus] = useState("");
  const [repeat, setRepeat] = useState(2);
  const run = async () => {
    const lines = ["## 4. 概念名の注記（括弧・コロン・5 語以上）", "", "```text"];
    try {
      lines.push(await environmentText());
      lines.push(`スキーマ: ${SCHEMA_VARIANTS[schemaVariant]?.label} / 各 ${repeat} 回`);
      const schema = extractionJsonSchema(schemaVariant);
      const pages = pagesWithPasted(await loadSamples(), pasted);
      const base = await createSession();
      for (const prompt of EXTRACTION_PROMPTS) {
        let names = 0;
        let annotated = 0;
        let failures = 0;
        const examples: string[] = [];
        for (const page of pages) {
          for (let n = 0; n < repeat; n++) {
            setStatus(`${prompt.label}: ${page.title} (${n + 1}/${repeat})`);
            const session = await base.clone();
            const result = await extractOnce(
              session,
              extractionPrompt(prompt.instructions, page.title, page.text),
              schema,
            );
            session.destroy();
            if (!result.ok) {
              failures++;
              examples.push(`  失敗 ${page.title}: ${result.error}`);
              continue;
            }
            try {
              names += conceptNames(result.extraction).length;
              const found = annotatedNames(result.extraction);
              annotated += found.length;
              for (const item of found)
                examples.push(`  ${page.title}: "${item.name}"（${item.reason}）`);
            } catch (error) {
              failures++;
              examples.push(`  形が違う出力 ${page.title}: ${errorText(error)}`);
            }
          }
        }
        lines.push(
          `${prompt.label}: 概念名 ${names} 個のうち注記つき ${annotated} 個、失敗 ${failures} 回`,
          ...examples,
        );
      }
      base.destroy();
      setStatus("完了");
    } catch (error) {
      lines.push(`中断: ${errorText(error)}`);
      setStatus(`中断: ${errorText(error)}`);
    }
    lines.push("```");
    onReport(lines.join("\n"));
  };
  return (
    <section>
      <h2>4. 概念名に付く注記</h2>
      <p>
        同梱のサンプル 3
        ページ（と、下に貼った本文があればそれも）を、今の書き方と「概念名は名前だけ」の指示を足した書き方で抽出し、括弧・コロンを含むか
        5 語以上の概念名を数える
      </p>
      <label>
        各ページの回数{" "}
        <input
          type="number"
          min={1}
          max={5}
          value={repeat}
          onChange={(event) => setRepeat(Number(event.target.value) || 1)}
        />
      </label>{" "}
      <button id="run-annotation" type="button" onClick={run}>
        抽出して数える
      </button>{" "}
      <span>{status}</span>
    </section>
  );
}

const ORDER = ["schema", "cypher", "context", "annotation", "permissions"];

export function NanoChecks() {
  const [reports, setReports] = useState<Reports>({});
  const [pasted, setPasted] = useState("");
  const [schemaVariant, setSchemaVariant] = useState(0);
  const reporter = (id: string) => (text: string) =>
    setReports((previous) => ({ ...previous, [id]: text }));
  const combined = ORDER.flatMap((id) => (reports[id] ? [reports[id]] : [])).join("\n\n");

  return (
    <section>
      <h1>Nano・権限の検証（issue #10）</h1>
      <p>
        <label>
          3・4 で抽出に使うスキーマ{" "}
          <select
            value={schemaVariant}
            onChange={(event) => setSchemaVariant(Number(event.target.value))}
          >
            {SCHEMA_VARIANTS.map((variant, index) => (
              <option key={variant.label} value={index}>
                {variant.label}
              </option>
            ))}
          </select>
        </label>{" "}
        （1 で「そのまま」が拒否されたら、受け付けた版を選ぶ）
      </p>
      <p>
        <label>
          3・4
          に足す本文（実際の記事の本文を貼ると、典型的なページの大きさで測れる。空なら同梱のサンプルだけ）
          <br />
          <textarea
            rows={4}
            cols={80}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
          />
        </label>
      </p>
      <SchemaCheck onReport={reporter("schema")} />
      <CypherCheck onReport={reporter("cypher")} />
      <ContextCheck onReport={reporter("context")} pasted={pasted} schemaVariant={schemaVariant} />
      <AnnotationCheck
        onReport={reporter("annotation")}
        pasted={pasted}
        schemaVariant={schemaVariant}
      />
      <PermissionChecks onReport={reporter("permissions")} />
      <h2>issue に貼る結果</h2>
      <button
        id="copy-report"
        type="button"
        onClick={() => navigator.clipboard.writeText(combined)}
      >
        コピー
      </button>
      <br />
      <textarea id="report" readOnly rows={30} cols={100} value={combined} />
    </section>
  );
}
