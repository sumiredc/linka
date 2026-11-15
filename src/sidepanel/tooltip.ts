import type { GraphNode } from "./graph-view";

// force-graph はツールチップの文字列を HTML として入れる。ページの題名や抽出した文をそのまま渡さない
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/** ノードに重ねたときに出す文字列（HTML） */
export function tooltip(node: GraphNode): string {
  switch (node.kind) {
    case "page":
      return escapeHtml(node.title);
    case "concept":
      return escapeHtml(node.name);
    case "claim":
      return escapeHtml(node.statement);
  }
}
