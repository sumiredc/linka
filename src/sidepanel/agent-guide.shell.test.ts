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
import { BUILD_STORE_COMMAND } from "./agent-guide";

// 利用者がターミナルに貼るのは sh・bash・zsh のどれか。手元に無いシェルは飛ばす
const installed = (shells: string[]) =>
  shells.filter((shell) => spawnSync("sh", ["-c", `command -v ${shell}`]).status === 0);
const SHELLS = installed(["sh", "bash", "zsh"]);
// set -o pipefail を確実に持つシェル
const PIPEFAIL_SHELLS = installed(["bash", "zsh"]);

type Case = [string, () => void];

// root はパーミッションに関係なく読めるので、読めないファイルを作れない
const isRoot = process.getuid?.() === 0;

// relate の代わりに、-d で渡されたファイルへ stdin を書く
const FAKE_RELATE = '#!/bin/sh\nwhile [ "$1" != "-d" ]; do shift; done\ncat > "$2"\n';

// 利用者の設定でよくある、ls と grep の出力を変えるもの。command はシェル関数も alias も通さない
const LS_AS_LONG_LIST = 'ls() { /bin/ls -l "$@"; }\n';
const REAL_GREP = spawnSync("sh", ["-c", "command -v grep"], { encoding: "utf8" }).stdout.trim();
const COLOURING_GREP = `#!/bin/sh\nexec ${REAL_GREP} --color=always "$@"\n`;

let home = "";
afterEach(() => {
  if (home) {
    chmodSync(home, 0o755);
    spawnSync("chmod", ["-R", "u+rwX", home]);
    rmSync(home, { recursive: true, force: true });
  }
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
}

function write(path: string, text: string, ageSeconds = 0) {
  writeFileSync(join(home, path), text);
  touch(path, ageSeconds);
}

function touch(path: string, ageSeconds = 0) {
  const time = Date.now() / 1000 - ageSeconds;
  utimesSync(join(home, path), time, time);
}

function run(shell: string, command: string, prelude = "") {
  const result = spawnSync(shell, ["-c", prelude + command], {
    env: { HOME: home, PATH: `${join(home, "bin")}:${process.env.PATH}` },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stderr: result.stderr,
    store: readFileSync(join(home, "linka", "linka.rl"), "utf8"),
  };
}

// 探した場所はシェルが展開した $downloads で出す（1 行目を書き換えた人にもそこが出る）
const notFound = () =>
  `linka: no readable linka-export*.cypher in ${join(home, "Downloads")} or ~/linka`;

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

  it("finds the export when ls is redefined to print a long listing", () => {
    setUp();
    mkdirSync(join(home, "Downloads"));
    write("Downloads/linka-export.cypher", "export");
    const { status, store } = run(shell, BUILD_STORE_COMMAND, LS_AS_LONG_LIST);
    expect(status).toBe(0);
    expect(store).toBe("export");
  });

  it("finds the export when grep on PATH colours its output", () => {
    setUp();
    writeFileSync(join(home, "bin", "grep"), COLOURING_GREP);
    chmodSync(join(home, "bin", "grep"), 0o755);
    mkdirSync(join(home, "Downloads"));
    write("Downloads/linka-export.cypher", "export");
    const { status, store } = run(shell, BUILD_STORE_COMMAND);
    expect(status).toBe(0);
    expect(store).toBe("export");
  });

  it.each<Case>([
    ["is empty", () => mkdirSync(join(home, "Downloads"))],
    ["does not exist", () => {}],
    [
      "has a directory named like an export as its newest entry",
      () => {
        mkdirSync(join(home, "Downloads"));
        write("Downloads/linka-export.cypher", "older", 60);
        mkdirSync(join(home, "Downloads", "linka-export (2).cypher"));
        touch("Downloads/linka-export (2).cypher");
      },
    ],
    ...(isRoot
      ? []
      : ([
          [
            "has an unreadable export",
            () => {
              mkdirSync(join(home, "Downloads"));
              write("Downloads/linka-export.cypher", "secret");
              chmodSync(join(home, "Downloads", "linka-export.cypher"), 0);
            },
          ],
        ] satisfies Case[])),
  ])(
    "says no readable export was found and keeps the previous linka.rl when ~/Downloads %s",
    (_, arrange) => {
      setUp();
      arrange();
      const { status, stderr, store } = run(shell, BUILD_STORE_COMMAND);
      expect(status).not.toBe(0);
      expect(stderr).toContain(notFound());
      expect(store).toBe("previous store");
    },
  );
});

describe.each(PIPEFAIL_SHELLS)("in %s with pipefail", (shell) => {
  it("finds the newest export in a Downloads folder too big for one pipe buffer", () => {
    setUp();
    mkdirSync(join(home, "Downloads"));
    for (let i = 0; i < 2000; i++) {
      write(`Downloads/an-older-download-with-a-fairly-long-name-${i}.pdf`, "", 120);
    }
    write("Downloads/linka-export.cypher", "export");
    const { status, store } = run(shell, BUILD_STORE_COMMAND, "set -o pipefail\n");
    expect(status).toBe(0);
    expect(store).toBe("export");
  });
});

describe.each(SHELLS)("in %s, the command reading a file moved to ~/linka", (shell) => {
  it.each<Case>([
    ["does not exist", () => {}],
    ["has no export", () => mkdirSync(join(home, "Downloads"))],
    ...(isRoot
      ? []
      : ([
          [
            "cannot be read",
            () => {
              mkdirSync(join(home, "Downloads"));
              chmodSync(join(home, "Downloads"), 0);
            },
          ],
        ] satisfies Case[])),
  ])("loads the newest export in ~/linka when ~/Downloads %s", (_, arrange) => {
    setUp();
    arrange();
    write("linka/linka-export.cypher", "older", 60);
    write("linka/linka-export (1).cypher", "moved");
    const { status, stderr, store } = run(shell, BUILD_STORE_COMMAND);
    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(store).toBe("moved");
  });

  it.each([
    ["~/Downloads", "newer in Downloads", 120, 0],
    ["~/linka", "newer in linka", 0, 120],
  ])("loads the export in %s when it is the newer one", (_, expected, linkaAge, downloadsAge) => {
    setUp();
    mkdirSync(join(home, "Downloads"));
    write("linka/linka-export.cypher", "newer in linka", linkaAge);
    write("Downloads/linka-export.cypher", "newer in Downloads", downloadsAge);
    const { status, store } = run(shell, BUILD_STORE_COMMAND);
    expect(status).toBe(0);
    expect(store).toBe(expected);
  });

  it("tells to move the file to ~/linka when neither folder has an export", () => {
    setUp();
    const { status, stderr, store } = run(shell, BUILD_STORE_COMMAND);
    expect(status).not.toBe(0);
    expect(stderr).toContain("move the file to ~/linka in Finder and run this again");
    expect(store).toBe("previous store");
  });
});

describe.each(PIPEFAIL_SHELLS)("in %s with pipefail, when ~/Downloads does not exist", (shell) => {
  it("still loads the export in ~/linka", () => {
    setUp();
    write("linka/linka-export.cypher", "moved");
    const { status, store } = run(shell, BUILD_STORE_COMMAND, "set -o pipefail\n");
    expect(status).toBe(0);
    expect(store).toBe("moved");
  });
});
