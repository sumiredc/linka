# Use Linka with your coding agent

This page shows how to hand the graph you built in Linka to Claude Code or Codex over MCP, on macOS, Linux and Windows. The side panel's **… → Use with your agent** shows the same steps with copy buttons.

Everything happens in the project folder you work on with your agent, so each project gets its own graph.

Before you start, install the Relate CLI (see [Relate CLI](relate-cli.md)).

1. **Save the export in your project folder.** In the side panel, choose **… → Export**. Chrome asks where to save `linka-export.cypher`: choose your project folder, and replace the old file if there is one. Export is disabled while the graph is empty. If Chrome downloads the file instead of asking, move it into your project folder.

   To keep the export and `linka.rl` out of git, add them to your `.gitignore`.

2. **Make a Relate file.** In a terminal, in your project folder, run:

   ```sh
   DO_NOT_TRACK=1 relate query --jsonl -d linka.rl < linka-export.cypher
   ```

   Windows (PowerShell):

   ```powershell
   $env:DO_NOT_TRACK=1; cmd /c "relate query --jsonl -d linka.rl < linka-export.cypher"
   ```

   PowerShell has no `<`, and piping the file in Windows PowerShell 5.1 can change its encoding, so `cmd` passes the file as it is.

   Run it again after each export. The export starts by deleting everything in the store, so `linka.rl` ends up with exactly the exported graph, and pages you deleted in Linka do not remain. On a new file, Relate notes that statement 1 changed nothing; that is expected.

3. **Register it as a read-only MCP server.** Do this after step 2 succeeds; otherwise the server fails to start. Run it in your project folder: `$PWD` is expanded by your shell, so the agent's configuration gets an absolute path and works even when you start the agent in a subfolder.

   Claude Code:

   ```sh
   claude mcp add linka -e DO_NOT_TRACK=1 -- relate serve --database "$PWD/linka.rl" --read-only --mcp stdio
   ```

   Registers linka for this project only (the default `local` scope). Check it with `claude mcp list`.

   Claude Code on Windows (PowerShell):

   ```powershell
   claude mcp add linka -e DO_NOT_TRACK=1 '--' relate serve --database "$PWD\linka.rl" --read-only --mcp stdio
   ```

   The `--` is quoted because Windows PowerShell 5.1 drops a bare `--` before passing the arguments on.

   Codex:

   ```sh
   codex mcp add linka --env DO_NOT_TRACK=1 -- relate serve --database "$PWD/linka.rl" --read-only --mcp stdio
   ```

   Codex on Windows (PowerShell):

   ```powershell
   codex mcp add linka --env DO_NOT_TRACK=1 '--' relate serve --database "$PWD\linka.rl" --read-only --mcp stdio
   ```

   Writes `[mcp_servers.linka]` to `~/.codex/config.toml`, so every project sees it; running it in another project switches linka to that project's file. Restart Codex and run `/mcp` to see linka.

   If `/mcp` shows linka as failed, check that `ls linka.rl` in your project folder lists the file. If not, run step 2.

   With `--read-only`, the agent sees only `read_cypher` and `get_schema`, and the file is not modified. Without it, the agent also gets `write_cypher` and can change the graph.

4. **Ask your agent.**

   ```text
   Use the linka graph to suggest an implementation plan based on the concerns and solutions I researched.
   ```

To check the file without an agent, run this in your project folder:

```sh
DO_NOT_TRACK=1 relate query --read-only -d linka.rl "MATCH (p:Page) RETURN p.title AS title"
```

On Windows (PowerShell):

```powershell
$env:DO_NOT_TRACK=1; relate query --read-only -d linka.rl "MATCH (p:Page) RETURN p.title AS title"
```

The macOS and Linux commands were checked on macOS with Relate CLI 1.0.1. The Windows commands were not run on Windows.
