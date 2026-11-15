import type { RelateDb } from "@relate/relate-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import demoCypher from "../seed/demo.cypher?raw";
import demoJson from "../seed/demo.json?raw";
import { toCypherScript } from "../src/shared/cypher";
import type { Clip } from "../src/shared/extraction";
import { buildAddressesStatement, buildClipStatements } from "../src/shared/graph-statements";
import {
  DemoDataSchema,
  resolveAddresses,
  SampleSchema,
  sampleClip,
} from "../src/shared/seed-data";
import { openMemoryDb, runScript, scalar } from "../src/shared/test/relate-node";

// public/samples/ の同梱サンプルと事前抽出データを、デモデータの上でクリップして確かめる

const sampleFiles = import.meta.glob<string>("../public/samples/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
});
const samples = Object.entries(sampleFiles).map(([file, text]) => ({
  file,
  data: JSON.parse(text) as unknown,
}));
const samplePages = Object.keys(
  import.meta.glob("../public/samples/*.html", { query: "?url", eager: true }),
);
const demo = DemoDataSchema.parse(JSON.parse(demoJson));
const REPOSITORY_FILES = "https://github.com/sumiredc/linka/blob/main/public/";

describe("public/samples", () => {
  it("bundles 2 to 3 sample pages", () => {
    expect(samplePages.length).toBeGreaterThanOrEqual(2);
    expect(samplePages.length).toBeLessThanOrEqual(3);
  });

  it("has pre-extracted data for every sample page", () => {
    expect(samples.map(({ file }) => file.replace(/\.json$/, ".html")).sort()).toEqual(
      [...samplePages].sort(),
    );
  });
});

describe.each(samples)("$file", ({ file, data }) => {
  it("satisfies SampleSchema", () => {
    expect(SampleSchema.safeParse(data).success).toBe(true);
  });

  it("names the sample page next to it", () => {
    expect(`../public/${SampleSchema.parse(data).path}`).toBe(file.replace(/\.json$/, ".html"));
  });

  it("uses the sample file's URL in the repository as its page URL", () => {
    const { path, url } = SampleSchema.parse(data);
    expect(url).toBe(`${REPOSITORY_FILES}${path}`);
  });

  it("links to the demo graph with at least one judged pair", () => {
    expect(SampleSchema.parse(data).addresses.length).toBeGreaterThan(0);
  });
});

describe.each(samples)("clipping $file on top of the seed", ({ data }) => {
  const sample = SampleSchema.parse(data);
  let db: RelateDb;
  let clip: Clip;
  beforeAll(() => {
    db = openMemoryDb();
    runScript(db, demoCypher);
    clip = sampleClip(sample, "2026-11-15T09:00:00Z");
    const links = resolveAddresses([...demo.clips, clip], sample.addresses);
    runScript(db, toCypherScript([...buildClipStatements(clip), buildAddressesStatement(links)]));
  });

  it("records its claims with source sample", () => {
    const sources = scalar(
      db,
      "MATCH (:Page {url: $url})-[:ASSERTS]->(c:Claim) RETURN collect(DISTINCT c.source) AS s",
      { url: clip.url },
    );
    expect(sources).toEqual(["sample"]);
  });

  it("mentions at least one concept that a demo page also mentions", () => {
    const shared = scalar(
      db,
      [
        "MATCH (p:Page {url: $url})-[:MENTIONS]->(c:Concept)<-[:MENTIONS]-(other:Page)",
        "WHERE other.url <> p.url",
        "RETURN count(DISTINCT c) AS n",
      ].join("\n"),
      { url: clip.url },
    );
    expect(shared).toBeGreaterThan(0);
  });

  it("adds one ADDRESSES per judged pair", () => {
    const total = scalar(db, "MATCH ()-[r:ADDRESSES]->() RETURN count(r) AS n");
    expect(total).toBe(demo.addresses.length + sample.addresses.length);
  });
});
