import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { askDb } from "../shared/db";
import { EXPORT_FILE_NAME } from "../shared/graph-export";
import styles from "./AgentDialog.module.css";
import {
  AGENT_PROMPT,
  COMMANDS,
  defaultShell,
  type GuideCommands,
  SHELLS,
  type Shell,
  STORE_FILE_NAME,
} from "./agent-guide";
import { type ExportOutcome, exportGraph, pickSaveTarget } from "./export-graph";
import panel from "./SidePanel.module.css";

export type ExportState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; outcome: ExportOutcome };

export type AgentHandoff = {
  open: boolean;
  exported: ExportState;
  /** 保存先を選ばせてグラフを書き出し、渡し方のダイアログを開く。クリックから直接呼ぶ */
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
    void exportGraph({ readGraph: askDb, pickTarget: pickSaveTarget }).then((outcome) => {
      running.current = false;
      // 保存を取り消したら、書き出す前の説明に戻す
      setExported(outcome ? { kind: "done", outcome } : { kind: "idle" });
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
    return (
      <p>
        Export the graph to {file} in your project folder, then follow these steps in a terminal
        there.
      </p>
    );
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
  const counts = `${plural(nodes.Page, "page")}, ${plural(nodes.Concept, "concept")}, ${plural(nodes.Claim, "claim")}, ${plural(relationships, "relationship")}`;
  if (outcome.savedTo === "download") {
    return (
      <p>
        Downloaded {file} ({counts}). Move it into your project folder, then follow these steps in a
        terminal there.
      </p>
    );
  }
  return (
    <p>
      Saved {file} ({counts}). In a terminal in the folder you saved it to, turn it into a Relate
      file, then let your agent query it over MCP.
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

/**
 * label はボタンの名前に使う（「Copy the store command」）。ボタンが並ぶので、名前でどれをコピーするかを区別する。
 * コピーできたかは、見えている文字の代わりに status で読み上げる
 */
function Command({ text, label }: { text: string; label: string }) {
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
      <button
        type="button"
        className={styles.copy}
        data-state={state}
        aria-label={`Copy ${label}`}
        onClick={copy}
      >
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

function AgentTabs({ commands }: { commands: GuideCommands }) {
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
        <Command text={commands.claudeCode} label="the Claude Code command" />
        <p className={styles.note}>
          Registers linka for this project only. Check it with <code>claude mcp list</code>.
        </p>
      </div>
      <div
        role="tabpanel"
        id="agent-panel-codex"
        aria-labelledby="agent-tab-codex"
        hidden={agent !== "codex"}
      >
        <Command text={commands.codex} label="the Codex command" />
        <p className={styles.note}>
          Writes <code>[mcp_servers.linka]</code> to <code>~/.codex/config.toml</code>, so every
          project sees it; running it in another project switches linka to that project. Restart
          Codex and run <code>/mcp</code> to see linka.
        </p>
      </div>
    </>
  );
}

/** 手順のコマンドを、どのターミナルの書き方で見せるか。複数の手順のコマンドが変わるので、タブではなく切り替えボタンにする */
function ShellSwitch({ shell, onChange }: { shell: Shell; onChange(shell: Shell): void }) {
  return (
    <fieldset className={styles.shells}>
      <legend>Commands for</legend>
      <div className={styles.shellOptions}>
        {SHELLS.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            className={styles.shell}
            aria-pressed={shell === id}
            onClick={() => onChange(id)}
          >
            {name}
          </button>
        ))}
      </div>
    </fieldset>
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

  const saved = exported.kind === "done" && exported.outcome.ok;
  const [shell, setShell] = useState<Shell>(() => defaultShell(navigator.userAgent));
  const commands = COMMANDS[shell];

  return (
    <dialog
      ref={dialog}
      className={`${panel.dialog} ${styles.dialog}`}
      aria-labelledby="agent-title"
      onClose={handoff.close}
    >
      <h2 id="agent-title">Use with your agent</h2>
      <Intro exported={exported} />
      <ShellSwitch shell={shell} onChange={setShell} />
      <ol className={styles.steps}>
        <li>
          <span>
            Save the export in your project folder. <strong>Export</strong> asks where to save{" "}
            <code>{EXPORT_FILE_NAME}</code>: choose the folder you open your agent in, and replace
            the old file if there is one.
          </span>
          <p className={styles.note}>
            To keep the export and <code>{STORE_FILE_NAME}</code> out of git, add them to{" "}
            <code>.gitignore</code>.
          </p>
        </li>
        <li>
          <span>
            Make a Relate file. Run this again after each export; it replaces what{" "}
            <code>{STORE_FILE_NAME}</code> holds.
          </span>
          <Command text={commands.buildStore} label="the store command" />
        </li>
        <li>
          <span>
            Register it as a read-only MCP server. Do this after step 2 succeeds; otherwise the
            server fails to start.
          </span>
          <AgentTabs commands={commands} />
          <p className={styles.note}>
            If <code>/mcp</code> shows linka as failed, check that{" "}
            <code>{commands.checkStore}</code> in your project folder lists the file. If not, run
            step 2.
          </p>
        </li>
        <li>
          <span>Ask your agent.</span>
          <Command text={AGENT_PROMPT} label="the prompt" />
        </li>
      </ol>
      <p className={styles.note}>
        To check the file without an agent, run <code>{commands.directQuery}</code>
      </p>
      <div className={panel.dialogActions}>
        {!saved && (
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
