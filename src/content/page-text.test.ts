import { describe, expect, it } from "vitest";
import { chooseText, isPageReading, normalizeText } from "./page-text";

describe("normalizeText", () => {
  it("collapses runs of spaces and tabs inside a line", () => {
    expect(normalizeText("a  \t b")).toBe("a b");
  });

  it("trims each line", () => {
    expect(normalizeText("  a  \n  b  ")).toBe("a\nb");
  });

  it("keeps at most one blank line between paragraphs", () => {
    expect(normalizeText("a\n\n\n\n \n\nb")).toBe("a\n\nb");
  });

  it("converts CRLF and CR line endings to LF", () => {
    expect(normalizeText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("collapses non-breaking spaces", () => {
    expect(normalizeText("a  b")).toBe("a b");
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeText(" \n\t\n ")).toBe("");
  });
});

describe("chooseText", () => {
  it("uses the article text when it has content", () => {
    expect(chooseText("Article body", "Whole page")).toBe("Article body");
  });

  it("falls back to the body text when Readability found nothing", () => {
    expect(chooseText(null, "Whole page")).toBe("Whole page");
  });

  it("falls back to the body text when the article text is only whitespace", () => {
    expect(chooseText(" \n ", "Whole page")).toBe("Whole page");
  });

  it("returns an empty string when neither has text", () => {
    expect(chooseText(null, "  ")).toBe("");
  });
});

describe("isPageReading", () => {
  it("accepts an object with string url, title and text", () => {
    expect(isPageReading({ url: "https://example.com/", title: "", text: "x" })).toBe(true);
  });

  it("rejects a value missing a field", () => {
    expect(isPageReading({ url: "https://example.com/", title: "t" })).toBe(false);
  });

  it("rejects null and non-objects", () => {
    expect(isPageReading(null)).toBe(false);
    expect(isPageReading(undefined)).toBe(false);
    expect(isPageReading("text")).toBe(false);
  });
});
