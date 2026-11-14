// dist/ の拡張機能を Chromium に読み込み、offscreen document が DB を持つ構成を確かめる。
// 使い方: npm run build && npm run check
import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extPath = resolve("dist");
const userDataDir = mkdtempSync(join(tmpdir(), "linka-offscreen-"));
const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass === null ? "INFO" : pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent("serviceworker");
  return { ctx, sw, id: new URL(sw.url()).host };
}

async function openPanel(ctx, id) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.waitForFunction(() => "spike" in globalThis);
  return page;
}

const call = (page, fn) => page.evaluate((fn) => globalThis.spike[fn](), fn);
const offscreenCount = (sw) =>
  sw.evaluate(() => chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }).then((c) => c.length));

try {
  let { ctx, sw, id } = await launch();
  const a = await openPanel(ctx, id);
  let r = await call(a, "reset");
  record("サイドパネルから offscreen の DB に届く", r?.ok === true, r?.ok ? "" : JSON.stringify(r));
  record("offscreen document が 1 つ作られる", (await offscreenCount(sw)) === 1);

  // popup を開いて記憶を依頼し、処理中（4 秒待ち）に popup を閉じる
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html?test=1`);
  await sleep(500);
  await popup.close();
  await sleep(6000);
  r = await call(a, "list");
  record("popup を閉じても記憶が最後まで終わる", r.ok && r.result.length === 1 && r.result[0].url === "https://example.com/test", JSON.stringify(r.result ?? r));
  record("記憶の完了がサイドパネルに通知される", (await a.textContent("#out")).includes("list (changed)"));

  // サイドパネルを 2 つ同時に開いても衝突しない
  const b = await openPanel(ctx, id);
  const [ra, rb] = await Promise.all([call(a, "list"), call(b, "list")]);
  record("2 つのサイドパネルから同時に問い合わせられる（ロックなし）", ra.ok && rb.ok && rb.result.length === 1);

  // Prompt API がどこで使えるか（Playwright の Chromium にはモデルが無い想定なので情報として出す）
  r = await call(a, "aiOffscreen");
  record("Prompt API（offscreen）", null, JSON.stringify(r.result ?? r));
  r = await call(a, "aiHere");
  record("Prompt API（サイドパネル）", null, JSON.stringify(r));

  // しばらく放置しても offscreen document が残るか
  await a.close();
  await b.close();
  await sleep(35000);
  record("35 秒放置しても offscreen document が残る", (await offscreenCount(sw)) === 1);
  await ctx.close();

  // ブラウザを再起動しても残る
  ({ ctx, sw, id } = await launch());
  const c = await openPanel(ctx, id);
  r = await call(c, "list");
  record("ブラウザを再起動してもデータが残る", r.ok && r.result.length === 1, JSON.stringify(r.result ?? r));
  record("ページエラーが無い", a.errors.length + c.errors.length === 0, [...a.errors, ...c.errors].join(" | "));
  await ctx.close();
} catch (e) {
  record("スクリプトが最後まで動く", false, e.message);
} finally {
  rmSync(userDataDir, { recursive: true, force: true });
}

const counted = results.filter((r) => r.pass !== null);
const failed = counted.filter((r) => !r.pass).length;
console.log(`\n${counted.length - failed}/${counted.length} passed`);
process.exit(failed ? 1 : 0);
