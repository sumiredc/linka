import { describe, expect, it } from "vitest";
import {
  BUILD_STORE_COMMAND,
  CLAUDE_CODE_COMMAND,
  CODEX_COMMAND,
  DIRECT_QUERY_COMMAND,
} from "./agent-guide";

// PRD UC4 の手順の決まり。コマンドそのものは Relate CLI 1.0.1・Claude Code・Codex で手で確かめる

describe("the command that makes linka.rl", () => {
  const lines = BUILD_STORE_COMMAND.split("\n");

  it("loads the export with relate query, because relate -d without query only prints help", () => {
    expect(lines.at(-1)).toMatch(/relate query -d "\$HOME\/linka\/linka\.rl" < /);
  });

  it("deletes the previous linka.rl first, so pages deleted since the last export do not remain", () => {
    const remove = lines.indexOf('rm -f "$HOME/linka/linka.rl"');
    expect(remove).toBeGreaterThanOrEqual(0);
    expect(remove).toBeLessThan(lines.length - 1);
  });
});

describe("registering the MCP server", () => {
  it.each([
    ["Claude Code", CLAUDE_CODE_COMMAND],
    ["Codex", CODEX_COMMAND],
  ])(
    "%s serves linka.rl read-only over stdio, by absolute path, without telemetry",
    (_, command) => {
      expect(command).toMatch(/serve"?,? "?--database"?,? "\$HOME\/linka\/linka\.rl"/);
      expect(command).toContain("--read-only");
      expect(command).toMatch(/--mcp"?,? "?stdio/);
      expect(command).toMatch(/DO_NOT_TRACK ?= ?"?1/);
      // ~ はエージェントの設定ファイルの中では展開されない
      expect(command).not.toContain("~/linka");
    },
  );

  it("lets the shell expand $HOME in the Codex heredoc, so the config gets an absolute path", () => {
    // 区切りを引用符で囲むと $HOME がそのまま書き込まれる
    expect(CODEX_COMMAND.split("\n")[0]).toBe("cat >> ~/.codex/config.toml <<EOF");
    expect(CODEX_COMMAND).toContain("[mcp_servers.linka]");
  });
});

describe("querying linka.rl directly", () => {
  it("opens it read-only, because a plain query rewrites the file", () => {
    expect(DIRECT_QUERY_COMMAND).toContain("relate query --read-only -d");
  });
});
