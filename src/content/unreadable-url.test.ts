import { describe, expect, it } from "vitest";
import { unreadableUrlReason } from "./unreadable-url";

describe("unreadableUrlReason", () => {
  it("allows an ordinary https page", () => {
    expect(unreadableUrlReason("https://example.com/post", false)).toBeNull();
  });

  it("allows an ordinary http page", () => {
    expect(unreadableUrlReason("http://example.com/post", false)).toBeNull();
  });

  it.each([
    "chrome://settings/",
    "chrome://newtab/",
    "chrome-extension://abcdefghijklmnop/popup.html",
    "chrome-search://local-ntp/local-ntp.html",
    "chrome-untrusted://terminal/",
    "devtools://devtools/bundled/inspector.html",
    "edge://settings/",
    "about:blank",
    "view-source:https://example.com/",
    "data:text/html,<p>hi</p>",
  ])("rejects %s as a restricted page", (url) => {
    expect(unreadableUrlReason(url, true)).toBe("restricted");
  });

  it("rejects a string that is not a URL as a restricted page", () => {
    expect(unreadableUrlReason("", true)).toBe("restricted");
  });

  it("rejects the Chrome Web Store", () => {
    expect(unreadableUrlReason("https://chromewebstore.google.com/detail/abc", false)).toBe(
      "web-store",
    );
  });

  it("rejects the old Chrome Web Store path", () => {
    expect(unreadableUrlReason("https://chrome.google.com/webstore/detail/abc", false)).toBe(
      "web-store",
    );
  });

  it("allows other pages on chrome.google.com", () => {
    expect(unreadableUrlReason("https://chrome.google.com/webstorefront", false)).toBeNull();
  });

  it("rejects a file URL without file access", () => {
    expect(unreadableUrlReason("file:///Users/me/notes.html", false)).toBe("file-access");
  });

  it("allows a file URL with file access", () => {
    expect(unreadableUrlReason("file:///Users/me/notes.html", true)).toBeNull();
  });
});
