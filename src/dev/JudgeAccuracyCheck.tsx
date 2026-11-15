import { useState } from "react";
import {
  JUDGE_INSTRUCTION_VARIANTS,
  type JudgeInstructionVariant,
  PRODUCTION_JUDGE_VARIANT,
} from "../offscreen/judge";
import { languageModel } from "../shared/prompt-api";
import { formatReport, runJudge, type VariantReport } from "./judge-accuracy";
import { JUDGE_PAIRS } from "./judge-pairs";
import { environmentText } from "./language-model";

// 開発用。UC2 の判定を、正解を付けたデモデータの組に、今の指示と厳しくした指示の両方でかける（#47）。
// 判定は本番と同じ openJudgeSession・judgePair を通す

const VARIANTS = Object.keys(JUDGE_INSTRUCTION_VARIANTS) as JudgeInstructionVariant[];

export function JudgeAccuracyCheck() {
  const [status, setStatus] = useState("");
  const [report, setReport] = useState("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setReport("");
    try {
      const reports: VariantReport[] = [];
      for (const variant of VARIANTS) {
        const result = await runJudge(
          languageModel(),
          JUDGE_INSTRUCTION_VARIANTS[variant],
          JUDGE_PAIRS,
          {
            onPair: (pair, pairs) => setStatus(`${variant}：${pair}/${pairs} 組目を判定しています`),
          },
        );
        reports.push({ variant, run: result });
      }
      setReport(
        formatReport({
          environment: await environmentText(),
          production: PRODUCTION_JUDGE_VARIANT,
          pairs: JUDGE_PAIRS,
          reports,
        }),
      );
      setStatus("終わりました");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section>
      <h2>UC2 judge accuracy</h2>
      <p>
        {`正解を付けたデモデータの ${JUDGE_PAIRS.length} 組を、指示の版ごとに本番の判定にかける。`}
        {`本番の指示は「${PRODUCTION_JUDGE_VARIANT}」。結果の文を issue #47 に貼る`}
      </p>
      {VARIANTS.map((variant) => (
        <details key={variant}>
          <summary>{variant} の指示</summary>
          <pre>{JUDGE_INSTRUCTION_VARIANTS[variant]}</pre>
        </details>
      ))}
      <details>
        <summary>組と正解</summary>
        <pre>
          {JUDGE_PAIRS.map(
            (pair) =>
              `${pair.id}（${pair.expected}）: ${pair.reason}\n  Concern: ${pair.concern.statement}\n  Solution: ${pair.solution.statement}`,
          ).join("\n")}
        </pre>
      </details>
      <button id="judge-accuracy-run" type="button" disabled={running} onClick={run}>
        判定の一致率を測る
      </button>{" "}
      <button
        type="button"
        disabled={report === ""}
        onClick={() => navigator.clipboard.writeText(report)}
      >
        結果をコピー
      </button>
      <div id="judge-accuracy-status">{status}</div>
      <pre id="judge-accuracy-output">{report}</pre>
    </section>
  );
}
