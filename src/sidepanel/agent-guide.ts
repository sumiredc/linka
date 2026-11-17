// 「Use with your agent」で見せるコマンド（PRD UC4）。Relate CLI 1.0.1 の `relate query` と `relate serve` の形。
// どれもプロジェクトのフォルダで流す。書き出しも linka.rl も、そのフォルダに置く
import { EXPORT_FILE_NAME } from "../shared/graph-export";

export const STORE_FILE_NAME = "linka.rl";

/** コマンドを貼るターミナル。macOS と Linux は sh・bash・zsh、Windows は PowerShell */
export type Shell = "posix" | "powershell";

export const SHELLS: readonly { id: Shell; name: string }[] = [
  { id: "posix", name: "macOS / Linux" },
  { id: "powershell", name: "Windows" },
];

/** ブラウザが Windows で動いていれば、Windows の手順を先に見せる */
export function defaultShell(userAgent: string): Shell {
  return /Windows/i.test(userAgent) ? "powershell" : "posix";
}

export type GuideCommands = {
  buildStore: string;
  checkStore: string;
  claudeCode: string;
  codex: string;
  directQuery: string;
};

/**
 * 書き出しを linka.rl に読み込む。書き出しの先頭で中身を消すので、前の linka.rl にそのまま流してよい。
 * `query` を省くと文を実行せずヘルプを出して 0 で終わる。
 * --jsonl にすると、書き込むだけの文は何も出さない（表の形だと文ごとの所要時間が並ぶ）
 */
const LOAD = `relate query --jsonl -d ${STORE_FILE_NAME} < ${EXPORT_FILE_NAME}`;

// --read-only を付けないと、読むだけでもファイルが書き換わる
const PAGE_TITLES = `relate query --read-only -d ${STORE_FILE_NAME} "MATCH (p:Page) RETURN p.title AS title"`;

/**
 * エージェントの設定には絶対パスで書く。$PWD はどちらのシェルでも、二重引用符の中で展開される。
 * 相対パスだと、サブフォルダでエージェントを起動したときに見つからない（Claude Code で確かめた）。
 * --read-only を付けると、エージェントに見えるのは read_cypher と get_schema だけになり、ファイルも書き換わらない
 */
const serve = (path: string) => `relate serve --database "${path}" --read-only --mcp stdio`;

export const COMMANDS: Record<Shell, GuideCommands> = {
  posix: {
    buildStore: `DO_NOT_TRACK=1 ${LOAD}`,
    checkStore: `ls ${STORE_FILE_NAME}`,
    // scope を付けないと local になり、このプロジェクトでだけ、自分にだけ使える
    claudeCode: `claude mcp add linka -e DO_NOT_TRACK=1 -- ${serve(`$PWD/${STORE_FILE_NAME}`)}`,
    // ~/.codex/config.toml の [mcp_servers.linka] を書く。別のプロジェクトで流し直すと、そちらに置き換わる
    codex: `codex mcp add linka --env DO_NOT_TRACK=1 -- ${serve(`$PWD/${STORE_FILE_NAME}`)}`,
    directQuery: `DO_NOT_TRACK=1 ${PAGE_TITLES}`,
  },
  // PowerShell には < が無い。パイプで渡すと Windows PowerShell 5.1 は文字コードを変えてしまうので、
  // cmd の < でファイルのバイト列をそのまま渡す。
  // Windows PowerShell 5.1 は素の -- を外部コマンドに渡さず消すので、'--' と引用符で囲む（7 でもそのまま渡る）
  powershell: {
    buildStore: `$env:DO_NOT_TRACK=1; cmd /c "${LOAD}"`,
    checkStore: `ls ${STORE_FILE_NAME}`,
    claudeCode: `claude mcp add linka -e DO_NOT_TRACK=1 '--' ${serve(`$PWD\\${STORE_FILE_NAME}`)}`,
    codex: `codex mcp add linka --env DO_NOT_TRACK=1 '--' ${serve(`$PWD\\${STORE_FILE_NAME}`)}`,
    directQuery: `$env:DO_NOT_TRACK=1; ${PAGE_TITLES}`,
  },
};

export const AGENT_PROMPT =
  "Use the linka graph to suggest an implementation plan based on the concerns and solutions I researched.";
