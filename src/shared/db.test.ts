import { describe, expect, it } from "vitest";
import { createAskDb } from "./db";
import type { RuntimeMessage } from "./messages";

const ok = { ok: true, value: { columns: [], rows: [], stats: {} } };
const noReceiver = new Error("Could not establish connection. Receiving end does not exist.");

// offscreen document への送信に、順に answers の結果を返す
function fakeRuntime(answers: (unknown | Error)[]) {
  const sent: RuntimeMessage[] = [];
  const sendMessage = async (message: RuntimeMessage) => {
    sent.push(message);
    if (message.target === "background") return { ok: true };
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const dbSends = () => sent.filter((m) => m.target === "offscreen").length;
  const ensures = () => sent.filter((m) => m.target === "background").length;
  return { sendMessage, dbSends, ensures };
}

describe("askDb", () => {
  it("asks the service worker to ensure the offscreen document before sending", async () => {
    const runtime = fakeRuntime([ok]);
    await createAskDb(runtime.sendMessage)({ kind: "status" });
    expect(runtime.ensures()).toBe(1);
  });

  it("ensures again and resends once when the offscreen document was not there", async () => {
    const runtime = fakeRuntime([noReceiver, ok]);
    const response = await createAskDb(runtime.sendMessage)({ kind: "execute", query: "RETURN 1" });
    expect(response).toEqual(ok);
    expect([runtime.ensures(), runtime.dbSends()]).toEqual([2, 2]);
  });

  it("gives up as unreachable after one resend", async () => {
    const runtime = fakeRuntime([noReceiver, noReceiver, ok]);
    const response = await createAskDb(runtime.sendMessage)({ kind: "execute", query: "RETURN 1" });
    expect(response).toMatchObject({ ok: false, error: { kind: "unreachable" } });
    expect(runtime.dbSends()).toBe(2);
  });

  it("does not resend a request that may have reached the offscreen document", async () => {
    const closed = new Error("The message port closed before a response was received.");
    const runtime = fakeRuntime([closed, ok]);
    const response = await createAskDb(runtime.sendMessage)({
      kind: "execute",
      query: "CREATE ()",
    });
    expect(response).toMatchObject({ ok: false, error: { kind: "unreachable" } });
    expect(runtime.dbSends()).toBe(1);
  });

  it("does not send the request when the offscreen document cannot be ensured", async () => {
    const sent: RuntimeMessage[] = [];
    const askDb = createAskDb(async (message) => {
      sent.push(message);
      return { ok: false, error: { kind: "unreachable", message: "blocked" } };
    });
    expect(await askDb({ kind: "status" })).toMatchObject({ ok: false });
    expect(sent.map((m) => m.target)).toEqual(["background"]);
  });
});
