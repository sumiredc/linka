import { describe, expect, it } from "vitest";
import { EXPORT_FILE_NAME } from "../shared/graph-export";
import { COMMANDS, defaultShell, SHELLS, STORE_FILE_NAME } from "./agent-guide";

// PRD UC4 の手順の決まり。macOS の形は Relate CLI 1.0.1・Claude Code・Codex で手で確かめた。
// Windows（PowerShell）の形は手元で流せていない。
// どのコマンドもプロジェクトのフォルダで流し、ダウンロードフォルダやホームの場所に頼らない

const SHELL_IDS = SHELLS.map(({ id }) => id);

describe.each(SHELL_IDS)("the %s commands", (shell) => {
  const commands = COMMANDS[shell];

  it.each(Object.entries(commands))(
    "work in the project folder, not in a fixed place: %s",
    (_, command) => {
      expect(command).not.toMatch(/\$HOME|~[/\\]|Downloads/);
    },
  );

  it("load the export with relate query, because relate -d without query only prints help", () => {
    expect(commands.buildStore).toContain(
      `relate query --jsonl -d ${STORE_FILE_NAME} < ${EXPORT_FILE_NAME}`,
    );
  });

  it("do not delete linka.rl first, because the export replaces what it holds", () => {
    expect(commands.buildStore).not.toMatch(/\b(rm|del|Remove-Item)\b/);
  });

  it.each([
    ["Claude Code", commands.claudeCode],
    ["Codex", commands.codex],
  ])(
    "register %s to serve the project's linka.rl read-only over stdio, by absolute path, without telemetry",
    (_, command) => {
      // 相対パスだと、サブフォルダでエージェントを起動したときに見つからない
      expect(command).toMatch(
        /relate serve --database "\$PWD[/\\]linka\.rl" --read-only --mcp stdio$/,
      );
      expect(command).toMatch(/(-e|--env) DO_NOT_TRACK=1 /);
    },
  );

  it("register Claude Code for this project only, with the default scope", () => {
    expect(commands.claudeCode).toMatch(/^claude mcp add linka /);
    expect(commands.claudeCode).not.toContain("--scope");
  });

  it("register Codex with codex mcp add, which replaces linka instead of appending a duplicate", () => {
    expect(commands.codex).toMatch(/^codex mcp add linka /);
  });

  it("open linka.rl read-only to query it directly, because a plain query rewrites the file", () => {
    expect(commands.directQuery).toContain(`relate query --read-only -d ${STORE_FILE_NAME}`);
  });
});

describe("the Windows commands", () => {
  const commands = COMMANDS.powershell;

  it("pass the export through cmd's <, because PowerShell has no < and its pipe may re-encode text", () => {
    expect(commands.buildStore).toMatch(/cmd \/c "relate query .* < linka-export\.cypher"$/);
  });

  it("quote the -- before relate serve, because Windows PowerShell 5.1 drops a bare --", () => {
    for (const command of [commands.claudeCode, commands.codex]) {
      expect(command).toContain(" '--' relate serve ");
      expect(command).not.toMatch(/ -- /);
    }
  });

  it("turn off telemetry with $env, as PowerShell has no VAR=1 prefix", () => {
    expect(commands.buildStore).toMatch(/^\$env:DO_NOT_TRACK=1; /);
    expect(commands.directQuery).toMatch(/^\$env:DO_NOT_TRACK=1; /);
  });
});

describe("defaultShell", () => {
  it("shows the Windows commands first on Windows, and the macOS / Linux ones elsewhere", () => {
    expect(
      defaultShell("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0"),
    ).toBe("powershell");
    expect(
      defaultShell("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138"),
    ).toBe("posix");
    expect(defaultShell("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/138")).toBe(
      "posix",
    );
  });
});
