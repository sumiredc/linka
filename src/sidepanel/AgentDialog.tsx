import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { askDb } from "../shared/db";
import { EXPORT_FILE_NAME } from "../shared/graph-export";
import styles from "./AgentDialog.module.css";
import {
  AGENT_PROMPT,
  BUILD_STORE_COMMAND,
  BUILD_STORE_FROM_LINKA_COMMAND,
  CHECK_STORE_COMMAND,
  CLAUDE_CODE_COMMAND,
  CODEX_COMMAND,
  DIRECT_QUERY_COMMAND,
} from "./agent-guide";
import { downloadText, type ExportOutcome, exportGraph } from "./export-graph";
import panel from "./SidePanel.module.css";

export type ExportState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; outcome: ExportOutcome };

export type AgentHandoff = {
  open: boolean;
  exported: ExportState;
  /** グラフを書き出してダウンロードさせ、渡し方のダイアログを開く */
  exportNow(): void;
  /** 書き出さずに渡し方のダイアログを開く（メニューの Use with your agent） */
  showGuide(): void;
  close(): void;
};

/** Export と「Use with your agent」の状態。メニューとダイアログの両方から使う */
export function useAgentHandoff(): AgentHandoff {
  const [open, setOpen] = useState(false);
  const [exported, setExported] = useState<ExportState>({ kind: "idle" });
  const running = useRef(false);

  const exportNow = () => {
    setOpen(true);
    if (running.current) return;
    running.current = true;
    setExported({ kind: "running" });
    void exportGraph({ readGraph: askDb, save: downloadText }).then((outcome) => {
      running.current = false;
      setExported({ kind: "done", outcome });
    });
  };

  return {
    open,
    exported,
    exportNow,
    showGuide: () => {
      // 前に書き出した結果は今のグラフと違いうるので、書き出す前の説明に戻す
      if (!running.current) setExported({ kind: "idle" });
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function Intro({ exported }: { exported: ExportState }) {
  const file = <code>{EXPORT_FILE_NAME}</code>;
  if (exported.kind === "running") return <p>Exporting the graph…</p>;
  if (exported.kind === "idle") {
    return <p>Export the graph to {file}, then follow these steps in a terminal.</p>;
  }
  const { outcome } = exported;
  if (!outcome.ok) {
    return (
      <p className={`${panel.notice} ${panel.bad}`} role="alert">
        The graph could not be exported: {outcome.message}
      </p>
    );
  }
  const { nodes, relationships } = outcome.counts;
  return (
    <p>
      Downloaded {file} ({plural(nodes.Page, "page")}, {plural(nodes.Concept, "concept")},{" "}
      {plural(nodes.Claim, "claim")}, {plural(relationships, "relationship")}). Turn it into a
      Relate file, then let your agent query it over MCP.
    </p>
  );
}

type CopyState = "idle" | "copied" | "failed";

const COPY_TEXT: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

// 読み上げは live region に任せ、ボタンには見えている文字をそのまま名前にする
const COPY_ANNOUNCEMENT: Record<CopyState, string> = {
  idle: "",
  copied: "Copied to the clipboard.",
  failed: "Could not copy. Select the text and copy it yourself.",
};

function Command({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () => {
    const show = (next: CopyState) => {
      setState(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 2500);
    };
    navigator.clipboard.writeText(text).then(
      () => show("copied"),
      () => show("failed"),
    );
  };
  return (
    <div className={styles.command}>
      <pre>
        <code>{text}</code>
      </pre>
      <button type="button" className={styles.copy} data-state={state} onClick={copy}>
        {COPY_TEXT[state]}
      </button>
      <span role="status" className={styles.visuallyHidden}>
        {COPY_ANNOUNCEMENT[state]}
      </span>
    </div>
  );
}

const AGENTS = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
] as const;

type AgentId = (typeof AGENTS)[number]["id"];

function AgentTabs() {
  const [agent, setAgent] = useState<AgentId>("claude");
  const tabs = useRef<Record<AgentId, HTMLButtonElement | null>>({ claude: null, codex: null });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = AGENTS.findIndex(({ id }) => id === agent);
    const step = event.key === "ArrowRight" ? 1 : AGENTS.length - 1;
    const next = AGENTS[(index + step) % AGENTS.length]?.id ?? agent;
    setAgent(next);
    tabs.current[next]?.focus();
  };

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="Agent">
        {AGENTS.map(({ id, name }) => (
          <button
            key={id}
            ref={(element) => {
              tabs.current[id] = element;
            }}
            type="button"
            role="tab"
            id={`agent-tab-${id}`}
            className={styles.tab}
            aria-selected={agent === id}
            aria-controls={`agent-panel-${id}`}
            tabIndex={agent === id ? 0 : -1}
            onClick={() => setAgent(id)}
            onKeyDown={onKeyDown}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="agent-panel-claude"
        aria-labelledby="agent-tab-claude"
        hidden={agent !== "claude"}
      >
        <Command text={CLAUDE_CODE_COMMAND} />
        <p className={styles.note}>
          Run it in your project directory (add <code>--scope user</code> to use it in every
          project). Check it with <code>claude mcp list</code>.
        </p>
      </div>
      <div
        role="tabpanel"
        id="agent-panel-codex"
        aria-labelledby="agent-tab-codex"
        hidden={agent !== "codex"}
      >
        <Command text={CODEX_COMMAND} />
        <p className={styles.note}>
          Writes <code>[mcp_servers.linka]</code> to <code>~/.codex/config.toml</code>; running it
          again replaces it. Restart Codex and run <code>/mcp</code> to see linka.
        </p>
      </div>
    </>
  );
}

export function AgentDialog({
  handoff,
  canExport,
}: {
  handoff: AgentHandoff;
  /** グラフが空なら書き出せない（PRD UC4 の例外フロー） */
  canExport: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { open, exported } = handoff;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const downloaded = exported.kind === "done" && exported.outcome.ok;

  return (
    <dialog
      ref={dialog}
      className={`${panel.dialog} ${styles.dialog}`}
      aria-labelledby="agent-title"
      onClose={handoff.close}
    >
      <h2 id="agent-title">Use with your agent</h2>
      <Intro exported={exported} />
      <ol className={styles.steps}>
        <li>
          <span>
            Make a Relate file. This loads the newest <code>linka-export*.cypher</code> in{" "}
            <code>~/Downloads</code>, so a re-export saved as <code>linka-export (1).cypher</code>{" "}
            is used too. If your browser saves downloads elsewhere, change that path.
          </span>
          <Command text={BUILD_STORE_COMMAND} />
          <p className={styles.note}>
            If it says <code>Operation not permitted</code>, your terminal can't read{" "}
            <code>~/Downloads</code>. Either allow it in System Settings → Privacy &amp; Security →
            Files and Folders → Downloads (or Full Disk Access) and restart the terminal, or move
            the file to <code>~/linka/{EXPORT_FILE_NAME}</code> in Finder and run:
          </p>
          <Command text={BUILD_STORE_FROM_LINKA_COMMAND} />
        </li>
        <li>
          <span>
            Register it as a read-only MCP server. Do this after step 1 succeeds; otherwise the
            server fails to start.
          </span>
          <AgentTabs />
          <p className={styles.note}>
            If <code>/mcp</code> shows linka as failed, check that{" "}
            <code>{CHECK_STORE_COMMAND}</code> lists the file. If not, run step 1.
          </p>
        </li>
        <li>
          <span>Ask your agent.</span>
          <Command text={AGENT_PROMPT} />
        </li>
      </ol>
      <p className={styles.note}>
        To check the file without an agent, run <code>{DIRECT_QUERY_COMMAND}</code>
      </p>
      <div className={panel.dialogActions}>
        {!downloaded && (
          <button
            type="button"
            className={panel.buttonQuiet}
            disabled={!canExport || exported.kind === "running"}
            title={canExport ? undefined : "The graph is empty"}
            onClick={handoff.exportNow}
          >
            {exported.kind === "done" ? "Try again" : "Export"}
          </button>
        )}
        <button type="button" className={styles.primary} onClick={handoff.close}>
          Close
        </button>
      </div>
    </dialog>
  );
}
