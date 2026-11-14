import { toCypherScript } from "../src/shared/cypher";
import { buildAddressesStatement, buildClipStatements } from "../src/shared/graph-statements";
import { type DemoData, resolveAddresses } from "../src/shared/seed-data";

/** デモデータから `seed/demo.cypher` の中身を作る。同じ入力からは同じ文字列が出る。 */
export function buildSeedScript(demo: DemoData): string {
  const statements = demo.clips.flatMap(buildClipStatements);
  if (demo.addresses.length > 0) {
    statements.push(buildAddressesStatement(resolveAddresses(demo.clips, demo.addresses)));
  }
  return toCypherScript(statements);
}
