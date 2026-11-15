import { describe, expect, it } from "vitest";
import type { GraphNode } from "./graph-view";
import { tooltip } from "./tooltip";

const HOSTILE = `<img src=x onerror="alert('x')"> & more`;
const ESCAPED = "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; more";

const nodes: GraphNode[] = [
  {
    id: "page:https://a.example/",
    kind: "page",
    url: "https://a.example/",
    title: HOSTILE,
    summary: null,
    clippedAt: null,
  },
  { id: "concept:x", kind: "concept", name: HOSTILE, category: null },
  { id: "claim:x", kind: "claim", statement: HOSTILE, type: "fact", shape: "other" },
];

describe("tooltip", () => {
  it.each(nodes)("escapes markup, quotes and ampersands in a $kind", (node) => {
    expect(tooltip(node)).toBe(ESCAPED);
  });

  it("leaves plain text as it is", () => {
    expect(tooltip({ id: "concept:opfs", kind: "concept", name: "OPFS", category: null })).toBe(
      "OPFS",
    );
  });
});
