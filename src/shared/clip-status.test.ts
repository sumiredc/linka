import { describe, expect, it } from "vitest";
import { pageUrlOf } from "./clip-status";

const ROOT = "chrome-extension://abcdefghijklmnop/";

describe("pageUrlOf", () => {
  it("normalises the URL of an ordinary tab", () => {
    expect(pageUrlOf("https://example.com/post?utm_source=x#top", ROOT)).toBe(
      "https://example.com/post",
    );
  });

  it("maps a bundled sample page to its repository URL", () => {
    expect(pageUrlOf(`${ROOT}samples/keep-offline-data.html`, ROOT)).toBe(
      "https://github.com/sumiredc/linka/blob/main/public/samples/keep-offline-data.html",
    );
  });

  it("returns null for a tab URL that is not a URL", () => {
    expect(pageUrlOf("", ROOT)).toBeNull();
  });
});
