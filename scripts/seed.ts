// seed/demo.json から seed/demo.cypher を作る。使い方: npm run seed
import { DemoDataSchema } from "../src/shared/seed-data";
import { buildSeedScript } from "./seed-script";

// @types/node は入れていないので、使う形だけを型にする
interface NodeBuiltins {
  getBuiltinModule(id: "node:fs"): {
    readFileSync(path: URL, encoding: "utf8"): string;
    writeFileSync(path: URL, data: string): void;
  };
}

const { process } = globalThis as unknown as { process: NodeBuiltins };
const fs = process.getBuiltinModule("node:fs");
const input = new URL("../seed/demo.json", import.meta.url);
const output = new URL("../seed/demo.cypher", import.meta.url);

const demo = DemoDataSchema.parse(JSON.parse(fs.readFileSync(input, "utf8")));
fs.writeFileSync(output, buildSeedScript(demo));
console.log(`Wrote ${output.pathname} (${demo.clips.length} pages)`);
