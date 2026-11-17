import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type Clip, ClipSchema, type Extraction, ExtractionSchema } from "./extraction";

const extraction: Extraction = {
  summary: "How OPFS makes SQLite fast in the browser.",
  concepts: [{ name: "OPFS", category: "storage" }],
  authors: ["Jane Doe"],
  claims: [{ statement: "OPFS is fast.", type: "solution", concepts: ["OPFS"] }],
  relatedConcepts: [{ from: "OPFS", to: "SQLite" }],
};

describe("ExtractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    expect(ExtractionSchema.safeParse(extraction).success).toBe(true);
  });

  it("rejects a claim type outside benefit, concern, solution and fact", () => {
    const bad = { ...extraction, claims: [{ ...extraction.claims[0], type: "opinion" }] };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an extraction with a missing field", () => {
    const { relatedConcepts: _, ...withoutRelated } = extraction;
    expect(ExtractionSchema.safeParse(withoutRelated).success).toBe(false);
  });

  it("rejects an empty concept name", () => {
    const bad = { ...extraction, concepts: [{ name: "", category: "storage" }] };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a concept name long enough to carry an explanation", () => {
    const bad = { ...extraction, concepts: [{ name: "x".repeat(61), category: "storage" }] };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("ExtractionSchema as JSON Schema", () => {
  const schema = z.toJSONSchema(ExtractionSchema) as {
    required: string[];
    properties: Record<string, unknown>;
  };

  it("converts to JSON Schema without throwing", () => {
    expect(schema).toMatchObject({ type: "object" });
  });

  it("marks every top-level field as required", () => {
    expect(new Set(schema.required)).toEqual(new Set(Object.keys(schema.properties)));
  });

  it("lists claim types as an enum", () => {
    expect(schema.properties.claims).toMatchObject({
      items: { properties: { type: { enum: ["benefit", "concern", "solution", "fact"] } } },
    });
  });
});

describe("ClipSchema", () => {
  const clip: Clip = {
    url: "https://example.com/a",
    title: "A",
    clippedAt: "2026-11-15T00:00:00Z",
    source: "page",
    extraction,
  };

  it("accepts a well-formed clip", () => {
    expect(ClipSchema.safeParse(clip).success).toBe(true);
  });

  it("rejects a source outside page and selection", () => {
    expect(ClipSchema.safeParse({ ...clip, source: "manual" }).success).toBe(false);
  });

  it("rejects clippedAt that is not an ISO datetime", () => {
    expect(ClipSchema.safeParse({ ...clip, clippedAt: "11/15" }).success).toBe(false);
  });
});
