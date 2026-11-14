// dist/ の拡張機能を Chromium に読み込み、Relate Wasm + OPFS の動作を確かめる。
// 使い方: npm run build && npm run check
import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extPath = resolve("dist");
const userDataDir = mkdtempSync(join(tmpdir(), "linka-spike-"));
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

async function launch() {
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent("serviceworker");
  const id = new URL(sw.url()).host;
  return { ctx, id };
}

async function openPanel(ctx, id) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.waitForFunction(() => "spike" in globalThis);
  page.errors = errors;
  return page;
}

const call = (page, fn, ...args) =>
  page.evaluate(([fn, args]) => globalThis.spike[fn](...args), [fn, args]);

const rows = (res) => res.result.rows;

try {
  // 1. 初回: OPFS を開いて書き込む
  let { ctx, id } = await launch();
  let a = await openPanel(ctx, id);
  let r = await call(a, "open", "opfs");
  record("worker で opfs://linka-spike を開ける", r.ok, r.ok ? `${r.ms.toFixed(0)} ms (wasm 初期化込み)` : JSON.stringify(r.error));
  if (!r.ok) throw new Error("open failed; later checks are meaningless");

  await call(a, "reset");
  r = await call(a, "execute", "MERGE (p:Page {url: $url}) SET p.title = $title RETURN p.url AS url", {
    url: "https://example.com/a",
    title: "A",
  });
  record("パラメータ付き MERGE を実行できる", r.ok && !r.result.error, JSON.stringify(r.result.error ?? rows(r)));

  await call(a, "execute", "MERGE (p:Page {url: $url}) SET p.title = $title", { url: "https://example.com/a", title: "A2" });
  r = await call(a, "execute", "MATCH (p:Page) RETURN count(p) AS n, collect(p.title) AS titles");
  record("同じキーの MERGE は 1 ノードにまとまる", rows(r)[0].n === 1 && rows(r)[0].titles[0] === "A2", JSON.stringify(rows(r)));

  r = await call(
    a,
    "executeScript",
    `MERGE (b:Page {url: 'https://example.com/b'})
     MERGE (c:Concept {key: 'webassembly'}) SET c.name = 'WebAssembly';
     MATCH (a:Page {url: 'https://example.com/a'}), (c:Concept {key: 'webassembly'}) MERGE (a)-[:MENTIONS]->(c);
     MATCH (b:Page {url: 'https://example.com/b'}), (c:Concept {key: 'webassembly'}) MERGE (b)-[:MENTIONS]->(c);`,
  );
  record("executeScript で複数文を流せる", r.ok && r.result.every((e) => !e.error), `${r.result.length} statements`);

  r = await call(a, "execute", "MATCH (x:Page)-[:MENTIONS]->(:Concept)<-[:MENTIONS]-(y:Page) WHERE x.url < y.url RETURN x.url AS x, y.url AS y");
  record("Concept 経由でページ同士をたどれる", rows(r).length === 1, JSON.stringify(rows(r)));

  r = await call(a, "execute", "MATCH p = (x:Page)-[*1..3]-(y:Page) WHERE x <> y RETURN count(p) AS n");
  record("可変長パスを実行できる", r.ok && !r.result.error, JSON.stringify(r.result.error ?? rows(r)));

  r = await call(a, "execute", "MATCH (p:Page RETURN p");
  record("文法エラーは例外でなく error に返る", r.ok && !!r.result.error, JSON.stringify(r.result.error).slice(0, 200));

  r = await call(a, "execute", "EXPLAIN MATCH (p:Page) RETURN p");
  record("EXPLAIN を実行できる", r.ok && !r.result.error, r.result.plan ? "plan あり" : JSON.stringify(r.result).slice(0, 200));

  // 2. 同時に 2 つ目のページから開くとロックされる
  const b = await openPanel(ctx, id);
  r = await call(b, "open", "opfs");
  record("2 つ目のページからはロックで開けない", !r.ok && /storage locked/.test(r.error.message), r.ok ? "開けてしまった" : r.error.message);
  r = await call(b, "open", "memory");
  record("ロック時はメモリ上の DB で動かせる", r.ok);
  await b.close();

  // 3. 1 つ目のページを閉じたあと、別ページで開き直す
  await a.close();
  a = await openPanel(ctx, id);
  r = await call(a, "open", "opfs");
  record("ページを閉じるとロックが外れ、開き直せる", r.ok, r.ok ? "" : r.error.message);
  r = await call(a, "execute", "MATCH (p:Page) RETURN count(p) AS n");
  record("ページを開き直してもデータが残る", r.ok && rows(r)[0].n === 2, JSON.stringify(rows(r)));
  const panelErrors = a.errors;
  await ctx.close();

  // 4. ブラウザを再起動してもデータが残る
  ({ ctx, id } = await launch());
  a = await openPanel(ctx, id);
  r = await call(a, "open", "opfs");
  r = await call(a, "execute", "MATCH (p:Page)-[m:MENTIONS]->(c:Concept) RETURN count(m) AS n");
  record("ブラウザを再起動してもデータが残る", r.ok && rows(r)[0].n === 2, JSON.stringify(r.ok ? rows(r) : r.error));

  // 5. デモデータ規模の投入時間（Page 15・Concept 60・Claim 90 程度を想定して多めに）
  await call(a, "reset");
  const stmts = [];
  for (let i = 0; i < 30; i++) {
    stmts.push(`MERGE (p:Page {url: 'https://example.com/p${i}'}) SET p.title = 'Page ${i}'`);
    for (let j = 0; j < 8; j++) {
      const k = (i * 3 + j) % 120;
      stmts.push(
        `MATCH (p:Page {url: 'https://example.com/p${i}'}) MERGE (c:Concept {key: 'c${k}'}) MERGE (p)-[:MENTIONS]->(c)`,
      );
      stmts.push(
        `MATCH (p:Page {url: 'https://example.com/p${i}'}) MERGE (cl:Claim {id: 'p${i}-${j}'}) SET cl.type = '${j % 2 ? "concern" : "solution"}' MERGE (p)-[:ASSERTS]->(cl)`,
      );
    }
  }
  r = await call(a, "executeScript", stmts.join(";\n") + ";");
  const errs = r.ok ? r.result.filter((e) => e.error) : [];
  record(`デモ規模の投入（${stmts.length} 文）`, r.ok && errs.length === 0, `${r.ms.toFixed(0)} ms${errs.length ? ` / error: ${JSON.stringify(errs[0].error)}` : ""}`);
  r = await call(a, "execute", "MATCH (n) RETURN count(n) AS nodes");
  console.log("       nodes:", JSON.stringify(rows(r)));

  record("パネルにコンソールエラーが無い", panelErrors.length === 0 && a.errors.length === 0, [...panelErrors, ...a.errors].join(" | "));
  await ctx.close();
} catch (e) {
  record("スクリプトが最後まで動く", false, e.message);
} finally {
  rmSync(userDataDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
