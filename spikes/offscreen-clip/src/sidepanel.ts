// サイドパネル。DB は持たず、offscreen document に問い合わせるだけ。
import { aiCheck } from "./ai";

type Ai = { context: string; hasLanguageModel: boolean; availability?: string; ms?: number; result?: unknown; error?: string } | null;
type Row = { url: string; title: string; chars: number; clippedAt: string; ai: string | null };

const ask = (type: string, extra: Record<string, unknown> = {}) => chrome.runtime.sendMessage({ to: "background", type, ...extra });
const $ = (s: string) => document.querySelector(s)!;

// Nano の結果を、使えるかどうかの一文にする
function verdict(ai: Ai) {
  const el = document.createElement("p");
  if (!ai) {
    el.textContent = "AI は試していません";
    return el;
  }
  const where = ai.context.includes("offscreen") ? "隠しページ" : "サイドパネル";
  const span = document.createElement("span");
  if (ai.result) {
    span.className = "ok";
    span.textContent = `${where}で使えた（${ai.ms} ms）`;
  } else {
    span.className = "ng";
    span.textContent = !ai.hasLanguageModel
      ? `${where}には Prompt API がない`
      : ai.error
        ? `${where}で失敗：${ai.error}`
        : `${where}では使えない（availability: ${ai.availability}）`;
  }
  el.append(span);
  if (ai.result) {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(ai.result, null, 2);
    el.append(pre);
  }
  return el;
}

async function refresh() {
  const r = await ask("list");
  const ul = $("#pages");
  ul.replaceChildren();
  if (!r?.ok) {
    ul.textContent = `読み込めませんでした：${r?.error}`;
    return r;
  }
  if (!r.result.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "まだありません。記事を開いて、ツールバーのアイコンを押してください。";
    ul.append(li);
  }
  for (const row of r.result as Row[]) {
    const li = document.createElement("li");
    const t = document.createElement("div");
    t.textContent = `${row.title}（${row.chars} 文字）`;
    li.append(t, verdict(row.ai ? JSON.parse(row.ai) : null));
    ul.append(li);
  }
  return r;
}

const spike = {
  list: () => ask("list"),
  aiOffscreen: () => ask("aiCheck"),
  aiHere: () => aiCheck("OPFS lets a dedicated worker write files quickly, but its handles are exclusive."),
  reset: () => ask("reset"),
};
(globalThis as unknown as { spike: typeof spike }).spike = spike;

const sample = "OPFS lets a dedicated worker write files quickly, but its handles are exclusive.";
$("#ai-offscreen").addEventListener("click", async () => {
  $("#ai").replaceChildren(document.createTextNode("試しています…"));
  const r = await spike.aiOffscreen();
  $("#ai").replaceChildren(r?.ok ? verdict(r.result) : document.createTextNode(String(r?.error)));
});
$("#ai-here").addEventListener("click", async () => {
  $("#ai").replaceChildren(document.createTextNode("試しています…"));
  $("#ai").replaceChildren(verdict(await aiCheck(sample)));
});
$("#reset").addEventListener("click", async () => {
  await spike.reset();
  refresh();
});

// 隠しページで記憶が終わったら一覧を更新する。自動確認用に通知を受けたことを記録する。
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "changed") {
    const out = $("#out");
    out.textContent += "list (changed)\n";
    refresh();
  }
  return false;
});
refresh();
