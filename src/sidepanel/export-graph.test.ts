import { describe, expect, it } from "vitest";
import { EXPORT_FILE_NAME, EXPORT_READ_SCRIPT } from "../shared/graph-export";
import { failure, type RelateResult } from "../shared/messages";
import { canExport, exportGraph, pickSaveTarget, type SaveTarget } from "./export-graph";

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

function fakeDeps(
  response: Awaited<ReturnType<Parameters<typeof exportGraph>[0]["readGraph"]>>,
  kind: SaveTarget["kind"] | "cancel" = "file",
) {
  const saved: string[] = [];
  const picked: string[] = [];
  const requests: unknown[] = [];
  return {
    saved,
    picked,
    requests,
    deps: {
      readGraph: async (request: { kind: "executeScript"; script: string }) => {
        requests.push(request);
        return response;
      },
      pickTarget: async (fileName: string) => {
        picked.push(fileName);
        if (kind === "cancel") return null;
        return { kind, write: async (text: string) => void saved.push(text) };
      },
    },
  };
}

describe("exportGraph", () => {
  it("asks where to save linka-export.cypher, reads the graph in one script and writes it there", async () => {
    const { deps, saved, picked, requests } = fakeDeps({ ok: true, value: ONE_PAGE });
    const outcome = await exportGraph(deps);
    expect(picked).toEqual([EXPORT_FILE_NAME]);
    expect(requests).toEqual([{ kind: "executeScript", script: EXPORT_READ_SCRIPT }]);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toContain("MERGE (n:Page {url: row.url})\nSET n += row;");
    expect(saved[0]).toContain("url: 'https://a.example/'");
    expect(outcome).toEqual({
      ok: true,
      counts: { nodes: { Page: 1, Person: 0, Concept: 0, Claim: 0 }, relationships: 0 },
      savedTo: "file",
    });
  });

  it("says when the file was downloaded instead", async () => {
    const { deps } = fakeDeps({ ok: true, value: ONE_PAGE }, "download");
    expect(await exportGraph(deps)).toMatchObject({ ok: true, savedTo: "download" });
  });

  it("reads and saves nothing when the save is cancelled", async () => {
    const { deps, saved, requests } = fakeDeps({ ok: true, value: ONE_PAGE }, "cancel");
    expect(await exportGraph(deps)).toBeNull();
    expect(requests).toEqual([]);
    expect(saved).toEqual([]);
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
    expect(outcome?.ok).toBe(false);
    expect(saved).toEqual([]);
  });

  it("reports the error when writing the file fails", async () => {
    const { deps } = fakeDeps({ ok: true, value: ONE_PAGE });
    const outcome = await exportGraph({
      ...deps,
      pickTarget: async () => ({
        kind: "file",
        write: async () => {
          throw new DOMException("The file is locked", "NoModificationAllowedError");
        },
      }),
    });
    expect(outcome).toEqual({ ok: false, message: "The file is locked" });
  });
});

describe("pickSaveTarget", () => {
  it("writes the text to the file the user picked, suggesting the export's name", async () => {
    const written: string[] = [];
    const options: unknown[] = [];
    const target = await pickSaveTarget(EXPORT_FILE_NAME, async (option) => {
      options.push(option);
      return {
        createWritable: async () => ({
          write: async (text: string) => void written.push(text),
          close: async () => void written.push("<closed>"),
        }),
      };
    });
    expect(options).toMatchObject([{ suggestedName: EXPORT_FILE_NAME }]);
    expect(target?.kind).toBe("file");
    await target?.write("MATCH (n) DETACH DELETE n;");
    expect(written).toEqual(["MATCH (n) DETACH DELETE n;", "<closed>"]);
  });

  it("is null when the user cancels the dialog", async () => {
    const target = await pickSaveTarget(EXPORT_FILE_NAME, async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    });
    expect(target).toBeNull();
  });

  it("falls back to a download when the dialog cannot open", async () => {
    const target = await pickSaveTarget(EXPORT_FILE_NAME, async () => {
      throw new DOMException("Not allowed here", "SecurityError");
    });
    expect(target?.kind).toBe("download");
  });

  it("falls back to a download without the dialog", async () => {
    expect((await pickSaveTarget(EXPORT_FILE_NAME, undefined))?.kind).toBe("download");
  });
});

describe("canExport", () => {
  it("is false while the graph is loading or has no pages, and true with one page", () => {
    expect(canExport(null)).toBe(false);
    expect(canExport({ totalPages: 0 })).toBe(false);
    expect(canExport({ totalPages: 1 })).toBe(true);
  });
});
