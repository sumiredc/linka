import { describe, expect, it } from "vitest";
import { pageUrlOf } from "./clip-status";

describe("pageUrlOf", () => {
  it("normalises the URL of an ordinary tab", () => {
    expect(pageUrlOf("https://example.com/post?utm_source=x#top")).toBe("https://example.com/post");
  });

  it("returns null for a tab URL that is not a URL", () => {
    expect(pageUrlOf("")).toBeNull();
  });
});
