// グラフ全体を、Relate CLI でもそのまま読める Cypher スクリプト（`linka-export.cypher`）にする（PRD UC4）。
// 抽出結果からではなく DB にある値から作るので、選択範囲の Claim の由来や、ページから外れた Concept も残る
import { type CypherStatement, type CypherValue, toCypherScript } from "./cypher";

export const EXPORT_FILE_NAME = "linka-export.cypher";

/** PRD §5 のノードと、MERGE のキーにするプロパティ */
const NODES = [
  { label: "Page", key: "url" },
  { label: "Person", key: "name" },
  { label: "Concept", key: "key" },
  { label: "Claim", key: "id" },
] as const;

type NodeLabel = (typeof NODES)[number]["label"];

const KEY_OF: Record<NodeLabel, string> = Object.fromEntries(
  NODES.map(({ label, key }) => [label, key]),
) as Record<NodeLabel, string>;

/** PRD §5 の関係。両端のラベルを決めて読み、決めた両端で張り直す */
const RELATIONSHIPS = [
  { type: "AUTHORED_BY", from: "Page", to: "Person" },
  { type: "MENTIONS", from: "Page", to: "Concept" },
  { type: "ASSERTS", from: "Page", to: "Claim" },
  { type: "ABOUT", from: "Claim", to: "Concept" },
  { type: "ADDRESSES", from: "Claim", to: "Claim" },
  { type: "RELATED_TO", from: "Concept", to: "Concept" },
] as const satisfies readonly { type: string; from: NodeLabel; to: NodeLabel }[];

/** 1 文に入れる行の数。大きなグラフでも 1 文が長くなりすぎないように分ける */
export const ROWS_PER_STATEMENT = 100;

/**
 * グラフを読む文。結果は文ごとに 1 つ、ノード（NODES の順）、関係（RELATIONSHIPS の順）の順に返る。
 * 1 回の executeScript で流すので、途中に記憶の書き込みが挟まらない。読むだけでグラフは変えない
 */
export const EXPORT_READ_SCRIPT = [
  ...NODES.map(
    ({ label, key }) =>
      `MATCH (n:${label}) WHERE n.${key} IS NOT NULL RETURN properties(n) AS props ORDER BY n.${key};`,
  ),
  ...RELATIONSHIPS.map(({ type, from, to }) => {
    const [fromKey, toKey] = [KEY_OF[from], KEY_OF[to]];
    return [
      `MATCH (a:${from})-[:${type}]->(b:${to})`,
      `WHERE a.${fromKey} IS NOT NULL AND b.${toKey} IS NOT NULL`,
      `RETURN DISTINCT a.${fromKey} AS from, b.${toKey} AS to ORDER BY from, to;`,
    ].join(" ");
  }),
].join("\n");

type Rows = readonly Record<string, unknown>[];

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += ROWS_PER_STATEMENT) {
    result.push(items.slice(start, start + ROWS_PER_STATEMENT));
  }
  return result;
}

/** 書き出すグラフの件数。ファイルの先頭にも書く */
export type ExportCounts = { nodes: Record<NodeLabel, number>; relationships: number };

export type GraphExport = { script: string; counts: ExportCounts };

/**
 * 書き出しの最初の文。前の linka.rl に流しても、そのあと消したページが残らないよう、中身を置き換える。
 * 消すコマンドを OS ごとに案内せずに済む（PRD UC4）
 */
export const CLEAR_STORE_STATEMENT: CypherStatement = {
  query: "MATCH (n) DETACH DELETE n",
  params: {},
};

/**
 * {@link EXPORT_READ_SCRIPT} の結果を、グラフを再現するスクリプトにする。
 * どのストアに流しても、中身が書き出したときのグラフと同じになる
 */
export function buildGraphExport(results: readonly { rows: Rows }[]): GraphExport {
  const expected = NODES.length + RELATIONSHIPS.length;
  if (results.length !== expected) {
    throw new Error(`Expected ${expected} results to export, got ${results.length}`);
  }
  const statements: CypherStatement[] = [CLEAR_STORE_STATEMENT];
  const nodes = {} as Record<NodeLabel, number>;
  NODES.forEach(({ label, key }, index) => {
    // 値は Relate が JSON で返したものなので、そのまま Cypher のリテラルにできる
    const rows = (results[index]?.rows ?? []).map((row) => row.props as CypherValue);
    nodes[label] = rows.length;
    for (const chunk of chunks(rows)) {
      statements.push({
        query: `UNWIND $rows AS row\nMERGE (n:${label} {${key}: row.${key}})\nSET n += row`,
        params: { rows: chunk },
      });
    }
  });
  let relationships = 0;
  RELATIONSHIPS.forEach(({ type, from, to }, index) => {
    const links = (results[NODES.length + index]?.rows ?? []).map(
      (row) => ({ from: row.from, to: row.to }) as CypherValue,
    );
    relationships += links.length;
    for (const chunk of chunks(links)) {
      statements.push({
        query: [
          "UNWIND $links AS link",
          `MATCH (a:${from} {${KEY_OF[from]}: link.from}), (b:${to} {${KEY_OF[to]}: link.to})`,
          `MERGE (a)-[:${type}]->(b)`,
        ].join("\n"),
        params: { links: chunk },
      });
    }
  });
  const counts = { nodes, relationships };
  return { script: header(counts) + toCypherScript(statements), counts };
}

function header({ nodes, relationships }: ExportCounts): string {
  const summary = NODES.map(({ label }) => `${nodes[label]} ${label}`).join(", ");
  return [
    `// Linka graph export: ${summary}, ${relationships} relationships.`,
    `// Loading it replaces everything in the store: relate query -d linka.rl < ${EXPORT_FILE_NAME}`,
    "",
  ].join("\n");
}
