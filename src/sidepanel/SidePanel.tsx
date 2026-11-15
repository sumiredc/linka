import { useMemo, useState } from "react";
import { askDb } from "../shared/db";
import type { StorageState } from "../shared/messages";
import type { ModelStatus } from "../shared/model-status";
import { aiBadge } from "./ai-status";
import { ClipActivity, LinkaMark } from "./ClipActivity";
import { GraphCanvas } from "./GraphCanvas";
import { type GraphView, neighborsOf } from "./graph-view";
import { NodeDetail } from "./NodeDetail";
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

  const view = graph.kind === "loading" ? null : graph.view;
  const selected = (selectedId && view?.nodes.find((node) => node.id === selectedId)) || null;
  const focus = useMemo(
    () =>
      view && selected
        ? new Set([selected.id, ...neighborsOf(view, selected.id).map(({ node }) => node.id)])
        : null,
    [view, selected],
  );

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
        <PanelMenu onReset={() => setResetOpen(true)} />
      </header>

      <ClipActivity />

      <section className={styles.graphWrap} aria-label="Knowledge graph">
        {view ? (
          <>
            {view.nodes.length > 0 ? (
              <GraphCanvas
                view={view}
                selected={selected?.id ?? null}
                focus={focus}
                onSelect={setSelectedId}
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
        {view && selected ? (
          <NodeDetail view={view} node={selected} onSelect={setSelectedId} />
        ) : (
          view &&
          view.nodes.length > 0 && <p className={styles.muted}>Click a node to see its details.</p>
        )}
      </section>

      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={reset} />
    </div>
  );
}
