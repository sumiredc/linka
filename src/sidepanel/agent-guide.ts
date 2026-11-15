// 「Use with your agent」で見せるコマンド（PRD UC4）。Relate CLI 1.0.1 の `relate query` と `relate serve` の形
import { EXPORT_FILE_NAME } from "../shared/graph-export";

// エージェントの設定には絶対パスで書く（PRD UC4）。シェルが $HOME を展開するので、登録されるのは絶対パスになる
const STORE = '"$HOME/linka/linka.rl"';

/** Chrome は同じ名前があると「linka-export (1).cypher」で保存するので、名前ではなく一番新しいものを読む */
const EXPORT_GLOB = `"$HOME"/Downloads/${EXPORT_FILE_NAME.replace(".cypher", "*.cypher")}`;

/**
 * 前の linka.rl に読み込むと、そのあと消したページが残るので、消してから作る。
 * 書き出したファイルが見つからなければ、前の linka.rl を消す前に止める（&& でつなぐ）。
 * `query` を省くと文を実行せずヘルプを出して 0 で終わる。stdout は文ごとの所要時間なので捨てる
 */
export const BUILD_STORE_COMMAND = [
  `export_file=$(ls -t ${EXPORT_GLOB} | head -n 1) &&`,
  '  [ -n "$export_file" ] && echo "Loading $export_file" &&',
  '  mkdir -p "$HOME/linka" &&',
  `  rm -f ${STORE} &&`,
  `  DO_NOT_TRACK=1 relate query -d ${STORE} < "$export_file" > /dev/null`,
].join("\n");

// --read-only を付けると、エージェントに見えるのは read_cypher と get_schema だけになり、ファイルも書き換わらない
const SERVE = `relate serve --database ${STORE} --read-only --mcp stdio`;

export const CLAUDE_CODE_COMMAND = `claude mcp add linka -e DO_NOT_TRACK=1 -- ${SERVE}`;

/**
 * ~/.codex/config.toml の [mcp_servers.linka] を書く。同じ名前で流し直すと置き換わるので、2 回流しても重複しない。
 * ~/.codex が無ければ作る
 */
export const CODEX_COMMAND = `codex mcp add linka --env DO_NOT_TRACK=1 -- ${SERVE}`;

export const AGENT_PROMPT =
  "Use the linka graph to suggest an implementation plan based on the concerns and solutions I researched.";

// --read-only を付けないと、読むだけでもファイルが書き換わる
export const DIRECT_QUERY_COMMAND = `DO_NOT_TRACK=1 relate query --read-only -d ${STORE} "MATCH (p:Page) RETURN p.title AS title"`;
