import type { Request, Response } from "./relate.worker";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

const worker = new Worker(new URL("./relate.worker.ts", import.meta.url), { type: "module" });
let nextId = 1;
const pending = new Map<number, (r: Response) => void>();
worker.onmessage = (ev: MessageEvent<Response>) => {
  pending.get(ev.data.id)?.(ev.data);
  pending.delete(ev.data.id);
};

function call(req: DistributiveOmit<Request, "id">): Promise<Response> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ ...req, id });
  });
}

// Playwright と手動確認の両方から呼べるように公開する。
const spike = {
  open: (mode: "opfs" | "memory", name = "linka-spike") => call({ op: "open", mode, name }),
  execute: (query: string, params?: Record<string, unknown>) => call({ op: "execute", query, params }),
  executeScript: (script: string) => call({ op: "executeScript", script }),
  reset: () => call({ op: "reset" }),
};
(globalThis as unknown as { spike: typeof spike }).spike = spike;

const out = document.querySelector("#out")!;
const log = (label: string, value: unknown) => {
  out.textContent = `${label}\n${JSON.stringify(value, null, 2)}\n\n${out.textContent}`;
};

document.querySelector("#open")!.addEventListener("click", async () => log("open", await spike.open("opfs")));
document.querySelector("#add")!.addEventListener("click", async () =>
  log("add", await spike.execute("CREATE (:Page {url: $url, clippedAt: $at})", { url: `https://example.com/${Date.now()}`, at: new Date().toISOString() })),
);
document.querySelector("#count")!.addEventListener("click", async () =>
  log("count", await spike.execute("MATCH (p:Page) RETURN count(p) AS pages")),
);
document.querySelector("#reset")!.addEventListener("click", async () => log("reset", await spike.reset()));
