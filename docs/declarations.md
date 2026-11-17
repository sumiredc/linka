# Declarations

This page lists what Linka uses, as the hackathon rules ask: Relate features, third-party libraries and AI tools, and when the work was done.

## Relate features used

- `@relate/relate-wasm` 1.0.1 in a dedicated worker: OPFS persistence (`RelateDb.open("opfs://…")`), in-memory fallback, `execute` with parameters, `executeScript` for reading the whole graph and for **Clear graph**, and `isWasmTrap` to recreate the worker after a panic
- Cypher: parameterized `MERGE`, multi-hop path queries for questions and cross-page connections
- Relate CLI: `relate query` to build `data/linka.rl` and the exported store, `--read-only` queries
- Relate MCP server: `relate serve --read-only --mcp stdio`, registered in Claude Code and Codex

## Third-party libraries

Runtime (bundled into the extension):

| Package | Version | License |
|---|---|---|
| `@relate/relate-wasm` | 1.0.1 | Apache-2.0 |
| `@mozilla/readability` | 0.6.0 | Apache-2.0 |
| `react` | 19.3.1 | MIT |
| `react-dom` | 19.3.1 | MIT |
| `react-force-graph-2d` | 1.29.2 | MIT |
| `zod` | 4.6.7 | MIT |

Development only:

| Package | Version | License |
|---|---|---|
| `@biomejs/biome` | 2.6.7 | MIT OR Apache-2.0 |
| `@types/chrome` | 0.3.7 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@vitejs/plugin-react` | 6.3.0 | MIT |
| `happy-dom` | 21.0.4 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vite` | 8.3.8 | MIT |
| `vitest` | 5.1.0 | MIT |

Licenses are taken from each package's `package.json`; transitive dependencies are not listed. Other tools: the Relate CLI 1.0.1 (Apache 2.0 binary) and Chrome's Prompt API.

## AI tools

- **Gemini Nano** (Chrome Prompt API) runs at runtime, on device, for extraction, `ADDRESSES` judging and choosing the question type.
- **Claude Code** and **Gemini** were used during development.

## New work

The project was started on or after 2026-11-11; the first commit is dated 2026-11-15. All code in this repository was written for this hackathon.
