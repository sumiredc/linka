import { describe, expect, it } from "vitest";
import { CHUNK_MAX_CHARS, chunkText } from "./chunk-text";

function words(count: number): string {
  return Array.from({ length: count }, () => "word").join(" ");
}

describe("chunkText", () => {
  it("returns an empty array for an empty body", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns an empty array for a body of only whitespace", () => {
    expect(chunkText(" \n\n\t ")).toEqual([]);
  });

  it("keeps a body of exactly the limit as one chunk", () => {
    const text = "a".repeat(CHUNK_MAX_CHARS);
    expect(chunkText(text)).toEqual([text]);
  });

  it("splits a body one character over the limit into two chunks", () => {
    const text = "a".repeat(CHUNK_MAX_CHARS + 1);
    const chunks = chunkText(text);
    expect(chunks.map((c) => c.length)).toEqual([CHUNK_MAX_CHARS, 1]);
  });

  it("trims surrounding whitespace before measuring the length", () => {
    expect(chunkText("  abcd  ", 4)).toEqual(["abcd"]);
  });

  it("never returns a chunk longer than the limit", () => {
    const text = Array.from({ length: 50 }, (_, i) => `${words(i * 7)}.`).join("\n\n");
    for (const chunk of chunkText(text, 200)) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it("never returns an empty chunk", () => {
    const text = `${"a".repeat(10)}\n\n\n\n   \n\n${"b".repeat(10)}`;
    const chunks = chunkText(text, 12);
    expect(chunks).toEqual(["a".repeat(10), "b".repeat(10)]);
  });

  it("splits at a paragraph break", () => {
    const first = "First paragraph. It has two sentences.";
    const second = "Second paragraph.";
    expect(chunkText(`${first}\n\n${second}`, first.length + 5)).toEqual([first, second]);
  });

  it("prefers a paragraph break to a later sentence end", () => {
    const text = "Alpha one. Alpha two.\n\nBeta one. Beta two. Beta three.";
    expect(chunkText(text, 34)[0]).toBe("Alpha one. Alpha two.");
  });

  it("splits a paragraph longer than the limit at sentence ends", () => {
    const text = "One two three. Four five six. Seven eight nine.";
    expect(chunkText(text, 30)).toEqual(["One two three. Four five six.", "Seven eight nine."]);
  });

  it("ignores a paragraph break in the first half of the limit", () => {
    const text = "ab\n\ncdefgh ijklmnop qrstuv";
    expect(chunkText(text, 20)[0]).toBe("ab\n\ncdefgh ijklmnop");
  });

  it("ignores a sentence end in the first half of the limit", () => {
    const text = "Hi. abcdefgh ijklmnop qrstuv";
    expect(chunkText(text, 20)[0]).toBe("Hi. abcdefgh");
  });

  it("uses a sentence end that falls exactly on the limit", () => {
    expect(chunkText("Ab cd. Ef gh.", 6)).toEqual(["Ab cd.", "Ef gh."]);
  });

  it("treats a closing quote after a full stop as part of the sentence end", () => {
    const text = 'He said "Stop." Then we all left.';
    expect(chunkText(text, 20)).toEqual(['He said "Stop."', "Then we all left."]);
  });

  it("treats a closing parenthesis after a question mark as part of the sentence end", () => {
    const text = "Is it (really?) Then we all left.";
    expect(chunkText(text, 20)).toEqual(["Is it (really?)", "Then we all left."]);
  });

  it("treats Japanese full stops as sentence ends without a following space", () => {
    const text = "これは一文目です。これは二文目です。これは三文目です。";
    expect(chunkText(text, 20)).toEqual([
      "これは一文目です。これは二文目です。",
      "これは三文目です。",
    ]);
  });

  it("falls back to whitespace when a sentence is longer than the limit", () => {
    expect(chunkText("alpha beta gamma delta", 12)).toEqual(["alpha beta", "gamma delta"]);
  });

  it("cuts inside a word only when there is no whitespace", () => {
    expect(chunkText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("does not split a surrogate pair", () => {
    const chunks = chunkText("abc😀def", 4);
    expect(chunks).toEqual(["abc", "😀de", "f"]);
  });

  it("keeps every non-whitespace character in order", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}. ${words(i)}`).join("\n\n");
    const strip = (s: string) => s.replace(/\s+/g, "");
    expect(strip(chunkText(text, 120).join(""))).toBe(strip(text));
  });

  it("rejects a limit below 2", () => {
    expect(() => chunkText("abc", 1)).toThrow(RangeError);
  });
});
