import { describe, expect, it } from "vitest";
import {
  BUILD_STORE_COMMAND,
  BUILD_STORE_FROM_LINKA_COMMAND,
  CLAUDE_CODE_COMMAND,
  CODEX_COMMAND,
  DIRECT_QUERY_COMMAND,
} from "./agent-guide";

// PRD UC4 の手順の決まり。コマンドそのものは Relate CLI 1.0.1・Claude Code・Codex で手で確かめる

// 見つからないときと最新のものを選ぶことは、本物のシェルで流して確かめる（agent-guide.shell.test.ts）
describe.each([
  ["~/Downloads", BUILD_STORE_COMMAND],
  ["~/linka", BUILD_STORE_FROM_LINKA_COMMAND],
])("the command that makes linka.rl from %s", (_, command) => {
  const lines = command.split("\n");

  it("loads the export with relate query, because relate -d without query only prints help", () => {
    expect(lines.at(-1)).toMatch(/relate query -d "\$HOME\/linka\/linka\.rl" < "\$export_file"/);
  });

  it("deletes the previous linka.rl before loading, so pages deleted since the last export do not remain", () => {
    const remove = lines.indexOf('  rm -f "$HOME/linka/linka.rl" &&');
    expect(remove).toBeGreaterThanOrEqual(0);
    expect(remove).toBeLessThan(lines.length - 1);
  });

  it("does not run the rest once a line fails", () => {
    for (const line of lines.slice(0, -1)) expect(line).toMatch(/(&&|\|\|)$/);
  });
});

it("reads the file moved to ~/linka by its plain name", () => {
  expect(BUILD_STORE_FROM_LINKA_COMMAND).toContain('export_file="$HOME/linka/linka-export.cypher"');
});

describe("registering the MCP server", () => {
  it.each([
    ["Claude Code", CLAUDE_CODE_COMMAND],
    ["Codex", CODEX_COMMAND],
  ])(
    "%s serves linka.rl read-only over stdio, by absolute path, without telemetry",
    (_, command) => {
      expect(command).toContain(
        '-- relate serve --database "$HOME/linka/linka.rl" --read-only --mcp stdio',
      );
      expect(command).toMatch(/(-e|--env) DO_NOT_TRACK=1 /);
      // ~ はエージェントの設定ファイルの中では展開されない
      expect(command).not.toContain("~/linka");
    },
  );

  it("registers Codex with codex mcp add, which replaces linka instead of appending a duplicate", () => {
    expect(CODEX_COMMAND).toMatch(/^codex mcp add linka /);
    expect(CODEX_COMMAND).not.toContain(">>");
  });
});

describe("querying linka.rl directly", () => {
  it("opens it read-only, because a plain query rewrites the file", () => {
    expect(DIRECT_QUERY_COMMAND).toContain("relate query --read-only -d");
  });
});
