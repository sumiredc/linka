# Spike: Relate Wasm + OPFS in a Chrome extension

Checks that `@relate/relate-wasm` can persist a graph to OPFS from a dedicated worker started by an extension page (MV3, `'wasm-unsafe-eval'`).

## Automated check

```sh
npm install
npx playwright install chromium
npm run build
npm run check
```

`check.mjs` loads `dist/` into Playwright's Chromium and opens `sidepanel.html` as a tab (same extension origin as the side panel). It checks MERGE with params, multi-statement scripts, path queries, error envelopes, EXPLAIN, the OPFS lock, persistence across page reloads and a browser restart, and the time to load ~500 statements.

## Manual check in the real side panel

1. `npm run build`
2. Open `chrome://extensions`, turn on Developer mode, and choose **Load unpacked** → `dist/`
3. Click the extension's toolbar icon to open the side panel
4. **Open opfs://linka-spike** → **Add page** a few times → **Count pages**
5. Close and reopen the side panel (or restart Chrome), then **Open** → **Count pages**: the count is unchanged
