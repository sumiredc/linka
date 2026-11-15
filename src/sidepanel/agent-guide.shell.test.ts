import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUILD_STORE_COMMAND,
  BUILD_STORE_FROM_LINKA_COMMAND,
  NO_EXPORT_IN_DOWNLOADS,
  NO_EXPORT_IN_LINKA,
} from "./agent-guide";

// 利用者がターミナルに貼るのは sh・bash・zsh のどれか。手元に無いシェルは飛ばす
const SHELLS = ["sh", "bash", "zsh"].filter(
  (shell) => spawnSync("sh", ["-c", `command -v ${shell}`]).status === 0,
);

// relate の代わりに、-d で渡されたファイルへ stdin を書く
const FAKE_RELATE = '#!/bin/sh\nwhile [ "$1" != "-d" ]; do shift; done\ncat > "$2"\n';

let home = "";
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  home = "";
});

function setUp() {
  home = mkdtempSync(join(tmpdir(), "linka-guide-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "relate"), FAKE_RELATE);
  chmodSync(join(bin, "relate"), 0o755);
  mkdirSync(join(home, "linka"));
  writeFileSync(join(home, "linka", "linka.rl"), "previous store");
  return home;
}

function write(path: string, text: string, ageSeconds = 0) {
  writeFileSync(join(home, path), text);
  const time = Date.now() / 1000 - ageSeconds;
  utimesSync(join(home, path), time, time);
}

function run(shell: string, command: string) {
  const result = spawnSync(shell, ["-c", command], {
    env: { HOME: home, PATH: `${join(home, "bin")}:${process.env.PATH}` },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stderr: result.stderr,
    store: readFileSync(join(home, "linka", "linka.rl"), "utf8"),
  };
}

describe.each(SHELLS)("in %s, the command that makes linka.rl from ~/Downloads", (shell) => {
  it("loads the newest linka-export*.cypher, because Chrome saves a re-export as linka-export (1).cypher", () => {
    setUp();
    mkdirSync(join(home, "Downloads"));
    write("Downloads/linka-export.cypher", "older", 60);
    write("Downloads/linka-export (1).cypher", "newer");
    const { status, store } = run(shell, BUILD_STORE_COMMAND);
    expect(status).toBe(0);
    expect(store).toBe("newer");
  });

  it.each([
    ["is empty", () => mkdirSync(join(home, "Downloads"))],
    ["does not exist", () => {}],
  ])(
    "says no export was found and keeps the previous linka.rl when ~/Downloads %s",
    (_, arrange) => {
      setUp();
      arrange();
      const { status, stderr, store } = run(shell, BUILD_STORE_COMMAND);
      expect(status).not.toBe(0);
      expect(stderr).toContain(NO_EXPORT_IN_DOWNLOADS);
      expect(store).toBe("previous store");
    },
  );
});

describe.each(SHELLS)("in %s, the command that makes linka.rl from ~/linka", (shell) => {
  it("loads ~/linka/linka-export.cypher in place of the previous linka.rl", () => {
    setUp();
    write("linka/linka-export.cypher", "moved");
    const { status, store } = run(shell, BUILD_STORE_FROM_LINKA_COMMAND);
    expect(status).toBe(0);
    expect(store).toBe("moved");
  });

  it("says the file is missing and keeps the previous linka.rl when it was not moved there", () => {
    setUp();
    const { status, stderr, store } = run(shell, BUILD_STORE_FROM_LINKA_COMMAND);
    expect(status).not.toBe(0);
    expect(stderr).toContain(NO_EXPORT_IN_LINKA);
    expect(store).toBe("previous store");
  });
});
