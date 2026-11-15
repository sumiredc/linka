import { describe, expect, it } from "vitest";
import type { RuntimeMessage } from "./messages";
import { createAskModel } from "./model";

describe("askModel", () => {
  it("ensures the offscreen document and sends the model request to it", async () => {
    const sent: RuntimeMessage[] = [];
    const askModel = createAskModel(async (message) => {
      sent.push(message);
      return message.target === "background"
        ? { ok: true }
        : { ok: true, value: { kind: "downloading", progress: 0 } };
    });
    expect(await askModel({ kind: "download" })).toEqual({
      ok: true,
      value: { kind: "downloading", progress: 0 },
    });
    expect(sent).toEqual([
      { target: "background", type: "ensureOffscreen" },
      { target: "offscreen", type: "model", request: { kind: "download" } },
    ]);
  });
});
