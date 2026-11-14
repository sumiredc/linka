// Node の型除去で scripts/*.ts を直接動かすための resolve フック。使い方: node --import ./scripts/ts-resolve.mjs <file.ts>
// src/ は Vite（moduleResolution: bundler）に合わせて拡張子を書かずに import しているが、
// Node の ESM は拡張子を補わないので、見つからない相対 import にだけ `.ts` を足して引き直す。
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const relative = specifier.startsWith("./") || specifier.startsWith("../");
      if (!relative || error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
