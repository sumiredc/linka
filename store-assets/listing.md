# Chrome Web Store: what to enter

The listing: https://chromewebstore.google.com/detail/linka/nmikjhnnhfhflfifapnncpkpldefdfpn

## Package

Upload `release/linka-0.1.0.zip` (made with `npm run package`).

## Store listing

**Description**

```
Linka builds a knowledge graph from the pages you read, right in Chrome. Ask it questions, then hand it to your coding agent, such as Claude Code or Codex, over MCP.

Before you adopt a technique, you read about it: engineering blog posts, docs, issues and comparisons. One page raises a concern; another proposes a fix. Linka keeps which page answers which concern.

HOW IT WORKS
• Clip a page: click the Linka icon. Gemini Nano, Chrome's on-device model, extracts the page's concepts, authors and claims (concerns, solutions, benefits and facts).
• See the connections: Linka suggests where a solution on one page may address a concern on another, and links pages that share concepts.
• Ask your graph: in the side panel, ask a question such as "Which solutions address concerns about offline support?". Linka shows the Cypher query it ran and highlights the answer in the graph.
• Hand it to your coding agent: export the graph and register it as a read-only MCP server with the Relate CLI. Your agent plans with the concerns and solutions you collected.

PRIVATE BY DESIGN
Everything runs on your device. The graph is stored with Relate, an embedded graph database, inside the browser. There is no Linka server, no account and no analytics. Linka reads a page only when you clip it.

REQUIREMENTS
Linka needs Gemini Nano, which Chrome provides on desktop: Windows 10/11, macOS 13+, Linux or a Chromebook Plus, at least 22 GB of free disk space, and either a GPU with more than 4 GB of VRAM or 16 GB of RAM with 4 or more CPU cores. If the model is not on your device yet, Chrome downloads it the first time you open Linka. English pages work best.

Handing the graph to a coding agent needs the Relate CLI. The steps: https://github.com/sumiredc/linka/blob/main/docs/agent-handoff.md

Open source (MIT): https://github.com/sumiredc/linka
```

- **Category:** Developer Tools
- **Language:** English
- **Store icon (128×128):** `public/icons/icon-128.png`
- **Screenshots (1280×800):** `screenshot-1-clip.png` to `screenshot-5-agent-plan.png`, in that order
- **Small promo tile (440×280):** `promo-small-440x280.png`
- **Marquee promo tile (1400×560):** `promo-marquee-1400x560.png`
- **Global promo video:** https://www.youtube.com/watch?v=ZYyIQFN0fSY
- **Official URL:** https://linka.sumire-sakamoto.co.jp (verified in Search Console)
- **Homepage URL:** https://linka.sumire-sakamoto.co.jp
- **Support URL:** https://github.com/sumiredc/linka/issues

## Privacy

**Single purpose description**

```
Linka turns the web pages a user chooses to clip into a knowledge graph on the user's device, so the user can ask it questions and export it for a coding agent.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| `activeTab` | Linka reads the current page only when the user clicks the Linka icon to clip it. |
| `scripting` | To read the text of the page the user clips, Linka injects a script into that tab after the user clicks the Linka icon. |
| `tabs` | Linka reads the URL of a tab when the user switches tabs or a tab navigates, to show a ✓ badge on the icon for pages the user has already clipped. URLs are compared with the user's local graph and are not stored or sent. |
| `sidePanel` | Linka shows the user's graph, its details and the question box in Chrome's side panel. |
| `offscreen` | Linka runs its graph database (Relate, WebAssembly in a dedicated worker) and Gemini Nano in an offscreen document, so a clip keeps running after the popup closes. |

**Are you using remote code?** No. All code is bundled in the package.

**Data usage**

Check **Website content** and **Web history**. Leave the other types unchecked.

- Website content: Linka reads the text of the pages the user clips and stores what Gemini Nano extracts from them on the device.
- Web history: for each clipped page, Linka stores its URL, title and the time it was clipped, and reads tab URLs (`tabs`) to mark clipped pages.

Check all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/sumiredc/linka/blob/main/docs/privacy.md

## Distribution

- **Payments:** Free
- **Visibility:** Public
- **Regions:** All regions
