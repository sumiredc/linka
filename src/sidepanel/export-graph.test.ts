import { describe, expect, it } from "vitest";
import { EXPORT_FILE_NAME, EXPORT_READ_SCRIPT } from "../shared/graph-export";
import { failure, type RelateResult } from "../shared/messages";
import { canExport, exportGraph } from "./export-graph";

const result = (rows: Record<string, unknown>[] = []): RelateResult => ({
  columns: [],
  rows,
  stats: {},
});

/** EXPORT_READ_SCRIPT の結果の数（ノード 4 種と関係 6 種）。1 ページだけのグラフ */
const ONE_PAGE = [
  result([{ props: { url: "https://a.example/", title: "A" } }]),
  ...Array.from({ length: 9 }, () => result()),
];

function fakeDeps(response: Awaited<ReturnType<Parameters<typeof exportGraph>[0]["readGraph"]>>) {
  const saved: { fileName: string; text: string }[] = [];
  const requests: unknown[] = [];
  return {
    saved,
    requests,
    deps: {
      readGraph: async (request: { kind: "executeScript"; script: string }) => {
        requests.push(request);
        return response;
      },
      save: (fileName: string, text: string) => saved.push({ fileName, text }),
    },
  };
}

describe("exportGraph", () => {
  it("reads the graph in one script and saves it as linka-export.cypher", async () => {
    const { deps, saved, requests } = fakeDeps({ ok: true, value: ONE_PAGE });
    const outcome = await exportGraph(deps);
    expect(requests).toEqual([{ kind: "executeScript", script: EXPORT_READ_SCRIPT }]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.fileName).toBe(EXPORT_FILE_NAME);
    expect(saved[0]?.text).toContain("MERGE (n:Page {url: row.url})\nSET n += row;");
    expect(saved[0]?.text).toContain("url: 'https://a.example/'");
    expect(outcome).toEqual({
      ok: true,
      counts: { nodes: { Page: 1, Person: 0, Concept: 0, Claim: 0 }, relationships: 0 },
    });
  });

  it("saves nothing and reports the error when the graph cannot be read", async () => {
    const { deps, saved } = fakeDeps(failure("timeout", "the database did not answer"));
    expect(await exportGraph(deps)).toEqual({
      ok: false,
      message: "the database did not answer",
    });
    expect(saved).toEqual([]);
  });

  it("saves nothing when the read returns an unexpected number of results", async () => {
    const { deps, saved } = fakeDeps({ ok: true, value: ONE_PAGE.slice(1) });
    const outcome = await exportGraph(deps);
    expect(outcome.ok).toBe(false);
    expect(saved).toEqual([]);
  });
});

describe("canExport", () => {
  it("is false while the graph is loading or has no pages, and true with one page", () => {
    expect(canExport(null)).toBe(false);
    expect(canExport({ totalPages: 0 })).toBe(false);
    expect(canExport({ totalPages: 1 })).toBe(true);
  });
});
