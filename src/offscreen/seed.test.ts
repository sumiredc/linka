import { describe, expect, it } from "vitest";
import { failure, type RelateResult } from "../shared/messages";
import { seedPlan, shouldSeed, storedSeedProgress } from "./seed";

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

describe("seedPlan", () => {
  it("seeds a store with no record only if it is empty", () => {
    expect(seedPlan(null)).toBe("ifEmpty");
  });

  it("finishes a seed or reset that started but did not complete", () => {
    expect(seedPlan("pending")).toBe("finish");
  });

  it("never seeds a store that was seeded before, even if it is empty now", () => {
    expect(seedPlan("done")).toBe("none");
  });
});

describe("storedSeedProgress", () => {
  const memoryStorage = (initial: Record<string, string> = {}) => {
    const items = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };
  };

  it("reads back what it stored", () => {
    const progress = storedSeedProgress(memoryStorage());
    expect(progress.get()).toBeNull();
    progress.set("pending");
    expect(progress.get()).toBe("pending");
    progress.set("done");
    expect(progress.get()).toBe("done");
  });

  it("treats an unknown stored value as no record", () => {
    expect(storedSeedProgress(memoryStorage({ "linka.seedProgress": "?" })).get()).toBeNull();
  });
});
