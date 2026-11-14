import { describe, expect, it } from "vitest";
import { normalizePersonName } from "./person-name";

describe("normalizePersonName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizePersonName("  Lin Clark \t")).toBe("Lin Clark");
  });

  it("collapses runs of inner whitespace into one space", () => {
    expect(normalizePersonName("Lin \n  Clark")).toBe("Lin Clark");
  });

  it("keeps letter case for display", () => {
    expect(normalizePersonName("Lin Clark")).toBe("Lin Clark");
  });

  it("treats a full-width space like an ASCII space", () => {
    expect(normalizePersonName("山田　太郎")).toBe("山田 太郎");
  });
});
