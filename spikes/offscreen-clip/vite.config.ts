import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: { input: ["popup.html", "sidepanel.html", "offscreen.html"] },
  },
  worker: { format: "es" },
});
