# Privacy policy

This policy describes what the Linka Chrome extension does with your data. Last updated: 2026-11-18.

## Summary

Linka does not send your data anywhere. Everything it reads, extracts and stores stays in Chrome on your device. There is no Linka server, no account, no analytics and no advertising.

## What Linka reads

- **The page you clip.** When you click the Linka icon on a page, Linka reads that page's title, URL and text. It reads only the page you clip, only when you click.
- **The URLs of your tabs.** When you switch tabs or a tab navigates, Linka checks whether the tab's URL is a page you have already clipped, to show a ✓ on its icon. It does not record the URLs it checks.

## What Linka stores, and where

- **Your graph:** for each page you clip, its URL, title, summary, authors, concepts and claims, extracted by Gemini Nano. Linka does not store the full page text.
- The graph is stored in your Chrome profile, in the extension's private storage (the origin private file system). Removing the extension removes it. **… → Clear graph** in the side panel deletes it.
- **Recovery bookkeeping:** while a clip is being written, Linka keeps a note of how to undo it in the extension's local storage, so that a failed write can be undone. It is cleared when the write finishes.

## On-device AI

Linka extracts claims, suggests connections and answers questions with Gemini Nano, Chrome's built-in on-device model, through Chrome's Prompt API. The page text is processed on your device and is not sent to Linka or to any other service by Linka. Chrome downloads the Gemini Nano model from Google when it is first needed; that download is between Chrome and Google, under Google's terms.

## Exporting

When you choose **Export**, Linka writes your graph to a file in the folder you choose. What you do with that file, such as giving it to a coding agent, is up to you and outside Linka.

## Sharing

Linka does not sell, transfer or share your data with anyone, and does not use it for any purpose other than the features described above.

## Permissions

| Permission | Why Linka needs it |
|---|---|
| `activeTab`, `scripting` | To read the page you clip, when you click the Linka icon |
| `tabs` | To read tab URLs so the icon shows ✓ on pages you have clipped |
| `sidePanel` | To show the graph in Chrome's side panel |
| `offscreen` | To run the graph database and Gemini Nano in an offscreen document, which keeps working after the popup closes |

## Contact

Questions about this policy: open an issue at https://github.com/sumiredc/linka/issues.
