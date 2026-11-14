import { describe, expect, it } from "vitest";
import { CONCEPT_ALIASES, mechanicalConceptKey, normalizeConceptKey } from "./concept-key";

describe("normalizeConceptKey", () => {
  it("lowercases the name", () => {
    expect(normalizeConceptKey("IndexedDB")).toBe("indexeddb");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeConceptKey("  OPFS \n")).toBe("opfs");
  });

  it("ignores spaces, hyphens and underscores inside the name", () => {
    const variants = ["Web Assembly", "web-assembly", "WebAssembly", "web_assembly"];
    expect(new Set(variants.map(normalizeConceptKey))).toEqual(new Set(["webassembly"]));
  });

  it("treats full-width characters like their ASCII counterparts", () => {
    expect(normalizeConceptKey("ＯＰＦＳ")).toBe("opfs");
  });

  it("keeps dots because they are part of names such as .NET", () => {
    expect(normalizeConceptKey(".NET")).toBe(".net");
  });

  it("maps a listed alias to its canonical key", () => {
    expect(normalizeConceptKey("Wasm")).toBe("webassembly");
  });

  it("applies the alias after mechanical normalization", () => {
    expect(normalizeConceptKey("Node JS")).toBe("node.js");
  });

  it("returns the mechanical key when the name has no alias", () => {
    expect(normalizeConceptKey("CRDT")).toBe("crdt");
  });
});

describe("CONCEPT_ALIASES", () => {
  it("writes every alias in mechanically normalized form so that lookups can hit", () => {
    for (const alias of Object.keys(CONCEPT_ALIASES)) {
      expect(mechanicalConceptKey(alias)).toBe(alias);
    }
  });

  it("writes every canonical key in mechanically normalized form", () => {
    for (const canonical of Object.values(CONCEPT_ALIASES)) {
      expect(mechanicalConceptKey(canonical)).toBe(canonical);
    }
  });

  it("never points an alias at another alias", () => {
    for (const canonical of Object.values(CONCEPT_ALIASES)) {
      expect(Object.keys(CONCEPT_ALIASES)).not.toContain(canonical);
    }
  });
});
