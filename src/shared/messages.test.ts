import { describe, expect, it } from "vitest";
import {
  changedGraph,
  classifyExecute,
  classifyScript,
  isFromExtensionPage,
  isMessageFor,
} from "./messages";

const envelope = (fields: Record<string, unknown>) =>
  JSON.stringify({ columns: [], rows: [], stats: {}, error: null, ...fields });

describe("classifyExecute", () => {
  it("treats an envelope without an error as a success with its columns, rows and stats", () => {
    expect(
      classifyExecute(envelope({ columns: ["n"], rows: [{ n: 1 }], stats: { nodes_created: 0 } })),
    ).toEqual({
      ok: true,
      value: { columns: ["n"], rows: [{ n: 1 }], stats: { nodes_created: 0 } },
    });
  });

  it("treats an envelope with an error as a Relate failure carrying the message", () => {
    expect(classifyExecute(envelope({ error: "syntax error" }))).toEqual({
      ok: false,
      error: { kind: "relate", message: "syntax error" },
    });
  });
});

describe("classifyScript", () => {
  it("treats a script whose statements all succeeded as a success with one result each", () => {
    const result = classifyScript([envelope({ rows: [{ a: 1 }] }), envelope({ rows: [{ b: 2 }] })]);
    expect(result).toMatchObject({ ok: true, value: [{ rows: [{ a: 1 }] }, { rows: [{ b: 2 }] }] });
  });

  it("treats a script with a failed statement as a failure naming that statement", () => {
    expect(classifyScript([envelope({}), envelope({ error: "bad" })])).toEqual({
      ok: false,
      error: { kind: "relate", message: "statement 2: bad" },
    });
  });
});

describe("changedGraph", () => {
  it("is true when any counter in the stats is positive", () => {
    expect(changedGraph([envelope({ stats: { nodes_created: 0, properties_set: 2 } })])).toBe(true);
  });

  it("is false when every counter is zero", () => {
    expect(changedGraph([envelope({ stats: { nodes_created: 0 } })])).toBe(false);
  });

  it("counts writes made by earlier statements of a script that then failed", () => {
    expect(
      changedGraph([envelope({ stats: { nodes_created: 1 } }), envelope({ error: "bad" })]),
    ).toBe(true);
  });
});

describe("isFromExtensionPage", () => {
  const root = "chrome-extension://abc/";

  it("accepts a page of this extension, even one opened in a tab", () => {
    expect(isFromExtensionPage({ url: "chrome-extension://abc/dev.html" }, root)).toBe(true);
  });

  it("rejects a content script, which reports the URL of the page it runs in", () => {
    expect(isFromExtensionPage({ url: "https://example.com/" }, root)).toBe(false);
  });

  it("rejects a page of another extension", () => {
    expect(isFromExtensionPage({ url: "chrome-extension://abcd/x.html" }, root)).toBe(false);
  });

  it("rejects a sender without a URL", () => {
    expect(isFromExtensionPage({}, root)).toBe(false);
  });
});

describe("isMessageFor", () => {
  it("accepts a message addressed to the target", () => {
    expect(isMessageFor({ target: "offscreen", type: "db" }, "offscreen")).toBe(true);
  });

  it("rejects a message addressed to another target", () => {
    expect(isMessageFor({ target: "background", type: "ensureOffscreen" }, "offscreen")).toBe(
      false,
    );
  });
});
