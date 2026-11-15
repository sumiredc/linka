import { describe, expect, it } from "vitest";
import crdtSample from "../../public/samples/crdt-notes-sync.json?raw";
import { loadSample, samplePageOf } from "./sample-page";

const ROOT = "chrome-extension://abcdefghijklmnop/";
const CRDT_URL = "https://github.com/sumiredc/linka/blob/main/public/samples/crdt-notes-sync.html";

describe("samplePageOf", () => {
  it("maps a sample page in the extension to its name and repository URL", () => {
    expect(samplePageOf(`${ROOT}samples/crdt-notes-sync.html`, ROOT)).toEqual({
      name: "crdt-notes-sync",
      path: "samples/crdt-notes-sync.html",
      dataUrl: `${ROOT}samples/crdt-notes-sync.json`,
      url: CRDT_URL,
    });
  });

  it("ignores the query and fragment of the tab URL", () => {
    expect(samplePageOf(`${ROOT}samples/crdt-notes-sync.html?x=1#claims`, ROOT)?.url).toBe(
      CRDT_URL,
    );
  });

  it.each([
    ["another extension's sample page", "chrome-extension://otherextensionid/samples/a.html"],
    ["a web page with the same path", "https://example.com/samples/crdt-notes-sync.html"],
    ["the repository page of the sample", CRDT_URL],
    ["another page of the extension", `${ROOT}sidepanel.html`],
    ["a file under samples/ that is not a page", `${ROOT}samples/sample.css`],
    ["the pre-extracted data itself", `${ROOT}samples/crdt-notes-sync.json`],
    ["a page in a folder under samples/", `${ROOT}samples/old/crdt-notes-sync.html`],
    ["a name outside the sample naming", `${ROOT}samples/CRDT_Notes.html`],
    ["a string that is not a URL", "not a url"],
  ])("does not treat %s as a sample", (_, tabUrl) => {
    expect(samplePageOf(tabUrl, ROOT)).toBeNull();
  });
});

describe("loadSample", () => {
  const page = samplePageOf(`${ROOT}samples/crdt-notes-sync.html`, ROOT);
  if (!page) throw new Error("not a sample page");
  const serve =
    (body: string, status = 200) =>
    async (url: string) => {
      expect(url).toBe(page.dataUrl);
      return new Response(body, { status });
    };

  it("turns the pre-extracted data into a sample clip at the repository URL", async () => {
    const { clip, addresses } = await loadSample(page, "2026-11-15T09:00:00Z", serve(crdtSample));
    expect(clip).toMatchObject({
      url: CRDT_URL,
      source: "sample",
      clippedAt: "2026-11-15T09:00:00Z",
    });
    expect(clip.extraction.claims.length).toBeGreaterThan(0);
    expect(addresses.length).toBeGreaterThan(0);
  });

  it("fails when the data cannot be read", async () => {
    await expect(loadSample(page, "2026-11-15T09:00:00Z", serve("", 404))).rejects.toThrow("404");
  });

  it("fails when the data does not satisfy the sample schema", async () => {
    const broken = JSON.stringify({ ...JSON.parse(crdtSample), extraction: { summary: 1 } });
    await expect(loadSample(page, "2026-11-15T09:00:00Z", serve(broken))).rejects.toThrow();
  });

  it("fails when the data belongs to another sample page", async () => {
    const other = JSON.stringify({ ...JSON.parse(crdtSample), path: "samples/other.html" });
    await expect(loadSample(page, "2026-11-15T09:00:00Z", serve(other))).rejects.toThrow(page.path);
  });

  it("fails when the clip time is not an ISO 8601 date time", async () => {
    await expect(loadSample(page, "yesterday", serve(crdtSample))).rejects.toThrow();
  });
});
