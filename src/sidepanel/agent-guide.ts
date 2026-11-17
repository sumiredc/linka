// 「Use with your agent」で見せるコマンド（PRD UC4）。Relate CLI 1.0.1 の `relate query` と `relate serve` の形。
// どれもプロジェクトのフォルダで流す。書き出しも linka.rl も、そのフォルダに置く
import { EXPORT_FILE_NAME } from "../shared/graph-export";

export const STORE_FILE_NAME = "linka.rl";

/**
 * 書き出しを linka.rl に読み込む。書き出しの先頭で中身を消すので、前の linka.rl にそのまま流してよい。
 * `query` を省くと文を実行せずヘルプを出して 0 で終わる。
 * --jsonl にすると、書き込むだけの文は何も出さない（表の形だと文ごとの所要時間が並ぶ）
 */
export const BUILD_STORE_COMMAND = `DO_NOT_TRACK=1 relate query --jsonl -d ${STORE_FILE_NAME} < ${EXPORT_FILE_NAME}`;

/** エージェントの MCP が失敗したときに、まず linka.rl があるかを確かめる */
export const CHECK_STORE_COMMAND = `ls ${STORE_FILE_NAME}`;

/**
 * エージェントの設定には絶対パスで書く。$PWD はシェルが展開する。
 * 相対パスだと、サブフォルダでエージェントを起動したときに見つからない（Claude Code で確かめた）。
 * --read-only を付けると、エージェントに見えるのは read_cypher と get_schema だけになり、ファイルも書き換わらない
 */
const SERVE = `relate serve --database "$PWD/${STORE_FILE_NAME}" --read-only --mcp stdio`;

/** scope を付けないと local になり、このプロジェクトでだけ、自分にだけ使える */
export const CLAUDE_CODE_COMMAND = `claude mcp add linka -e DO_NOT_TRACK=1 -- ${SERVE}`;

/**
 * ~/.codex/config.toml の [mcp_servers.linka] を書く。どのプロジェクトからも同じ linka が見え、
 * 別のプロジェクトで流し直すと、そちらの linka.rl に置き換わる。~/.codex が無ければ作る
 */
export const CODEX_COMMAND = `codex mcp add linka --env DO_NOT_TRACK=1 -- ${SERVE}`;

export const AGENT_PROMPT =
  "Use the linka graph to suggest an implementation plan based on the concerns and solutions I researched.";

// --read-only を付けないと、読むだけでもファイルが書き換わる
export const DIRECT_QUERY_COMMAND = `DO_NOT_TRACK=1 relate query --read-only -d ${STORE_FILE_NAME} "MATCH (p:Page) RETURN p.title AS title"`;
