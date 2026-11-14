import type { RelateDb } from "@relate/relate-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import demoCypher from "../seed/demo.cypher?raw";
import demoJson from "../seed/demo.json?raw";
import { claimId } from "../src/shared/claim-id";
import { normalizeConceptKey } from "../src/shared/concept-key";
import type { Clip } from "../src/shared/extraction";
import { normalizePersonName } from "../src/shared/person-name";
import { DemoDataSchema } from "../src/shared/seed-data";
import { openMemoryDb, runScript, scalar } from "../src/shared/test/relate-node";
import { buildSeedScript } from "./seed-script";

const demo = DemoDataSchema.parse(JSON.parse(demoJson));

function count(db: RelateDb, pattern: string): unknown {
  return scalar(db, `MATCH ${pattern} RETURN count(*) AS n`);
}

function distinctConceptKeys(clips: readonly Clip[]): Set<string> {
  const names = clips.flatMap(({ extraction }) => [
    ...extraction.concepts.map((concept) => concept.name),
    ...extraction.claims.flatMap((claim) => claim.concepts),
    ...extraction.relatedConcepts.flatMap(({ from, to }) => [from, to]),
  ]);
  return new Set(names.map(normalizeConceptKey));
}

describe("seed/demo.json", () => {
  it("satisfies DemoDataSchema", () => {
    expect(DemoDataSchema.safeParse(JSON.parse(demoJson)).success).toBe(true);
  });

  it("has 10 to 15 pages", () => {
    expect(demo.clips.length).toBeGreaterThanOrEqual(10);
    expect(demo.clips.length).toBeLessThanOrEqual(15);
  });
});

describe("seed/demo.cypher", () => {
  it("is what npm run seed generates from seed/demo.json", () => {
    expect(demoCypher).toBe(buildSeedScript(demo));
  });
});

describe("seed/demo.cypher on Relate", () => {
  let db: RelateDb;
  beforeAll(() => {
    db = openMemoryDb();
    runScript(db, demoCypher);
  });

  it("creates one Page per clip", () => {
    expect(count(db, "(:Page)")).toBe(demo.clips.length);
  });

  it("creates one Concept per distinct concept key", () => {
    expect(count(db, "(:Concept)")).toBe(distinctConceptKeys(demo.clips).size);
  });

  it("creates one Person per distinct author", () => {
    const names = new Set(
      demo.clips.flatMap((clip) => clip.extraction.authors.map(normalizePersonName)),
    );
    expect(count(db, "(:Person)")).toBe(names.size);
  });

  it("creates one Claim per distinct claim id", () => {
    const ids = new Set(
      demo.clips.flatMap((clip) =>
        clip.extraction.claims.map((claim) => claimId(clip.url, claim.statement)),
      ),
    );
    expect(count(db, "(:Claim)")).toBe(ids.size);
  });

  it("creates one ADDRESSES per listed pair", () => {
    expect(count(db, "()-[:ADDRESSES]->()")).toBe(demo.addresses.length);
  });
});
