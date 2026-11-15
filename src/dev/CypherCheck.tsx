import { useState } from "react";
import { type QuestionRun, retryPrompt, runWithRetry, summarize } from "./cypher-retry";
import { DemoDb } from "./demo-db";
import { createSession, environmentText, errorText } from "./language-model";
import { withTimeout } from "./nano-support";
import { CYPHER_RESPONSE_SCHEMA, GRAPH_SCHEMA_PROMPT, QUESTIONS } from "./questions";

// 検証 2：デモデータ相手の 10 問で、Nano が書く Cypher がそのまま／作り直して実行できるか

type Mark = "unjudged" | "correct" | "wrong";

const OUTCOME_LABELS: Record<QuestionRun["outcome"], string> = {
  first: "1 回目で実行",
  retried: "作り直して実行",
  failed: "失敗",
  write: "書き込みで拒否",
};

/** 答えの Cypher の行数（ページのスレッドの Relate で seed が入ったことの確認にもなる） */
function referenceLine(rows: readonly (unknown[] | null)[]): string {
  return `答えの Cypher の行数: ${QUESTIONS.map((question, index) => `${question.id}=${rows[index]?.length ?? "-"}`).join(" ")}`;
}

function preview(rows: unknown[] | null, limit = 3): string {
  if (rows === null) return "-";
  const head = rows.slice(0, limit).map((row) => JSON.stringify(row));
  return `${rows.length} 行${head.length > 0 ? `\n${head.join("\n")}` : ""}${rows.length > limit ? "\n…" : ""}`;
}

/** execute には 1 文として渡すので、末尾の `;` は外す（本番でも同じ整形をする想定） */
function cleanCypher(raw: string): string {
  const parsed = JSON.parse(raw) as { cypher?: unknown };
  if (typeof parsed.cypher !== "string") throw new Error(`cypher がありません: ${raw}`);
  return parsed.cypher.trim().replace(/;+\s*$/, "");
}

export function CypherCheck({ onReport }: { onReport: (text: string) => void }) {
  const [withConceptNames, setWithConceptNames] = useState(false);
  const [runs, setRuns] = useState<(QuestionRun | null)[]>(QUESTIONS.map(() => null));
  const [references, setReferences] = useState<(unknown[] | null)[]>(QUESTIONS.map(() => null));
  const [marks, setMarks] = useState<Mark[]>(QUESTIONS.map(() => "unjudged"));
  const [status, setStatus] = useState("");
  const [environment, setEnvironment] = useState("");
  const [ranWithConceptNames, setRanWithConceptNames] = useState(false);

  const report = (
    nextRuns: (QuestionRun | null)[],
    nextMarks: Mark[],
    env: string,
    conceptNames: boolean,
    references: readonly (unknown[] | null)[],
  ) => {
    const summary = summarize(
      nextRuns,
      nextMarks.map((mark) => (mark === "unjudged" ? null : mark === "correct")),
    );
    const lines = [
      "## 2. Nano が書く Cypher（seed/demo.cypher の 15 ページ、メモリ上の Relate）",
      "",
      "```text",
      env,
      referenceLine(references),
      `プロンプトに概念名の一覧を入れる: ${conceptNames ? "はい" : "いいえ"}`,
      `1 回目で実行できた: ${summary.first}/${summary.total}`,
      `作り直し（最大 2 回）までに実行できた: ${summary.withinRetries}/${summary.total}（うち 0 行: ${summary.empty}）`,
      `書き込みで拒否: ${summary.write}、失敗: ${summary.failed}`,
      `答えが正しい: ${summary.correct}/${summary.total}（判定済み ${summary.judged}）`,
      `PRD §11 の基準（10 問中 5 問）: 実行できた ${summary.withinRetries >= 5 ? "満たす" : "満たさない"} / 正しい ${summary.correct >= 5 ? "満たす" : summary.judged < summary.total ? "未判定あり" : "満たさない"}`,
      "```",
    ];
    QUESTIONS.forEach((question, index) => {
      const run = nextRuns[index];
      if (!run) return;
      const last = run.attempts.at(-1);
      const mark = nextMarks[index];
      lines.push(
        "",
        `### ${question.id} ${question.text}`,
        "",
        `${question.kind} / ${OUTCOME_LABELS[run.outcome]} / ${last?.rows ? `${last.rows.length} 行` : "-"} / 正誤: ${mark === "correct" ? "正しい" : mark === "wrong" ? "誤り" : "未判定"} / 合計 ${run.totalMs} ms`,
      );
      run.attempts.forEach((attempt, n) => {
        lines.push(
          "",
          `試行 ${n + 1}（生成 ${attempt.generateMs} ms）${attempt.error ? `: ${attempt.error}` : `: ${attempt.rows?.length ?? 0} 行`}`,
          "",
          "```cypher",
          attempt.cypher || "(なし)",
          "```",
        );
      });
    });
    onReport(lines.join("\n"));
  };

  const runAll = async () => {
    const db = new DemoDb();
    let env = "";
    let referenceRows: (unknown[] | null)[] = QUESTIONS.map(() => null);
    try {
      setStatus("Relate を開いて seed/demo.cypher を入れています");
      await db.open();
      referenceRows = await Promise.all(
        QUESTIONS.map(async (question) => {
          const result = await db.execute(question.reference);
          return result.ok ? result.rows : [`答えの Cypher がエラー: ${result.error}`];
        }),
      );
      setReferences(referenceRows);
      env = await environmentText();
      setEnvironment(env);
      setRanWithConceptNames(withConceptNames);
      let system = GRAPH_SCHEMA_PROMPT;
      if (withConceptNames) {
        const names = await db.execute("MATCH (c:Concept) RETURN c.name AS name ORDER BY name");
        if (names.ok) {
          const list = names.rows.map((row) => (row as { name: string }).name).join(", ");
          system += `\n\nConcept names in the graph: ${list}`;
        }
      }
      setStatus("セッションを作っています");
      const base = await createSession({ initialPrompts: [{ role: "system", content: system }] });
      const nextRuns: (QuestionRun | null)[] = QUESTIONS.map(() => null);
      for (const [index, question] of QUESTIONS.entries()) {
        setStatus(`${question.id} を実行しています`);
        const session = await base.clone();
        try {
          nextRuns[index] = await runWithRetry({
            generate: async (feedback) =>
              cleanCypher(
                await withTimeout(
                  session.prompt(feedback ? retryPrompt(feedback) : question.text, {
                    responseConstraint: CYPHER_RESPONSE_SCHEMA,
                  }),
                ),
              ),
            execute: (cypher) => db.execute(cypher),
          });
        } finally {
          session.destroy();
        }
        setRuns([...nextRuns]);
      }
      base.destroy();
      setStatus("完了。答えの正誤を付けると結果の文に反映されます");
      report(nextRuns, marks, env, withConceptNames, referenceRows);
    } catch (error) {
      setStatus(`中断: ${errorText(error)}`);
      onReport(
        [
          "## 2. Nano が書く Cypher",
          "",
          "```text",
          env,
          referenceLine(referenceRows),
          `中断: ${errorText(error)}`,
          "```",
        ].join("\n"),
      );
    }
  };

  return (
    <section>
      <h2>2. Cypher の生成（10 問）</h2>
      <p>
        <label>
          <input
            type="checkbox"
            checked={withConceptNames}
            onChange={(event) => setWithConceptNames(event.target.checked)}
          />{" "}
          プロンプトに概念名の一覧も入れる（比較用。既定はグラフの形だけ）
        </label>
      </p>
      <button id="run-cypher" type="button" onClick={runAll}>
        10 問を実行
      </button>{" "}
      <span>{status}</span>
      <table>
        <thead>
          <tr>
            <th>問</th>
            <th>結果</th>
            <th>Nano の最後の Cypher と行</th>
            <th>答えの行（参考）</th>
            <th>正誤</th>
          </tr>
        </thead>
        <tbody>
          {QUESTIONS.map((question, index) => {
            const run = runs[index];
            const last = run?.attempts.at(-1);
            return (
              <tr key={question.id} style={{ verticalAlign: "top" }}>
                <td>
                  <strong>{question.id}</strong> {question.text}
                  <br />
                  <small>{question.kind}</small>
                </td>
                <td>
                  {run ? `${OUTCOME_LABELS[run.outcome]}（${run.attempts.length} 回）` : ""}
                  {run && last?.rows?.length === 0 ? <div>0 行</div> : null}
                </td>
                <td>
                  <pre style={{ whiteSpace: "pre-wrap", maxWidth: "40em" }}>
                    {run
                      ? `${last?.cypher}\n${last?.error ? `→ ${last.error}` : `→ ${preview(last?.rows ?? null)}`}`
                      : ""}
                  </pre>
                </td>
                <td>
                  <pre style={{ whiteSpace: "pre-wrap", maxWidth: "30em" }}>
                    {references[index] ? preview(references[index] ?? null) : ""}
                  </pre>
                </td>
                <td>
                  <select
                    aria-label={`${question.id} の正誤`}
                    value={marks[index]}
                    onChange={(event) => {
                      const next = [...marks];
                      next[index] = event.target.value as Mark;
                      setMarks(next);
                      if (runs.some(Boolean))
                        report(runs, next, environment, ranWithConceptNames, references);
                    }}
                  >
                    <option value="unjudged">未判定</option>
                    <option value="correct">正しい</option>
                    <option value="wrong">誤り</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
