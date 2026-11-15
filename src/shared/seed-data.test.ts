import { describe, expect, it } from "vitest";
import { claimId } from "./claim-id";
import type { Clip } from "./extraction";
import { resolveAddresses, type Sample, SampleSchema, sampleClip } from "./seed-data";

const CONCERN_URL = "https://example.com/concern";
const SOLUTION_URL = "https://example.com/solution";

function clip(url: string, claims: Clip["extraction"]["claims"]): Clip {
  return {
    url,
    title: url,
    clippedAt: "2026-11-14T09:00:00Z",
    source: "page",
    extraction: { summary: "", concepts: [], authors: [], claims, relatedConcepts: [] },
  };
}

const clips = [
  clip(CONCERN_URL, [
    { statement: "Storage gets evicted.", type: "concern", concepts: [] },
    { statement: "Ask for persistence.", type: "solution", concepts: [] },
  ]),
  clip(SOLUTION_URL, [{ statement: "Call persist().", type: "solution", concepts: [] }]),
];

const sample: Sample = {
  path: "samples/keep-data.html",
  url: "https://example.com/samples/keep-data.html",
  title: "Keep data",
  extraction: { summary: "", concepts: [], authors: [], claims: [], relatedConcepts: [] },
  addresses: [],
};

describe("resolveAddresses", () => {
  it("turns a pair of page and statement into the Claim ids of the solution and the concern", () => {
    const links = resolveAddresses(clips, [
      {
        solution: { page: SOLUTION_URL, statement: "Call persist()." },
        concern: { page: CONCERN_URL, statement: "Storage gets evicted." },
      },
    ]);
    expect(links).toEqual([
      {
        solution: claimId(SOLUTION_URL, "Call persist()."),
        concern: claimId(CONCERN_URL, "Storage gets evicted."),
      },
    ]);
  });

  it("rejects a statement that no clip asserts", () => {
    const refs = [
      {
        solution: { page: SOLUTION_URL, statement: "Call persist() twice." },
        concern: { page: CONCERN_URL, statement: "Storage gets evicted." },
      },
    ];
    expect(() => resolveAddresses(clips, refs)).toThrow(/見つかりません/);
  });

  it("rejects a solution side that points at a concern", () => {
    const refs = [
      {
        solution: { page: CONCERN_URL, statement: "Storage gets evicted." },
        concern: { page: CONCERN_URL, statement: "Storage gets evicted." },
      },
    ];
    expect(() => resolveAddresses(clips, refs)).toThrow(/solution ではなく concern/);
  });

  it("rejects a pair of claims on the same page", () => {
    const refs = [
      {
        solution: { page: CONCERN_URL, statement: "Ask for persistence." },
        concern: { page: CONCERN_URL, statement: "Storage gets evicted." },
      },
    ];
    expect(() => resolveAddresses(clips, refs)).toThrow(/同じページ/);
  });
});

describe("sampleClip", () => {
  it("records the sample's canonical URL as the page URL", () => {
    expect(sampleClip(sample, "2026-11-15T09:00:00Z").url).toBe(
      "https://example.com/samples/keep-data.html",
    );
  });

  it("marks the clip as coming from a bundled sample", () => {
    expect(sampleClip(sample, "2026-11-15T09:00:00Z").source).toBe("sample");
  });
});

describe("SampleSchema", () => {
  it("rejects a path outside samples/", () => {
    expect(SampleSchema.safeParse({ ...sample, path: "popup.html" }).success).toBe(false);
  });

  it("rejects a judged pair whose page is a relative path", () => {
    const addresses = [
      {
        solution: { page: "samples/keep-data.html", statement: "Write edits now." },
        concern: { page: CONCERN_URL, statement: "Storage gets evicted." },
      },
    ];
    expect(SampleSchema.safeParse({ ...sample, addresses }).success).toBe(false);
  });
});
