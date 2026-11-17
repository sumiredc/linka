# Using Linka

This page covers what the README's first steps leave out: the side panel, Gemini Nano's requirements and model download, every step of clipping and asking, what Linka keeps where, and the persisted store in this repository.

## The side panel

Open Chrome's side panel (the side panel button in the toolbar) and choose **Linka**. The graph starts empty, and the side panel tells you how to clip your first page. Clicking the Linka icon itself clips the current page; its popup offers **Open side panel** after a clip. The header shows the AI status: `AI ready`, `Downloading AI`, or not available with the reason.

The next time you open it, the side panel shows your graph as you left it. **… → Clear graph** deletes every page you clipped, after a confirmation.

## Gemini Nano

Linka extracts and connects pages, and answers questions, with Gemini Nano through Chrome's Prompt API. Without it, you cannot clip pages or ask questions; you can still browse, export and clear a graph you already have.

Per [Chrome's Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api), Gemini Nano needs:

- A desktop OS: Windows 10/11, macOS 13+, Linux, or ChromeOS on a Chromebook Plus (not Android or iOS)
- At least 22 GB of free disk space on the volume with your Chrome profile
- Either a GPU with more than 4 GB of VRAM, or a CPU with 16 GB of RAM and 4 or more cores

It may also be disabled by an enterprise policy (not verified).

To get the model, open the Linka popup (click the Linka icon on any page). If the model is not on your device yet, its download starts there, and the popup and the side panel show the progress. When it finishes, the side panel header shows `AI ready`. If it shows that AI is not available, the reason next to it says why.

## Clipping, browsing and asking

1. **Clip a page.** Open an article and click the Linka icon. Clipping starts right away: read the page → extract concepts and claims → save to the graph → find connections to other pages. You can close the popup; clipping continues. When it finishes, the popup lists the counts and the suggested connections, and the icon shows that the page is clipped. Clicking the icon on a clipped page offers **Clip again** (replaces what was extracted from that page) and **Open side panel**. Extraction asks Gemini Nano for English input and output, so English pages work best.
2. **Browse the graph.** In the side panel, click a node to see its details.
3. **Ask a question.** Type an English question and press ⌘/Ctrl + Enter. For example, after clipping a few pages about offline web storage:
   - What concerns are there about OPFS?
   - Which solutions address concerns about offline support?
   - Which pages mention both OPFS and Web Worker?

   The side panel shows the executed Cypher and the results, and highlights them in the graph. Click a page in the results to open it in a new tab. If a question does not fit a supported type, it lists the types and the concepts in your graph instead.
4. **Hand it to your agent.** See [Use Linka with your coding agent](agent-handoff.md).

## Where the data lives, in full

| Data | Location |
|---|---|
| Your graph | OPFS of the extension's origin (`opfs://linka-graph`), in your Chrome profile. Removing the extension removes it. If OPFS cannot be used, the side panel says the graph is kept in memory and disappears when closed. |
| Clip-recovery bookkeeping | `localStorage` of the extension's offscreen document |
| Demo data, for `data/linka.rl` and the tests | `seed/demo.json` → `seed/demo.cypher` (generated with `npm run seed`). Not in the extension |
| Bundled store | `data/linka.rl`, built from `seed/demo.cypher` with `npm run store` |
| Your export | `linka-export.cypher` and `linka.rl` in the project folder you chose, if you follow [Use Linka with your coding agent](agent-handoff.md) |

## The persisted store: `data/linka.rl`

`data/linka.rl` (a single file of about 116 KB) holds the demo graph from `seed/demo.cypher`, which the extension does not load (verified with Relate CLI 1.0.1: 15 `Page`, 29 `Concept`, 9 `Person`, 48 `Claim`; 90 `ABOUT`, 10 `ADDRESSES`, 48 `ASSERTS`, 9 `AUTHORED_BY`, 64 `MENTIONS`, 25 `RELATED_TO`). Always open it with `--read-only`: without it, even a read rewrites the file.

```sh
export DO_NOT_TRACK=1

# Count nodes by label
relate query --read-only -d data/linka.rl "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY label"

# Count relationships by type
relate query --read-only -d data/linka.rl "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY type"

# Which page's solution addresses which page's concern
relate query --read-only -d data/linka.rl "MATCH (sp:Page)-[:ASSERTS]->(:Claim)-[:ADDRESSES]->(:Claim)<-[:ASSERTS]-(cp:Page) RETURN DISTINCT cp.title AS concern_page, sp.title AS solution_page"
```

To rebuild it, see [Development](development.md#rebuilding-datalinkarl).

## More limitations

- No sync between devices or with Neo4j / Aura; export is the way out.
- The accuracy of suggested connections in the README's Limitations (13 of 21 labeled pairs; about half of the unrelated pairs were called connected) was measured on 2026-11-16 with a development page that has since been removed.
