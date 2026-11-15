// グラフへの質問（PRD UC3）。入力欄はパネルの下に固定し、答えは文脈の欄に出す
import { type FormEvent, useMemo, useRef, useState } from "react";
import { askGraph } from "../shared/ask";
import {
  type AskResult,
  KIND_SPECS,
  QUERY_KINDS,
  QUESTION_MAX_LENGTH,
  RESULT_LIMIT,
} from "../shared/graph-question";
import type { DbResponse } from "../shared/messages";
import type { ModelStatus } from "../shared/model-status";
import styles from "./Ask.module.css";
import { answerCells, answerHighlight, type Highlight } from "./answer-view";
import { askGate, shouldSubmit } from "./ask-input";

export type AskState =
  | { kind: "idle" }
  | { kind: "asking"; question: string }
  | { kind: "done"; question: string; response: DbResponse<AskResult> };

/** 質問の状態と、答えに含まれるノードと線（強調に使う） */
export function useAsk() {
  const [state, setState] = useState<AskState>({ kind: "idle" });
  // 消したあとや次の質問のあとに、前の質問の返事が届いても表示しない
  const latest = useRef(0);

  const ask = async (question: string) => {
    const id = ++latest.current;
    setState({ kind: "asking", question });
    const response = await askGraph(question);
    if (latest.current === id) setState({ kind: "done", question, response });
  };
  const clear = () => {
    latest.current++;
    setState({ kind: "idle" });
  };

  const highlight = useMemo((): Highlight | null => {
    if (state.kind !== "done" || !state.response.ok) return null;
    const result = state.response.value;
    return result.kind === "answer" ? answerHighlight(result.plan, result.rows) : null;
  }, [state]);

  return { state, ask, clear, highlight };
}

export function AskForm({
  model,
  busy,
  onAsk,
}: {
  model: ModelStatus | null;
  busy: boolean;
  onAsk(question: string): void;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const gate = askGate(model);

  if (!gate.open) {
    return (
      <section className={styles.ask} aria-label="Ask the graph">
        <p className={styles.unavailable} role="status">
          {gate.text}
        </p>
      </section>
    );
  }

  const question = text.trim();
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || question === "") return;
    onAsk(question);
  };
  const resize = () => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  };

  return (
    <section className={styles.ask} aria-label="Ask the graph">
      <form className={styles.form} onSubmit={submit}>
        <textarea
          ref={input}
          className={styles.input}
          rows={2}
          value={text}
          maxLength={QUESTION_MAX_LENGTH}
          placeholder="Ask about what you have clipped"
          aria-label="Question"
          onChange={(event) => {
            setText(event.target.value);
            resize();
          }}
          onKeyDown={(event) => {
            if (
              shouldSubmit({
                key: event.key,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                isComposing: event.nativeEvent.isComposing,
                keyCode: event.nativeEvent.keyCode,
              })
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          className={styles.send}
          disabled={busy || question === ""}
          aria-label="Ask"
          title="Ask (⌘/Ctrl + Enter)"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 3 10.2 13.8" />
            <path d="M21 3 14.4 21l-4.2-7.2L3 9.6z" />
          </svg>
        </button>
      </form>
      <p className={styles.hint}>⌘/Ctrl + Enter to ask. Enter adds a new line.</p>
    </section>
  );
}

function Cypher({ text, label }: { text: string; label: string }) {
  return (
    <>
      <div className={styles.cypherHead}>
        <span>{label}</span>
      </div>
      <pre className={styles.cypher}>{text}</pre>
    </>
  );
}

const UNANSWERABLE_TEXT = {
  noKind: "Linka cannot turn this question into one of the queries it knows. Nothing was run.",
  emptyGraph: "The graph has no pages yet. Clip a page first.",
  tooLong: `Questions can be up to ${QUESTION_MAX_LENGTH} characters.`,
} as const;

function Unanswerable({ result }: { result: Extract<AskResult, { kind: "unanswerable" }> }) {
  const text =
    result.reason === "unknownTarget"
      ? result.missing.length > 0
        ? `${result.missing.map((name) => `“${name}”`).join(" and ")} ${result.missing.length === 1 ? "is" : "are"} not in the graph. Nothing was run.`
        : "Linka could not tell which concept or page the question is about. Nothing was run."
      : UNANSWERABLE_TEXT[result.reason];
  const guide = result.reason === "noKind" || result.reason === "unknownTarget";
  return (
    <>
      <p className={`${styles.notice} ${styles.warn}`}>{text}</p>
      {guide && (
        <>
          <p className={styles.muted}>
            Questions Linka can answer, with a concept from your graph:
          </p>
          <ul className={styles.examples}>
            {QUERY_KINDS.map((kind) => (
              <li key={kind}>{KIND_SPECS[kind].example}</li>
            ))}
          </ul>
          {result.concepts.length > 0 && (
            <p className={styles.concepts}>
              <span className={styles.label}>Concepts in the graph</span>
              {result.concepts.join(", ")}
            </p>
          )}
        </>
      )}
    </>
  );
}

function Answer({ result }: { result: Extract<AskResult, { kind: "answer" }> }) {
  return (
    <>
      <Cypher label="Executed Cypher" text={result.cypher} />
      {result.rows.length === 0 ? (
        <p className={styles.muted}>No matching results.</p>
      ) : (
        <>
          <ul className={styles.results}>
            {result.rows.map((row, index) => (
              // 行に一意な列が無い種類（件数など）もあるので、並びの位置で見分ける
              // biome-ignore lint/suspicious/noArrayIndexKey: 結果は丸ごと入れ替わり、並べ替えない
              <li key={index}>
                {answerCells(result.plan.kind, row).map((cell) => (
                  <div key={cell.column}>
                    <span className={styles.label}>{cell.column}</span>
                    {cell.href ? (
                      <a href={cell.href} target="_blank" rel="noreferrer">
                        {cell.text}
                      </a>
                    ) : (
                      cell.text
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
          {result.truncated && (
            <p className={styles.muted}>Showing the first {RESULT_LIMIT} results.</p>
          )}
        </>
      )}
    </>
  );
}

function Result({ response }: { response: DbResponse<AskResult> }) {
  if (!response.ok) {
    return (
      <p className={`${styles.notice} ${styles.bad}`}>
        The question could not be answered: {response.error.message}
      </p>
    );
  }
  const result = response.value;
  switch (result.kind) {
    case "answer":
      return <Answer result={result} />;
    case "unanswerable":
      return <Unanswerable result={result} />;
    case "failed":
      return (
        <>
          <p className={`${styles.notice} ${styles.bad}`}>
            {result.stage === "model"
              ? `The on-device AI could not pick a query for this question: ${result.message}.`
              : `The query failed: ${result.message}.`}
          </p>
          {result.cypher && <Cypher label="Cypher that failed" text={result.cypher} />}
        </>
      );
  }
}

export function AnswerView({ state, onClear }: { state: AskState; onClear(): void }) {
  if (state.kind === "idle") return null;
  const title =
    state.kind === "done" && state.response.ok && state.response.value.kind === "answer"
      ? state.response.value.title
      : state.question;
  return (
    <article className={styles.answer} aria-label="Answer">
      <h3>{title}</h3>
      {title !== state.question && <p className={styles.question}>You asked: {state.question}</p>}
      {state.kind === "asking" ? (
        <p className={styles.muted} role="status">
          Choosing a query for your question…
        </p>
      ) : (
        <>
          <Result response={state.response} />
          <button type="button" className={styles.linkish} onClick={onClear}>
            Clear
          </button>
        </>
      )}
    </article>
  );
}
