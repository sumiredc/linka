import { describe, expect, it } from "vitest";
import { EXTRACTION_LIMITS, type Extraction, ExtractionSchema } from "./extraction";
import { mergeExtractions, UNLISTED_CATEGORY } from "./merge-extractions";

const empty: Extraction = {
  summary: "",
  concepts: [],
  authors: [],
  claims: [],
  relatedConcepts: [],
};

const part = (fields: Partial<Extraction>): Extraction => ({ ...empty, ...fields });

const listed = (...names: string[]) => names.map((name) => ({ name, category: "topic" }));

/** claims と relatedConcepts が参照する概念名のうち、concepts に無いもの */
function unlistedReferences(extraction: Extraction): string[] {
  const names = new Set(extraction.concepts.map((c) => c.name));
  return [
    ...extraction.claims.flatMap((c) => c.concepts),
    ...extraction.relatedConcepts.flatMap((r) => [r.from, r.to]),
  ].filter((name) => !names.has(name));
}

describe("mergeExtractions", () => {
  it("merges concepts whose names share a key into one, keeping the first name and category", () => {
    const merged = mergeExtractions([
      part({ concepts: [{ name: "WebAssembly", category: "runtime" }] }),
      part({
        concepts: [
          { name: "Wasm", category: "format" },
          { name: "web-assembly", category: "language" },
        ],
      }),
    ]);
    expect(merged.concepts).toEqual([{ name: "WebAssembly", category: "runtime" }]);
  });

  it("keeps concepts with different keys from every chunk", () => {
    const merged = mergeExtractions([
      part({ concepts: [{ name: "OPFS", category: "storage" }] }),
      part({ concepts: [{ name: "SQLite", category: "database" }] }),
    ]);
    expect(merged.concepts.map((c) => c.name)).toEqual(["OPFS", "SQLite"]);
  });

  it("drops a concept whose name has an empty key", () => {
    const merged = mergeExtractions([part({ concepts: [{ name: "-", category: "misc" }] })]);
    expect(merged.concepts).toEqual([]);
  });

  it("renames the concepts a claim refers to after the merged concept", () => {
    const merged = mergeExtractions([
      part({ concepts: [{ name: "WebAssembly", category: "runtime" }] }),
      part({ claims: [{ statement: "Wasm is fast.", type: "benefit", concepts: ["wasm"] }] }),
    ]);
    expect(merged.claims[0]?.concepts).toEqual(["WebAssembly"]);
  });

  it("merges claims with the same statement up to whitespace and joins their concepts", () => {
    const merged = mergeExtractions([
      part({ claims: [{ statement: "OPFS is fast.", type: "benefit", concepts: ["OPFS"] }] }),
      part({
        claims: [{ statement: " OPFS  is fast. ", type: "fact", concepts: ["opfs", "SQLite"] }],
      }),
    ]);
    expect(merged.claims).toEqual([
      { statement: "OPFS is fast.", type: "benefit", concepts: ["OPFS", "SQLite"] },
    ]);
  });

  it("keeps claims with different statements as separate claims", () => {
    const merged = mergeExtractions([
      part({ claims: [{ statement: "A.", type: "fact", concepts: [] }] }),
      part({ claims: [{ statement: "B.", type: "fact", concepts: [] }] }),
    ]);
    expect(merged.claims.map((c) => c.statement)).toEqual(["A.", "B."]);
  });

  it("merges authors whose names differ only in whitespace and compatibility characters", () => {
    const merged = mergeExtractions([
      part({ authors: ["James Long"] }),
      part({ authors: ["James  Long", "Ｔhomas Steiner"] }),
    ]);
    expect(merged.authors).toEqual(["James Long", "Thomas Steiner"]);
  });

  it("does not merge authors whose names differ in case", () => {
    const merged = mergeExtractions([part({ authors: ["Ada"] }), part({ authors: ["ADA"] })]);
    expect(merged.authors).toEqual(["Ada", "ADA"]);
  });

  it("treats related concept pairs as undirected and drops a concept related to itself", () => {
    const merged = mergeExtractions([
      part({ relatedConcepts: [{ from: "OPFS", to: "SQLite" }] }),
      part({
        relatedConcepts: [
          { from: "sqlite", to: "opfs" },
          { from: "Wasm", to: "WebAssembly" },
        ],
      }),
    ]);
    expect(merged.relatedConcepts).toEqual([{ from: "OPFS", to: "SQLite" }]);
  });

  it("uses the first non-empty summary", () => {
    const merged = mergeExtractions([
      part({ summary: "  " }),
      part({ summary: "Intro." }),
      part({ summary: "Later." }),
    ]);
    expect(merged.summary).toBe("Intro.");
  });

  it("takes items from every chunk in turn when the merged list exceeds the limit", () => {
    const claims = (prefix: string) =>
      Array.from({ length: EXTRACTION_LIMITS.claims }, (_, i) => ({
        statement: `${prefix} ${i}.`,
        type: "fact" as const,
        concepts: [],
      }));
    const merged = mergeExtractions([part({ claims: claims("A") }), part({ claims: claims("B") })]);
    expect(merged.claims).toHaveLength(EXTRACTION_LIMITS.claims);
    expect(merged.claims.slice(0, 4).map((c) => c.statement)).toEqual([
      "A 0.",
      "B 0.",
      "A 1.",
      "B 1.",
    ]);
  });

  it("returns an extraction that the shared schema accepts even when the chunks overflow its limits", () => {
    const full = (prefix: string): Extraction => ({
      summary: `${prefix} summary.`,
      concepts: Array.from({ length: 20 }, (_, i) => ({ name: `${prefix}${i}`, category: "c" })),
      authors: Array.from({ length: 5 }, (_, i) => `${prefix} Author ${i}`),
      claims: Array.from({ length: 20 }, (_, i) => ({
        statement: `${prefix} claim ${i}.`,
        type: "fact" as const,
        concepts: Array.from({ length: 5 }, (_, j) => `${prefix}${(i + j) % 20}`),
      })),
      relatedConcepts: Array.from({ length: 20 }, (_, i) => ({
        from: `${prefix}${i}`,
        to: `${prefix}${(i + 1) % 20}`,
      })),
    });
    const merged = mergeExtractions([full("A"), full("B"), full("C")]);
    expect(ExtractionSchema.safeParse(merged).success).toBe(true);
  });

  it("keeps the most referenced concepts when there are more than the limit, and drops references to the rest", () => {
    const names = (prefix: string) => Array.from({ length: 15 }, (_, i) => `${prefix}${i}`);
    const chunk = (prefix: string, referenced: string[]) =>
      part({
        concepts: listed(...names(prefix)),
        claims: [{ statement: `${prefix} claim.`, type: "fact", concepts: referenced }],
        relatedConcepts: [{ from: `${prefix}0`, to: `${prefix}14` }],
      });
    const merged = mergeExtractions([
      chunk("A", ["A14", "A13", "A0"]),
      chunk("B", ["B14", "B13", "B12", "B0", "A0"]),
    ]);
    expect(merged.concepts).toHaveLength(EXTRACTION_LIMITS.concepts);
    // A0 は 3 回、B0・A14・B14 は 2 回参照される。同数なら interleave の順
    expect(merged.concepts.slice(0, 4).map((c) => c.name)).toEqual(["A0", "B0", "A14", "B14"]);
    expect(merged.concepts.map((c) => c.name)).toEqual(
      expect.arrayContaining(["A13", "B0", "B14", "B13", "B12"]),
    );
    expect(unlistedReferences(merged)).toEqual([]);
  });

  it("keeps a concept that is referenced but not listed, with the category for unlisted concepts", () => {
    const merged = mergeExtractions([
      part({
        concepts: listed("OPFS"),
        claims: [{ statement: "OPFS is fast.", type: "fact", concepts: ["OPFS", "SQLite"] }],
        relatedConcepts: [{ from: "OPFS", to: "SQLite" }],
      }),
    ]);
    expect(merged.concepts).toEqual([
      { name: "OPFS", category: "topic" },
      { name: "SQLite", category: UNLISTED_CATEGORY },
    ]);
    expect(merged.claims[0]?.concepts).toEqual(["OPFS", "SQLite"]);
    expect(merged.relatedConcepts).toEqual([{ from: "OPFS", to: "SQLite" }]);
  });

  it("uses the listed name and category when another chunk only refers to the concept", () => {
    const merged = mergeExtractions([
      part({ claims: [{ statement: "Wasm is fast.", type: "fact", concepts: ["wasm"] }] }),
      part({ concepts: [{ name: "WebAssembly", category: "runtime" }] }),
    ]);
    expect(merged.concepts).toEqual([{ name: "WebAssembly", category: "runtime" }]);
  });

  it("ranks unlisted concepts together with listed ones when there are more than the limit", () => {
    const names = Array.from({ length: EXTRACTION_LIMITS.concepts }, (_, i) => `L${i}`);
    const merged = mergeExtractions([
      part({
        concepts: listed(...names),
        claims: [{ statement: "U matters.", type: "fact", concepts: ["U"] }],
      }),
    ]);
    expect(merged.concepts).toHaveLength(EXTRACTION_LIMITS.concepts);
    expect(merged.concepts[0]).toEqual({ name: "U", category: UNLISTED_CATEGORY });
    expect(merged.concepts.map((c) => c.name)).not.toContain(`L${EXTRACTION_LIMITS.concepts - 1}`);
  });

  it("drops references to concepts cut by the limit, and relations that lose an end", () => {
    const pairs = (prefix: string) =>
      Array.from({ length: 11 }, (_, i) => [`${prefix}${2 * i}`, `${prefix}${2 * i + 1}`]);
    const merged = mergeExtractions([
      part({
        claims: pairs("K").map((concepts, i) => ({
          statement: `Claim ${i}.`,
          type: "fact" as const,
          concepts,
        })),
        relatedConcepts: pairs("R").map(([from = "", to = ""]) => ({ from, to })),
      }),
    ]);
    // どれも 1 回ずつの参照なので、最初に参照された K0〜K19 が残る
    expect(merged.concepts.map((c) => c.name)).toEqual(
      Array.from({ length: EXTRACTION_LIMITS.concepts }, (_, i) => `K${i}`),
    );
    expect(merged.claims.at(-1)?.concepts).toEqual([]);
    expect(merged.relatedConcepts).toEqual([]);
    expect(unlistedReferences(merged)).toEqual([]);
  });

  it("keeps at most the per-claim limit of concepts when one claim is merged from two chunks", () => {
    const names = ["C0", "C1", "C2", "C3", "C4", "C5", "C6"];
    const merged = mergeExtractions([
      part({
        concepts: listed(...names),
        claims: [{ statement: "Same.", type: "fact", concepts: names.slice(0, 4) }],
      }),
      part({ claims: [{ statement: "Same.", type: "fact", concepts: names.slice(3) }] }),
    ]);
    expect(merged.claims[0]?.concepts).toEqual(names.slice(0, EXTRACTION_LIMITS.conceptsPerClaim));
    expect(ExtractionSchema.safeParse(merged).success).toBe(true);
  });

  it("drops an author whose name grows past the schema limit when normalised", () => {
    // ㍿ は NFKC で 4 文字（株式会社）になる
    const long = "㍿".repeat(21);
    const merged = mergeExtractions([part({ authors: [long, "Ada"] })]);
    expect(merged.authors).toEqual(["Ada"]);
    expect(ExtractionSchema.safeParse(merged).success).toBe(true);
  });

  it("drops a claim whose statement is only whitespace", () => {
    const merged = mergeExtractions([
      part({ claims: [{ statement: " \n ", type: "fact", concepts: [] }] }),
    ]);
    expect(merged.claims).toEqual([]);
  });

  it("trims the whitespace around a concept name", () => {
    const merged = mergeExtractions([
      part({ concepts: [{ name: " OPFS ", category: "storage" }] }),
    ]);
    expect(merged.concepts).toEqual([{ name: "OPFS", category: "storage" }]);
  });

  it("returns an empty extraction for no chunks", () => {
    expect(mergeExtractions([])).toEqual(empty);
  });
});
