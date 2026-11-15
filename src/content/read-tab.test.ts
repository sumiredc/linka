import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTab } from "./read-tab";

const TAB_ID = 7;
const ARTICLE = { url: "https://example.com/post", title: "Post", text: "Body" };

const tabsGet = vi.fn();
const isAllowedFileSchemeAccess = vi.fn();
const executeScript = vi.fn();

function openTab(url: string | undefined, fileAccess = false) {
  tabsGet.mockResolvedValue({ id: TAB_ID, url });
  isAllowedFileSchemeAccess.mockResolvedValue(fileAccess);
}

beforeEach(() => {
  vi.stubGlobal("chrome", {
    tabs: { get: tabsGet },
    extension: { isAllowedFileSchemeAccess },
    scripting: { executeScript },
  });
  executeScript.mockResolvedValue([{ frameId: 0, documentId: "d", result: ARTICLE }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("readTab", () => {
  it("returns the article the page script read", async () => {
    openTab("https://example.com/post");
    expect(await readTab(TAB_ID)).toEqual({ ok: true, page: ARTICLE });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: TAB_ID },
      files: ["content.js"],
    });
  });

  it.each([
    ["chrome://settings/", "restricted"],
    ["https://chromewebstore.google.com/detail/abc", "web-store"],
    ["file:///Users/me/notes.html", "file-access"],
  ])("returns the reason for %s without injecting", async (url, reason) => {
    openTab(url, false);
    expect(await readTab(TAB_ID)).toEqual({ ok: false, reason });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("injects into a file URL when file access is allowed", async () => {
    openTab("file:///Users/me/notes.html", true);
    expect(await readTab(TAB_ID)).toEqual({ ok: true, page: ARTICLE });
  });

  it("injects without a pre-check when the tab URL is not visible", async () => {
    openTab(undefined);
    expect(await readTab(TAB_ID)).toEqual({ ok: true, page: ARTICLE });
  });

  it("returns no-text when the page has no text", async () => {
    openTab("https://example.com/post");
    executeScript.mockResolvedValue([
      { frameId: 0, documentId: "d", result: { ...ARTICLE, text: "" } },
    ]);
    expect(await readTab(TAB_ID)).toEqual({ ok: false, reason: "no-text" });
  });

  it.each([
    ["no injection result", []],
    ["an undefined result", [{ frameId: 0, documentId: "d" }]],
    ["a result missing text", [{ frameId: 0, documentId: "d", result: { url: "u", title: "t" } }]],
  ])("returns failed for %s", async (_label, injections) => {
    openTab("https://example.com/post");
    executeScript.mockResolvedValue(injections);
    expect(await readTab(TAB_ID)).toMatchObject({ ok: false, reason: "failed" });
  });

  it("returns failed with the message when the injection throws", async () => {
    openTab("https://example.com/post");
    executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));
    expect(await readTab(TAB_ID)).toEqual({
      ok: false,
      reason: "failed",
      message: "Cannot access contents of the page",
    });
  });

  it("returns failed when the tab does not exist", async () => {
    tabsGet.mockRejectedValue(new Error("No tab with id: 7."));
    expect(await readTab(TAB_ID)).toEqual({
      ok: false,
      reason: "failed",
      message: "No tab with id: 7.",
    });
  });
});
