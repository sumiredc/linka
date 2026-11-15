import { describe, expect, it } from "vitest";
import type { ClipEvent, ClipSummary, NewConnection } from "../shared/clip-status";
import { toGraphView } from "./graph-view";
import { newConnectionsHighlight } from "./new-connections";

const A = "https://a.example/";
const B = "https://b.example/";
const target = { url: A, tabUrl: A, title: "A" };
const link: NewConnection = {
  solution: { id: `${A}#claim-1`, statement: "Fix.", pageUrl: A, pageTitle: "A" },
  concern: { id: `${B}#claim-2`, statement: "Problem.", pageUrl: B, pageTitle: "B" },
};
const summary: ClipSummary = {
  url: A,
  title: "A",
  concepts: 0,
  newConcepts: 0,
  claims: 1,
  newPage: true,
  connections: { kind: "judged", links: [link] },
};

function finished(connections: ClipSummary["connections"]): ClipEvent {
  return { kind: "finished", target, result: { ok: true, summary: { ...summary, connections } } };
}

describe("newConnectionsHighlight", () => {
  it("highlights both claims and the ADDRESSES line that the graph view draws for a new connection", () => {
    const view = toGraphView([
      { rows: [{ pages: 2 }] },
      { rows: [{ url: A }, { url: B }] },
      {
        rows: [
          { page: A, id: link.solution.id, statement: "Fix.", type: "solution" },
          { page: B, id: link.concern.id, statement: "Problem.", type: "concern" },
        ],
      },
      { rows: [] },
      { rows: [] },
      { rows: [{ solution: link.solution.id, concern: link.concern.id }] },
    ]);
    const highlight = newConnectionsHighlight(finished({ kind: "judged", links: [link] }));
    const drawn = view.links.find((line) => line.type === "ADDRESSES");
    expect(drawn && highlight?.links.has(drawn.id)).toBe(true);
    expect([...(highlight?.nodes ?? [])].sort()).toEqual(
      view.nodes
        .filter((node) => node.kind === "claim")
        .map((node) => node.id)
        .sort(),
    );
  });

  it("highlights nothing when no connection was found or judged, or the clip is still running", () => {
    expect(newConnectionsHighlight(finished({ kind: "judged", links: [] }))).toBeNull();
    expect(newConnectionsHighlight(finished({ kind: "notJudged", reason: "x" }))).toBeNull();
    expect(
      newConnectionsHighlight({
        kind: "progress",
        progress: { target, stage: { kind: "writing" } },
      }),
    ).toBeNull();
    expect(newConnectionsHighlight(null)).toBeNull();
  });
});
