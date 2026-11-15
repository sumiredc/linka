import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import type { GraphLink, GraphNode, GraphView, LinkType } from "./graph-view";
import type { Highlight } from "./new-connections";
import styles from "./SidePanel.module.css";
import { tooltip } from "./tooltip";

// Canvas には CSS の変数が効かないので、SidePanel.module.css の色を写して持つ
const COLOR = {
  ink: "#1c2638",
  inkSoft: "#566079",
  panel: "#f8f9fc",
  concern: "#b02e66",
  solution: "#157a6e",
  other: "#8a93a6",
  act: "#3445c9",
  edge: "#b7becc",
};

// モックの graph.js と同じ線の長さ
const LINK_DISTANCE: Record<LinkType, number> = {
  ASSERTS: 30,
  ABOUT: 70,
  ADDRESSES: 80,
  MENTIONS: 75,
  RELATED_TO: 75,
};

const LABEL_LENGTH = 22;

type Node = NodeObject<GraphNode>;
type Link = LinkObject<GraphNode, GraphLink>;

// 型は GraphLink の文字列のままだが、描き始めると force-graph が端をノードのオブジェクトに置き換える
function endId(end: unknown): string {
  return typeof end === "object" && end !== null
    ? String((end as { id?: unknown }).id)
    : String(end);
}

function shorten(text: string): string {
  return text.length > LABEL_LENGTH ? `${text.slice(0, LABEL_LENGTH - 1)}…` : text;
}

function radius(node: GraphNode): number {
  return node.kind === "claim" ? 4.5 : 7;
}

/**
 * 形と名前を描く倍率（グラフ上の長さ）。引いて全体を見ているときも画面上でモックの 6 割より小さくせず、
 * 寄ったときはそのまま大きくする
 */
const unit = (scale: number) => (scale >= 1 ? 1 : Math.max(scale, 0.6) / scale);

// これより引いているときは、Concept の名前が重なって読めないので Page の名前だけ出す
const CONCEPT_LABEL_SCALE = 0.8;

function traceShape(node: Node, ctx: CanvasRenderingContext2D, u: number) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  ctx.beginPath();
  if (node.kind === "page") ctx.roundRect(x - 7 * u, y - 7 * u, 14 * u, 14 * u, 3 * u);
  else ctx.arc(x, y, radius(node) * u, 0, 2 * Math.PI);
}

function drawNode(node: Node, ctx: CanvasRenderingContext2D, scale: number, faded: boolean) {
  const u = unit(scale);
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  ctx.globalAlpha = faded ? 0.2 : 1;
  traceShape(node, ctx, u);
  if (node.kind === "page") {
    ctx.fillStyle = COLOR.ink;
    ctx.fill();
  } else if (node.kind === "concept") {
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = COLOR.inkSoft;
    ctx.stroke();
  } else {
    ctx.fillStyle = COLOR[node.shape];
    ctx.fill();
  }
  if (node.kind === "page" || (node.kind === "concept" && scale >= CONCEPT_LABEL_SCALE)) {
    const label = shorten(node.kind === "page" ? node.title : node.name);
    ctx.font = `${node.kind === "page" ? 600 : 400} ${10.5 * u}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = COLOR.panel;
    ctx.strokeText(label, x + 10 * u, y);
    ctx.fillStyle = COLOR.ink;
    ctx.fillText(label, x + 10 * u, y);
  }
  ctx.globalAlpha = 1;
}

function drawHalo(node: Node, ctx: CanvasRenderingContext2D, scale: number, color = COLOR.act) {
  const u = unit(scale);
  ctx.beginPath();
  ctx.arc(node.x ?? 0, node.y ?? 0, (node.kind === "claim" ? 8 : 12) * u, 0, 2 * Math.PI);
  ctx.lineWidth = 2 * u;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** 読み直したグラフでも、前からあるノードは前の位置から動かす（毎回並べ直すと見失うため） */
function useForceData(view: GraphView) {
  const placed = useRef(new Map<string, Node>());
  return useMemo(() => {
    const next = new Map<string, Node>();
    for (const node of view.nodes) {
      const previous = placed.current.get(node.id);
      next.set(node.id, previous ? Object.assign(previous, node) : { ...node });
    }
    placed.current = next;
    // force-graph は線の端をノードのオブジェクトに書き換えるので、毎回作り直して渡す
    return { nodes: [...next.values()], links: view.links.map((link): Link => ({ ...link })) };
  }, [view]);
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

export function GraphCanvas({
  view,
  selected,
  focus,
  highlight,
  onSelect,
}: {
  view: GraphView;
  selected: string | null;
  /** 選んだノードとその隣。null なら何も薄くしない */
  focus: ReadonlySet<string> | null;
  /** 最後の記憶で新しくつながった組（UC2）。null なら強調しない */
  highlight: Highlight | null;
  onSelect(id: string | null): void;
}) {
  const graph = useRef<ForceGraphMethods<Node, Link> | undefined>(undefined);
  const data = useForceData(view);
  const { ref, width, height } = useSize();
  const fitted = useRef(false);

  // ForceGraph2D は大きさが分かってから描くので、力の設定もそのあとにする
  const mounted = width > 0;
  useEffect(() => {
    const force = graph.current;
    if (!mounted || !force) return;
    force.d3Force("link")?.distance?.((link: Link) => LINK_DISTANCE[link.type]);
    force.d3Force("charge")?.strength?.(-100);
    force.d3ReheatSimulation();
  }, [mounted]);

  const isLit = (link: Link) =>
    selected !== null && (endId(link.source) === selected || endId(link.target) === selected);

  return (
    <div ref={ref} className={styles.graphCanvas}>
      {mounted && (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={graph}
          width={width}
          height={height}
          graphData={data}
          backgroundColor={COLOR.panel}
          nodeLabel={tooltip}
          nodeCanvasObject={(node, ctx, scale) => {
            if (node.id === selected) drawHalo(node, ctx, scale);
            else if (highlight?.nodes.has(String(node.id))) {
              drawHalo(node, ctx, scale, COLOR.solution);
            }
            drawNode(node, ctx, scale, focus !== null && !focus.has(String(node.id)));
          }}
          nodePointerAreaPaint={(node, color, ctx, scale) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, (radius(node) + 3) * unit(scale), 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkColor={(link) => {
            const base = link.type === "ADDRESSES" ? COLOR.solution : COLOR.edge;
            if (isLit(link)) return link.type === "ADDRESSES" ? COLOR.solution : COLOR.act;
            return focus ? `${base}26` : base;
          }}
          linkWidth={(link) =>
            highlight?.links.has(link.id)
              ? 4
              : link.type === "ADDRESSES"
                ? 2.2
                : isLit(link)
                  ? 2.4
                  : 1
          }
          linkDirectionalParticles={(link) => (highlight?.links.has(link.id) ? 3 : 0)}
          linkDirectionalParticleColor={() => COLOR.solution}
          linkDirectionalParticleWidth={3}
          cooldownTicks={200}
          onEngineStop={() => {
            if (fitted.current) return;
            fitted.current = true;
            graph.current?.zoomToFit(400, 32);
          }}
          onNodeClick={(node) => onSelect(String(node.id))}
          onBackgroundClick={() => onSelect(null)}
        />
      )}
    </div>
  );
}
