// 最後に終わった記憶で新しくつながった組（UC2）を、グラフで強調するノードと線の id にする
import type { ClipEvent } from "../shared/clip-status";
import { claimNodeId } from "./graph-view";

/** 強調するノードの id と線の id（graph-view の `source|ADDRESSES|target`）。強調するものが無ければ null */
export type Highlight = { nodes: ReadonlySet<string>; links: ReadonlySet<string> };

export function newConnectionsHighlight(event: ClipEvent | null): Highlight | null {
  if (event?.kind !== "finished" || !event.result.ok) return null;
  const { connections } = event.result.summary;
  if (connections.kind !== "judged" || connections.links.length === 0) return null;
  const nodes = new Set<string>();
  const links = new Set<string>();
  for (const { solution, concern } of connections.links) {
    const source = claimNodeId(solution.id);
    const target = claimNodeId(concern.id);
    nodes.add(source).add(target);
    links.add(`${source}|ADDRESSES|${target}`);
  }
  return { nodes, links };
}
