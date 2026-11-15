import { describe, expect, it } from "vitest";
import { EXTRACTION_LIMITS, type Extraction, ExtractionSchema } from "./extraction";
import { mergeExtractions } from "./merge-extractions";

const empty: Extraction = {
  summary: "",
  concepts: [],
  authors: [],
  claims: [],
  relatedConcepts: [],
};

const part = (fields: Partial<Extraction>): Extraction => ({ ...empty, ...fields });

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

  it("returns an empty extraction for no chunks", () => {
    expect(mergeExtractions([])).toEqual(empty);
  });
});
