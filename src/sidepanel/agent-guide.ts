// 「Use with your agent」で見せるコマンド（PRD UC4）。Relate CLI 1.0.1 の `relate query` と `relate serve` の形
import { EXPORT_FILE_NAME } from "../shared/graph-export";

// エージェントの設定には絶対パスで書く（PRD UC4）。シェルが $HOME を展開するので、登録されるのは絶対パスになる
const STORE = '"$HOME/linka/linka.rl"';

/**
 * 前の linka.rl に読み込むと、そのあと消したページが残るので、消してから作る。
 * `query` を省くと文を実行せずヘルプを出して 0 で終わる。stdout は文ごとの所要時間なので捨てる
 */
export const BUILD_STORE_COMMAND = [
  'mkdir -p "$HOME/linka"',
  `rm -f ${STORE}`,
  `DO_NOT_TRACK=1 relate query -d ${STORE} < "$HOME/Downloads/${EXPORT_FILE_NAME}" > /dev/null`,
].join("\n");

// --read-only を付けると、エージェントに見えるのは read_cypher と get_schema だけになり、ファイルも書き換わらない
export const CLAUDE_CODE_COMMAND = `claude mcp add linka -e DO_NOT_TRACK=1 -- relate serve --database ${STORE} --read-only --mcp stdio`;

/** ~/.codex/config.toml に [mcp_servers.linka] を書き足す。ヒアドキュメントの中でも $HOME は展開される */
export const CODEX_COMMAND = [
  "cat >> ~/.codex/config.toml <<EOF",
  "",
  "[mcp_servers.linka]",
  'command = "relate"',
  'args = ["serve", "--database", "$HOME/linka/linka.rl", "--read-only", "--mcp", "stdio"]',
  'env = { DO_NOT_TRACK = "1" }',
  "EOF",
].join("\n");

export const AGENT_PROMPT =
  "Use the linka graph to suggest an implementation plan based on the concerns and solutions I researched.";

// --read-only を付けないと、読むだけでもファイルが書き換わる
export const DIRECT_QUERY_COMMAND = `DO_NOT_TRACK=1 relate query --read-only -d ${STORE} "MATCH (p:Page) RETURN p.title AS title"`;
