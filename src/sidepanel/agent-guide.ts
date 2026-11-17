// 「Use with your agent」で見せるコマンド（PRD UC4）。Relate CLI 1.0.1 の `relate query` と `relate serve` の形
import { EXPORT_FILE_NAME } from "../shared/graph-export";

// エージェントの設定には絶対パスで書く（PRD UC4）。シェルが $HOME を展開するので、登録されるのは絶対パスになる
const STORE = '"$HOME/linka/linka.rl"';

const EXPORT_PATTERN = EXPORT_FILE_NAME.replace(".cypher", "*.cypher");

// $downloads はシェルが展開する。ダウンロード先を書き換えた人にも、実際に探した場所が出る
export const NO_EXPORT_FOUND = `linka: no readable ${EXPORT_PATTERN} in $downloads or ~/linka. If your terminal can't read $downloads, move the file to ~/linka in Finder and run this again`;

/**
 * ~/Downloads と ~/linka の両方から、一番新しい書き出しを読む。
 * ~/linka は、macOS がターミナルにダウンロードフォルダを読ませないときに、Finder で移してもらう先。
 * 両方を比べるので、前に ~/linka に移した古いファイルが新しい書き出しより優先されない。
 *
 * Chrome は同じ名前があると「linka-export (1).cypher」で保存するので、名前ではなく一番新しいものを読む。
 * glob を使わないのは、zsh では一致しない glob が「no matches found」で止まるため。
 * command を付けて、利用者の ls の alias（-l・eza など）を通さない。
 * grep -m 1 ではなく awk で最後まで読む。途中で閉じると、pipefail のシェルでは ls の SIGPIPE で失敗になる。
 * ls はフォルダが無いか読めないと失敗するので、pipefail でも止まらないよう || true を付け、エラーは捨てる。
 * awk は見つからなくても 0 で終わるので、見つかったかは [ -f ] で見る（名前が空なら、そのパスはディレクトリ）。
 * 読めるファイルでなければ、前の linka.rl を消す前に止める。読めないまま rm まで進むと、前の linka.rl だけが消える。
 * `a || { …; false; } && b` は左から結びつくので、a が失敗したときだけ message を出して b 以降を流さない。
 * 前の linka.rl に読み込むと、そのあと消したページが残るので、消してから作る。
 * `query` を省くと文を実行せずヘルプを出して 0 で終わる。stdout は文ごとの所要時間なので捨てる
 */
export const BUILD_STORE_COMMAND = [
  // ダウンロード先を変えている人が書き換えるのは 1 行目だけで済むようにする
  'downloads="$HOME/Downloads" &&',
  `  newest='/^${EXPORT_FILE_NAME.replace(".cypher", ".*\\.cypher")}$/ && !found { print; found = 1 }' &&`,
  '  in_downloads="$downloads/$(command ls -t "$downloads" 2>/dev/null | awk "$newest" || true)" &&',
  '  in_linka="$HOME/linka/$(command ls -t "$HOME/linka" 2>/dev/null | awk "$newest" || true)" &&',
  '  { [ -f "$in_downloads" ] && { [ ! -f "$in_linka" ] || [ ! "$in_linka" -nt "$in_downloads" ]; } &&',
  '  export_file="$in_downloads" || export_file="$in_linka"; } &&',
  '  [ -f "$export_file" ] && [ -r "$export_file" ] ||',
  `  { echo "${NO_EXPORT_FOUND}" >&2; false; } &&`,
  '  echo "Loading $export_file" &&',
  '  mkdir -p "$HOME/linka" &&',
  `  rm -f ${STORE} &&`,
  `  DO_NOT_TRACK=1 relate query -d ${STORE} < "$export_file" > /dev/null`,
].join("\n");

/** エージェントの MCP が失敗したときに、まず linka.rl があるかを確かめる */
export const CHECK_STORE_COMMAND = "ls ~/linka/linka.rl";

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
