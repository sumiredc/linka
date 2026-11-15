import { describe, expect, it } from "vitest";
import { createAskGraph } from "./ask";
import type { RuntimeMessage } from "./messages";

describe("askGraph", () => {
  it("ensures the offscreen document and sends the question to it", async () => {
    const sent: RuntimeMessage[] = [];
    const askGraph = createAskGraph(async (message) => {
      sent.push(message);
      return message.target === "background"
        ? { ok: true }
        : { ok: true, value: { kind: "failed", stage: "model", message: "x", cypher: null } };
    });
    expect(await askGraph("Which pages mention OPFS?")).toMatchObject({ ok: true });
    expect(sent).toEqual([
      { target: "background", type: "ensureOffscreen" },
      {
        target: "offscreen",
        type: "ask",
        request: { kind: "ask", question: "Which pages mention OPFS?" },
      },
    ]);
  });
});

describe("askGraph without an answer", () => {
  it("fails after its own timeout so the panel can ask again", async () => {
    const askGraph = createAskGraph(
      (message) =>
        message.target === "background" ? Promise.resolve({ ok: true }) : new Promise(() => {}),
      20,
    );
    expect(await askGraph("Which pages mention OPFS?")).toEqual({
      ok: false,
      error: { kind: "timeout", message: "no answer within 0.02 s" },
    });
  });
});
