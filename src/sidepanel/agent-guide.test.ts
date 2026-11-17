import { describe, expect, it } from "vitest";
import { EXPORT_FILE_NAME } from "../shared/graph-export";
import {
  BUILD_STORE_COMMAND,
  CHECK_STORE_COMMAND,
  CLAUDE_CODE_COMMAND,
  CODEX_COMMAND,
  DIRECT_QUERY_COMMAND,
  STORE_FILE_NAME,
} from "./agent-guide";

// PRD UC4 の手順の決まり。コマンドそのものは Relate CLI 1.0.1・Claude Code・Codex で手で確かめる。
// どのコマンドもプロジェクトのフォルダで流し、ダウンロードフォルダやホームの場所に頼らない
const ALL = [
  BUILD_STORE_COMMAND,
  CHECK_STORE_COMMAND,
  CLAUDE_CODE_COMMAND,
  CODEX_COMMAND,
  DIRECT_QUERY_COMMAND,
];

describe("the commands", () => {
  it.each(ALL)("work in the project folder, not in a fixed place: %s", (command) => {
    expect(command).not.toMatch(/\$HOME|~\/|Downloads/);
  });
});

describe("the command that makes linka.rl", () => {
  it("loads the export from the project folder with relate query, because relate -d without query only prints help", () => {
    expect(BUILD_STORE_COMMAND).toMatch(
      new RegExp(`relate query .*-d ${STORE_FILE_NAME} < ${EXPORT_FILE_NAME.replace(".", "\\.")}$`),
    );
  });

  it("does not delete linka.rl first, because the export replaces what it holds", () => {
    expect(BUILD_STORE_COMMAND).not.toContain("rm ");
  });
});

describe("registering the MCP server", () => {
  it.each([
    ["Claude Code", CLAUDE_CODE_COMMAND],
    ["Codex", CODEX_COMMAND],
  ])(
    "%s serves the project's linka.rl read-only over stdio, by absolute path, without telemetry",
    (_, command) => {
      // 相対パスだと、サブフォルダでエージェントを起動したときに見つからない
      expect(command).toContain(
        `-- relate serve --database "$PWD/${STORE_FILE_NAME}" --read-only --mcp stdio`,
      );
      expect(command).toMatch(/(-e|--env) DO_NOT_TRACK=1 /);
    },
  );

  it("registers Claude Code for this project only, with the default scope", () => {
    expect(CLAUDE_CODE_COMMAND).not.toContain("--scope");
  });

  it("registers Codex with codex mcp add, which replaces linka instead of appending a duplicate", () => {
    expect(CODEX_COMMAND).toMatch(/^codex mcp add linka /);
    expect(CODEX_COMMAND).not.toContain(">>");
  });
});

describe("querying linka.rl directly", () => {
  it("opens it read-only, because a plain query rewrites the file", () => {
    expect(DIRECT_QUERY_COMMAND).toContain(`relate query --read-only -d ${STORE_FILE_NAME}`);
  });
});
