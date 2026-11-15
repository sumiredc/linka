import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ExtractionSchema } from "../shared/extraction";
import { type Json, listKeywords, stripKeywords } from "./schema-keywords";

const schema: Json = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    maxLength: { type: "string", maxLength: 10 },
    items: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 3 },
  },
  required: ["maxLength", "items"],
};

describe("stripKeywords", () => {
  it("removes the keywords at every depth", () => {
    expect(stripKeywords(schema, ["$schema", "maxLength", "minLength", "maxItems"])).toEqual({
      type: "object",
      properties: {
        maxLength: { type: "string" },
        items: { type: "array", items: { type: "string" } },
      },
      required: ["maxLength", "items"],
    });
  });

  it("keeps a property whose name is the same as a removed keyword", () => {
    const stripped = stripKeywords(schema, ["maxLength"]) as { properties: object };
    expect(Object.keys(stripped.properties)).toEqual(["maxLength", "items"]);
  });

  it("leaves the input unchanged", () => {
    const before = JSON.stringify(schema);
    stripKeywords(schema, ["$schema"]);
    expect(JSON.stringify(schema)).toBe(before);
  });
});

describe("listKeywords", () => {
  it("lists keywords but not property names", () => {
    expect(listKeywords(schema)).toEqual([
      "$schema",
      "items",
      "maxItems",
      "maxLength",
      "minLength",
      "properties",
      "required",
      "type",
    ]);
  });

  it("finds every keyword that can be stripped in the extraction schema", () => {
    const keywords = listKeywords(z.toJSONSchema(ExtractionSchema) as Json);
    expect(keywords).toEqual(
      expect.arrayContaining(["$schema", "enum", "minLength", "maxLength", "maxItems"]),
    );
    const stripped = stripKeywords(z.toJSONSchema(ExtractionSchema) as Json, [
      "$schema",
      "minLength",
      "maxLength",
      "maxItems",
    ]);
    const remaining = listKeywords(stripped);
    for (const keyword of ["$schema", "minLength", "maxLength", "maxItems"]) {
      expect(remaining).not.toContain(keyword);
    }
    expect(remaining).toContain("enum");
  });
});
