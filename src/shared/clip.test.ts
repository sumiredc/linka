import { describe, expect, it } from "vitest";
import { createAskClip } from "./clip";
import type { RuntimeMessage } from "./messages";

describe("askClip", () => {
  it("ensures the offscreen document and sends the clip request to it", async () => {
    const sent: RuntimeMessage[] = [];
    const askClip = createAskClip(async (message) => {
      sent.push(message);
      return message.target === "background" ? { ok: true } : { ok: true, value: null };
    });
    expect(await askClip({ kind: "isClipped", tabUrl: "https://example.com/" })).toEqual({
      ok: true,
      value: null,
    });
    expect(sent).toEqual([
      { target: "background", type: "ensureOffscreen" },
      {
        target: "offscreen",
        type: "clip",
        request: { kind: "isClipped", tabUrl: "https://example.com/" },
      },
    ]);
  });
});
