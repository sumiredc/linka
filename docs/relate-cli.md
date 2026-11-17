# Relate CLI

This page shows how to install the Relate CLI, which Linka uses to inspect `data/linka.rl` and to hand the graph to a coding agent.

Install it with the official installer, which checks the signature and checksum and puts `relate` in `~/.local/bin` (no sudo):

```sh
curl -sSfL https://relatedb.ai/install.sh | bash
relate --version
```

The installer always installs the latest release. Linka was checked with **Relate CLI 1.0.1** (the same version as the bundled `@relate/relate-wasm`) on macOS (arm64); to pin that version, download the binary for your platform (such as `relate-darwin-arm64`) from the [`v1.0.1` release](https://github.com/relatedb/relate/releases). Other platforms were not checked.

On Windows, the installer above is not available. Download `relate-windows-amd64.exe` from the [`v1.0.1` release](https://github.com/relatedb/relate/releases), rename it to `relate.exe`, and put it in a folder on your `PATH`.

## Turning off the CLI's telemetry

The Relate CLI sends anonymous usage metrics by default. Every command in Linka's documentation sets `DO_NOT_TRACK=1`, which turns them off for that command. To turn them off permanently:

```sh
relate telemetry off
relate telemetry status
```
