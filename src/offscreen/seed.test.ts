import { describe, expect, it } from "vitest";
import { failure, type RelateResult } from "../shared/messages";
import { shouldSeed } from "./seed";

const counted = (rows: RelateResult["rows"]) => ({
  ok: true as const,
  value: { columns: ["nodes"], rows, stats: {} },
});

describe("shouldSeed", () => {
  it("seeds a graph with no nodes", () => {
    expect(shouldSeed(counted([{ nodes: 0 }]))).toBe(true);
  });

  it("does not seed a graph that already has a node", () => {
    expect(shouldSeed(counted([{ nodes: 1 }]))).toBe(false);
  });

  it("does not seed when the check failed", () => {
    expect(shouldSeed(failure("relate", "syntax error"))).toBe(false);
  });

  it("does not seed when the check returned no count", () => {
    expect(shouldSeed(counted([]))).toBe(false);
    expect(shouldSeed(counted([{ other: 0 }]))).toBe(false);
  });
});
