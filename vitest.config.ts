import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // 本体のテストは最初の実装の issue から入る。それまでは 0 件でも通す
    passWithNoTests: true,
  },
});
