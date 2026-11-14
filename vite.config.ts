import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // 拡張機能のページは chrome-extension://<id>/ 直下から読まれるので相対パスで出す
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    // Chrome 138 以上は modulepreload に対応しているので polyfill は要らない
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        popup: "popup.html",
        sidepanel: "sidepanel.html",
        offscreen: "offscreen.html",
        dev: "dev.html",
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
