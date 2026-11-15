import { describe, expect, it, vi } from "vitest";
import type { ClippedPage } from "../shared/clip-status";
import { type DbResponse, failure } from "../shared/messages";
import {
  type Badge,
  badgeOf,
  CLIPPED_BADGE,
  canBeClipped,
  createBadgeRefresher,
  NO_BADGE,
  refreshesOnUpdate,
  tabsShowing,
} from "./badge";

const ROOT = "chrome-extension://abc/";
const SAMPLE_TAB = `${ROOT}samples/sqlite-worker-owner.html`;
const SAMPLE_PAGE =
  "https://github.com/sumiredc/linka/blob/main/public/samples/sqlite-worker-owner.html";

const clipped: DbResponse<ClippedPage | null> = {
  ok: true,
  value: { url: "https://example.com/a", clippedAt: "2026-11-15T00:00:00.000Z" },
};
const notClipped: DbResponse<ClippedPage | null> = { ok: true, value: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("canBeClipped", () => {
  it("asks about web pages and file pages", () => {
    expect(canBeClipped("https://example.com/a", ROOT)).toBe(true);
    expect(canBeClipped("file:///Users/me/a.html", ROOT)).toBe(true);
  });

  it("asks about the bundled sample pages", () => {
    expect(canBeClipped(SAMPLE_TAB, ROOT)).toBe(true);
  });

  it("does not ask about pages that cannot be clipped", () => {
    expect(canBeClipped("chrome://newtab/", ROOT)).toBe(false);
    expect(canBeClipped(`${ROOT}sidepanel.html`, ROOT)).toBe(false);
    expect(canBeClipped("https://chromewebstore.google.com/detail/x", ROOT)).toBe(false);
    expect(canBeClipped("", ROOT)).toBe(false);
  });
});

describe("refreshesOnUpdate", () => {
  it("refreshes when the tab moves to another URL", () => {
    expect(refreshesOnUpdate({ url: "https://example.com/b" })).toBe(true);
  });

  it("refreshes when a page finishes loading, as a reload clears the badge without a URL change", () => {
    expect(refreshesOnUpdate({ status: "complete" })).toBe(true);
  });

  it("does not refresh on other updates", () => {
    expect(refreshesOnUpdate({ status: "loading" })).toBe(false);
    expect(refreshesOnUpdate({})).toBe(false);
  });
});

describe("badgeOf", () => {
  it("marks a clipped page", () => {
    expect(badgeOf(clipped)).toEqual(CLIPPED_BADGE);
  });

  it("clears the mark on a page that is not clipped", () => {
    expect(badgeOf(notClipped)).toEqual(NO_BADGE);
  });

  it("leaves the mark as it is when the answer failed", () => {
    expect(badgeOf(failure("unreachable", "no offscreen document"))).toBeNull();
  });
});

describe("tabsShowing", () => {
  it("picks the tabs whose URL is the clipped page, after normalizing the URL", () => {
    const tabs = [
      { id: 1, url: "https://example.com/a?utm_source=x#top" },
      { id: 2, url: "https://example.com/b" },
      { id: 3, url: "https://example.com/a" },
      { id: 4 },
      { url: "https://example.com/a" },
    ];
    expect(tabsShowing(tabs, "https://example.com/a", ROOT).map((tab) => tab.id)).toEqual([1, 3]);
  });

  it("matches a sample page by its repository URL", () => {
    expect(tabsShowing([{ id: 5, url: SAMPLE_TAB }], SAMPLE_PAGE, ROOT)).toEqual([
      { id: 5, url: SAMPLE_TAB },
    ]);
  });
});

describe("createBadgeRefresher", () => {
  function setup(isClipped: (url: string) => Promise<DbResponse<ClippedPage | null>>) {
    const badges: [number, Badge][] = [];
    const ask = vi.fn(isClipped);
    const refresh = createBadgeRefresher({
      extensionRoot: ROOT,
      isClipped: ask,
      setBadge: async (tabId, badge) => {
        badges.push([tabId, badge]);
      },
    });
    return { refresh, ask, badges };
  }

  it("marks the tab when its page is clipped", async () => {
    const { refresh, badges } = setup(async () => clipped);
    await refresh(1, "https://example.com/a");
    expect(badges).toEqual([[1, CLIPPED_BADGE]]);
  });

  it("clears the mark of a tab whose page cannot be clipped without asking", async () => {
    const { refresh, ask, badges } = setup(async () => clipped);
    await refresh(1, "chrome://settings/");
    expect(ask).not.toHaveBeenCalled();
    expect(badges).toEqual([[1, NO_BADGE]]);
  });

  it("clears the mark of a tab whose URL Linka cannot see", async () => {
    const { refresh, ask, badges } = setup(async () => clipped);
    await refresh(1, undefined);
    expect(ask).not.toHaveBeenCalled();
    expect(badges).toEqual([[1, NO_BADGE]]);
  });

  it("keeps the mark when the answer failed", async () => {
    const { refresh, badges } = setup(async () => failure("unreachable", "x"));
    await refresh(1, "https://example.com/a");
    expect(badges).toEqual([]);
  });

  it("uses only the latest URL of a tab when the answers come back out of order", async () => {
    const first = deferred<DbResponse<ClippedPage | null>>();
    const { refresh, badges } = setup((url) =>
      url.endsWith("/a") ? first.promise : Promise.resolve(notClipped),
    );
    const old = refresh(1, "https://example.com/a");
    await refresh(1, "https://example.com/b");
    first.resolve(clipped);
    await old;
    expect(badges).toEqual([[1, NO_BADGE]]);
  });

  it("does not let one tab's newer request drop another tab's answer", async () => {
    const first = deferred<DbResponse<ClippedPage | null>>();
    const { refresh, badges } = setup((url) =>
      url.endsWith("/a") ? first.promise : Promise.resolve(notClipped),
    );
    const one = refresh(1, "https://example.com/a");
    await refresh(2, "https://example.com/b");
    first.resolve(clipped);
    await one;
    expect(badges).toEqual([
      [2, NO_BADGE],
      [1, CLIPPED_BADGE],
    ]);
  });
});
