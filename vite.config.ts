import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite";

const TARGET = "es2022";
const CONTENT_ENTRY = "src/content/content-script.ts";
const CONTENT_GLOBAL = "linkaContent";

/**
 * ページに注入するスクリプトを dist/content.js に出す。executeScript で読むファイルはクラシック
 * スクリプトで import を含められないため、本体とは別に IIFE の 1 ファイルにまとめ、本体の
 * ビルドの成果物として出す（本体のビルドが dist/ を空にしても、watch でも一緒に作り直される）
 */
function contentScript(): Plugin {
  return {
    name: "linka:content-script",
    apply: "build",
    async buildStart() {
      const result = await build({
        configFile: false,
        logLevel: "warn",
        build: {
          target: TARGET,
          write: false,
          copyPublicDir: false,
          lib: { entry: CONTENT_ENTRY, formats: ["iife"], name: CONTENT_GLOBAL },
          rolldownOptions: {
            // 注入の結果はファイルの最後に評価した式の値になる
            output: { postFooter: `${CONTENT_GLOBAL}.readPage();` },
          },
        },
      });
      const outputs = Array.isArray(result) ? result : [result];
      const chunk = outputs
        .flatMap((o) => ("output" in o ? o.output : []))
        .find((file) => file.type === "chunk");
      if (chunk === undefined) throw new Error("The content script build produced no chunk");
      for (const id of chunk.moduleIds) {
        if (!id.includes("/node_modules/")) this.addWatchFile(id);
      }
      this.emitFile({ type: "asset", fileName: "content.js", source: chunk.code });
    },
  };
}

export default defineConfig({
  // 拡張機能のページは chrome-extension://<id>/ 直下から読まれるので相対パスで出す
  base: "./",
  plugins: [react(), contentScript()],
  build: {
    target: TARGET,
    // Chrome 138 以上は modulepreload に対応しているので polyfill は要らない
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        popup: "popup.html",
        sidepanel: "sidepanel.html",
        offscreen: "offscreen.html",
        background: "src/background/index.ts",
      },
      output: {
        // manifest.json から固定の名前で参照するため、service worker だけハッシュを付けない
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
  worker: { format: "es" },
});
