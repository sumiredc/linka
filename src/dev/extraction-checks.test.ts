import { describe, expect, it } from "vitest";
import { annotatedNames, annotationReason, proposeChunk } from "./extraction-checks";

describe("annotationReason", () => {
  it("accepts bare names up to four words", () => {
    expect(annotationReason("OPFS")).toBeNull();
    expect(annotationReason("Origin private file system")).toBeNull();
  });

  it("flags parentheses, colons and names longer than four words", () => {
    expect(annotationReason("OPFS (Origin Private File System)")).toBe("括弧");
    expect(annotationReason("Storage: quota")).toBe("コロン");
    expect(annotationReason("A way to keep data offline")).toBe("6 語");
  });
});

describe("annotatedNames", () => {
  it("checks names from concepts, claims and related concepts once each", () => {
    const names = annotatedNames({
      summary: "",
      concepts: [{ name: "WASM (likely WebAssembly)", category: "runtime" }],
      authors: [],
      claims: [{ statement: "", type: "fact", concepts: ["WASM (likely WebAssembly)", "V8"] }],
      relatedConcepts: [{ from: "V8", to: "Memory: 4GB" }],
    });
    expect(names).toEqual([
      { name: "WASM (likely WebAssembly)", reason: "括弧" },
      { name: "Memory: 4GB", reason: "コロン" },
    ]);
  });
});

describe("proposeChunk", () => {
  it("leaves room for the prompt and the output, minus the margin", () => {
    expect(
      proposeChunk({
        contextWindow: 6000,
        overheadTokens: 500,
        outputReserveTokens: 1500,
        charsPerToken: 4,
        margin: 0.25,
      }),
    ).toEqual({ tokens: 3000, chars: 12000 });
  });

  it("returns zero when the prompt and output do not fit", () => {
    expect(
      proposeChunk({
        contextWindow: 1000,
        overheadTokens: 800,
        outputReserveTokens: 400,
        charsPerToken: 4,
      }),
    ).toEqual({ tokens: 0, chars: 0 });
  });
});
