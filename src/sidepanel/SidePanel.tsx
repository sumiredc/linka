import { useMemo, useState } from "react";
import { askDb } from "../shared/db";
import type { StorageState } from "../shared/messages";
import type { ModelStatus } from "../shared/model-status";
import { AgentDialog, useAgentHandoff } from "./AgentDialog";
import { AnswerView, AskForm, useAsk } from "./Ask";
import { aiBadge } from "./ai-status";
import { isOpenableUrl } from "./answer-view";
import { ClipActivity, useLatestClipEvent } from "./ClipActivity";
import { canExport } from "./export-graph";
import { GraphCanvas } from "./GraphCanvas";
import { type GraphView, neighborsOf } from "./graph-view";
import { LinkaMark } from "./LinkaMark";
import { NodeDetail } from "./NodeDetail";
import { newConnectionsHighlight } from "./new-connections";
import { PanelMenu, ResetDialog } from "./PanelMenu";
import styles from "./SidePanel.module.css";
import { useGraphView, useModelStatus, useStorage } from "./use-panel-data";

/** retry が true なら、グラフを読み直すボタンを付ける */
type Notice = { tone: "ok" | "warn" | "bad"; text: string; retry?: boolean };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function storageNotice(storage: StorageState | null): Notice | null {
  if (storage?.kind === "memory") {
    return {
      tone: "warn",
      text: `The graph is kept in memory because OPFS cannot be used (${storage.reason}). Data disappears when closed.`,
    };
  }
  if (storage?.kind === "unavailable") {
    return { tone: "bad", text: `The graph cannot be opened: ${storage.reason}`, retry: true };
  }
  return null;
}

function AiStatus({ status }: { status: ModelStatus | null }) {
  const badge = aiBadge(status);
  return (
    <span
      className={styles.aiStatus}
      data-tone={badge.tone}
      role="status"
      title={badge.detail ?? undefined}
    >
      {badge.text}
    </span>
  );
}

function GraphMeta({ view }: { view: GraphView }) {
  const pages = view.nodes.filter((node) => node.kind === "page").length;
  const concepts = view.nodes.filter((node) => node.kind === "concept").length;
  const connections = view.links.filter((link) => link.type === "ADDRESSES").length;
  return (
    <>
      <div className={styles.graphMeta}>
        <span>
          {plural(pages, "page")}, {plural(concepts, "concept")},{" "}
          {plural(connections, "connection")}
        </span>
        <span className={styles.legend}>
          <span>
            <i className={`${styles.swatch} ${styles.swatchPage}`} />
            Page
          </span>
          <span>
            <i className={`${styles.swatch} ${styles.swatchConcept}`} />
            Concept
          </span>
          <span>
            <i className={`${styles.swatch} ${styles.swatchConcern}`} />
            Concern
          </span>
          <span>
            <i className={`${styles.swatch} ${styles.swatchSolution}`} />
            Solution
          </span>
          <span>
            <i className={`${styles.swatch} ${styles.swatchOther}`} />
            Other
          </span>
        </span>
      </div>
      {view.totalPages > pages && (
        <p className={styles.graphNote}>
          Showing the {pages} most recently clipped of {view.totalPages} pages.
        </p>
      )}
    </>
  );
}

export function SidePanel() {
  const { graph, reload } = useGraphView();
  const storage = useStorage();
  const model = useModelStatus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const handoff = useAgentHandoff();
  const clipEvent = useLatestClipEvent();
  const highlight = useMemo(() => newConnectionsHighlight(clipEvent), [clipEvent]);
  const question = useAsk();

  const view = graph.kind === "loading" ? null : graph.view;
  const exportable = canExport(view);
  const selected = (selectedId && view?.nodes.find((node) => node.id === selectedId)) || null;
  const answer = question.highlight;
  const focus = useMemo(() => {
    if (view && selected) {
      return new Set([selected.id, ...neighborsOf(view, selected.id).map(({ node }) => node.id)]);
    }
    // 質問の答えがあれば、答えに含まれるノードのほかを薄くする
    return answer && answer.nodes.size > 0 ? answer.nodes : null;
  }, [view, selected, answer]);

  // 答えに含まれるページのノードを押したら、そのページを新しいタブで開く（PRD UC3）。
  // 選んだことにはしない（選ぶと強調が隣のノードに移り、答えの経路が見えなくなるため）
  const select = (id: string | null) => {
    const node = id && answer?.nodes.has(id) ? view?.nodes.find((item) => item.id === id) : null;
    if (!selected && node?.kind === "page" && isOpenableUrl(node.url)) {
      window.open(node.url, "_blank", "noopener,noreferrer");
      return;
    }
    setSelectedId(id);
  };

  const reset = async () => {
    setResetOpen(false);
    setNotice(null);
    const response = await askDb({ kind: "resetToDemo" });
    if (response.ok) {
      setSelectedId(null);
      setNotice({ tone: "ok", text: "The graph is back to the demo data." });
    } else {
      setNotice({ tone: "bad", text: `Reset failed: ${response.error.message}` });
    }
    reload();
  };

  const notices = [
    storageNotice(storage),
    graph.kind === "failed" && storage?.kind !== "unavailable"
      ? {
          tone: "bad" as const,
          text: `The graph could not be read: ${graph.message}`,
          retry: true,
        }
      : null,
    notice,
  ].filter((item): item is Notice => item !== null);

  return (
    <div className={styles.panel}>
      <header className={styles.panelHead}>
        <div className={styles.brand}>
          <LinkaMark size={20} />
          Linka
        </div>
        <AiStatus status={model} />
        <PanelMenu
          canExport={exportable}
          onExport={handoff.exportNow}
          onGuide={handoff.showGuide}
          onReset={() => setResetOpen(true)}
        />
      </header>

      <ClipActivity event={clipEvent} />

      <section className={styles.graphWrap} aria-label="Knowledge graph">
        {view ? (
          <>
            {view.nodes.length > 0 ? (
              <GraphCanvas
                view={view}
                selected={selected?.id ?? null}
                focus={focus}
                highlight={highlight}
                litLinks={selected ? null : (answer?.links ?? null)}
                onSelect={select}
              />
            ) : (
              <p className={styles.graphEmpty}>No pages yet.</p>
            )}
            <GraphMeta view={view} />
          </>
        ) : (
          <p className={styles.graphEmpty}>
            {graph.kind === "loading" ? "Loading the graph…" : ""}
          </p>
        )}
      </section>

      <section className={styles.context} aria-live="polite">
        {notices.map((item) => (
          <p key={item.text} className={`${styles.notice} ${styles[item.tone]}`}>
            {item.text}
            {item.retry && (
              <>
                {" "}
                <button type="button" className={styles.linkish} onClick={reload}>
                  Retry
                </button>
              </>
            )}
          </p>
        ))}
        {model?.kind === "unavailable" && (
          <p className={`${styles.notice} ${styles.warn}`}>
            On-device AI is not available ({model.reason}). You can still browse the graph and clip
            the bundled sample pages.
          </p>
        )}
        <AnswerView state={question.state} onClear={question.clear} />
        {view && selected ? (
          <NodeDetail view={view} node={selected} onSelect={setSelectedId} />
        ) : (
          view &&
          view.nodes.length > 0 &&
          question.state.kind === "idle" && (
            <p className={styles.muted}>Click a node to see its details.</p>
          )
        )}
      </section>

      <AskForm
        model={model}
        state={question.state}
        onAsk={(text) => {
          setSelectedId(null);
          question.ask(text);
        }}
      />

      <AgentDialog handoff={handoff} canExport={exportable} />
      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={reset} />
    </div>
  );
}
