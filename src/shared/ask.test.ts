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
