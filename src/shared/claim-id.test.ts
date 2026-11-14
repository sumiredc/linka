import { describe, expect, it } from "vitest";
import { claimId, fnv1a64Hex, normalizeStatement } from "./claim-id";

describe("fnv1a64Hex", () => {
  it("matches the published FNV-1a 64 test vectors", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });

  it("hashes the UTF-8 bytes of non-ASCII text", () => {
    // "é" は UTF-8 で 0xC3 0xA9。符号単位 0xE9 を 1 バイトとして回すと af64644c8602d3a4 になる
    expect(fnv1a64Hex("é")).toBe("0ac21707b7181e01");
  });
});

describe("normalizeStatement", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeStatement("  OPFS   is\nfast. ")).toBe("OPFS is fast.");
  });

  it("keeps letter case", () => {
    expect(normalizeStatement("OPFS is fast.")).toBe("OPFS is fast.");
  });
});

describe("claimId", () => {
  const statement = "OPFS sync access handles allow fast random writes.";

  it("returns the same id for the same page and statement", () => {
    expect(claimId("https://example.com/a", statement)).toBe(
      claimId("https://example.com/a", statement),
    );
  });

  it("starts with the normalized page URL", () => {
    expect(claimId("https://example.com/a?utm_source=x#top", statement)).toMatch(
      /^https:\/\/example\.com\/a#claim-[0-9a-f]{16}$/,
    );
  });

  it("gives the same id for URL variants of the same page", () => {
    expect(claimId("https://example.com/a#top", statement)).toBe(
      claimId("https://example.com/a", statement),
    );
  });

  it("gives the same id when only whitespace in the statement differs", () => {
    expect(claimId("https://example.com/a", `  ${statement.replace(/ /g, "  ")}`)).toBe(
      claimId("https://example.com/a", statement),
    );
  });

  it("gives different ids for different statements on the same page", () => {
    expect(claimId("https://example.com/a", "A.")).not.toBe(claimId("https://example.com/a", "B."));
  });

  it("gives different ids for the same statement on different pages", () => {
    expect(claimId("https://example.com/a", statement)).not.toBe(
      claimId("https://example.com/b", statement),
    );
  });
});
