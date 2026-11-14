// DB の唯一の持ち主。Relate Wasm を dedicated worker で開き、popup・sidepanel からの依頼を順に処理する。
import type { Request, Response } from "./relate.worker";
import { aiCheck } from "./ai";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

const worker = new Worker(new URL("./relate.worker.ts", import.meta.url), { type: "module" });
let nextId = 1;
const pending = new Map<number, (r: Response) => void>();
worker.onmessage = (ev: MessageEvent<Response>) => {
  pending.get(ev.data.id)?.(ev.data);
  pending.delete(ev.data.id);
};
function db(req: DistributiveOmit<Request, "id">): Promise<Response> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ ...req, id });
  });
}
async function exec(query: string, params?: Record<string, unknown>) {
  const r = await db({ op: "execute", query, params });
  if (!r.ok) throw new Error(r.error.message);
  const env = r.result as { error: unknown; rows: unknown[] };
  if (env.error) throw new Error(JSON.stringify(env.error));
  return env.rows;
}

const opened = db({ op: "open", mode: "opfs", name: "linka-offscreen-spike" });

type Page = { url: string; title: string; text: string };

async function clip(page: Page, delayMs: number, useAi: boolean) {
  const start = performance.now();
  // 抽出の代わりに待つ（popup を閉じても処理が続くかを確かめるため）
  await new Promise((r) => setTimeout(r, delayMs));
  const ai = useAi ? await aiCheck(page.text.slice(0, 1500)) : null;
  await exec(
    "MERGE (p:Page {url: $url}) SET p.title = $title, p.chars = $chars, p.clippedAt = $at, p.ai = $ai",
    { url: page.url, title: page.title, chars: page.text.length, at: new Date().toISOString(), ai: ai ? JSON.stringify(ai) : null },
  );
  chrome.runtime.sendMessage({ to: "all", type: "changed" }).catch(() => {});
  return { ms: Math.round(performance.now() - start), ai };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.to !== "offscreen") return false;
  (async () => {
    const o = await opened;
    if (!o.ok) throw new Error(`open failed: ${o.error.message}`);
    switch (msg.type) {
      case "clip":
        return clip(msg.page, msg.delayMs ?? 0, !!msg.useAi);
      case "list":
        return exec("MATCH (p:Page) RETURN p.url AS url, p.title AS title, p.chars AS chars, p.clippedAt AS clippedAt, p.ai AS ai ORDER BY p.clippedAt DESC");
      case "aiCheck":
        return aiCheck(msg.text ?? "OPFS lets a dedicated worker write files quickly, but its handles are exclusive.");
      case "reset":
        await db({ op: "reset" });
        return null;
      default:
        throw new Error(`unknown type: ${msg.type}`);
    }
  })().then(
    (result) => sendResponse({ ok: true, result }),
    (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
  );
  return true;
});
