import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("drops the fragment", () => {
    expect(normalizeUrl("https://example.com/post#section-2")).toBe("https://example.com/post");
  });

  it("drops an empty fragment marker", () => {
    expect(normalizeUrl("https://example.com/post#")).toBe("https://example.com/post");
  });

  it("drops utm_* parameters regardless of case", () => {
    expect(normalizeUrl("https://example.com/post?utm_source=x&UTM_Medium=y")).toBe(
      "https://example.com/post",
    );
  });

  it("drops click identifiers such as fbclid and gclid", () => {
    expect(normalizeUrl("https://example.com/post?fbclid=a&gclid=b")).toBe(
      "https://example.com/post",
    );
  });

  it("keeps non-tracking parameters in their original order", () => {
    expect(normalizeUrl("https://example.com/search?q=wasm&utm_source=x&page=2")).toBe(
      "https://example.com/search?q=wasm&page=2",
    );
  });

  it("keeps the original encoding of kept parameters", () => {
    expect(normalizeUrl("https://example.com/search?q=web%20assembly&utm_source=x")).toBe(
      "https://example.com/search?q=web%20assembly",
    );
  });

  it("does not drop parameters that only contain a tracking name as a substring", () => {
    expect(normalizeUrl("https://example.com/p?my_utm_source=1&gclid_note=2")).toBe(
      "https://example.com/p?my_utm_source=1&gclid_note=2",
    );
  });

  it("drops empty pairs left by stray ampersands", () => {
    expect(normalizeUrl("https://example.com/p?&a=1&&")).toBe("https://example.com/p?a=1");
  });

  it("lowercases the scheme and host", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Post")).toBe("https://example.com/Post");
  });

  it("removes the default port", () => {
    expect(normalizeUrl("https://example.com:443/post")).toBe("https://example.com/post");
  });

  it("keeps the path's trailing slash as it is", () => {
    expect(normalizeUrl("https://example.com/post/")).toBe("https://example.com/post/");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  https://example.com/post \n")).toBe("https://example.com/post");
  });

  it("maps URL variants of the same page to one key", () => {
    const variants = [
      "https://example.com/post",
      "https://EXAMPLE.com/post#intro",
      "https://example.com/post?utm_campaign=news",
      "https://example.com:443/post?fbclid=1#x",
    ];
    expect(new Set(variants.map(normalizeUrl))).toEqual(new Set(["https://example.com/post"]));
  });

  it("throws on a string that is not a URL", () => {
    expect(() => normalizeUrl("not a url")).toThrow();
  });
});
