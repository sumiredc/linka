# Development

This page is for changing Linka: the scripts, where the source is, how to rebuild the bundled store, how to release, how the website is deployed, and where to see logs.

```sh
npm test            # Vitest, including tests against a real in-memory Relate
npm run typecheck   # tsc
npm run lint        # Biome (CI runs `npx biome ci .`)
npm run build       # dist/, the extension to load or ship
npm run dev         # rebuild dist/ on change; reload the extension on chrome://extensions
```

The source is under `src/`, one folder per place it runs: `background/` (service worker), `offscreen/` (the Relate database and Gemini Nano), `popup/`, `sidepanel/`, `content/` (reads the page) and `shared/`.

## Rebuilding `data/linka.rl`

The bundled store is generated from `seed/demo.json`. To rebuild it after changing that file:

```sh
npm run seed   # seed/demo.json -> seed/demo.cypher
npm run store  # seed/demo.cypher -> data/linka.rl (needs Relate CLI 1.0.x on PATH)
```

The rebuilt file is not byte-identical to the previous one even when the seed is unchanged, so rebuild it only when the seed changes.

## Releasing

Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`: it tests, runs `npm run package`, and creates a GitHub Release for the tag with `linka-X.Y.Z.zip` attached. That zip is what goes to the Chrome Web Store.

1. Set the same version in `public/manifest.json`, `package.json` and `package-lock.json` (`npm version X.Y.Z --no-git-tag-version` updates the last two), and merge it to `main`.
2. Tag `main` and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   Creating the release on GitHub (**Releases → Draft a new release**, with a new tag) works too: the workflow attaches the zip to that release.

If the tag and the versions differ, the workflow fails and attaches nothing.

To rebuild the zip for an existing tag, run the workflow by hand:

```sh
gh workflow run release.yml -f tag=vX.Y.Z
```

## Website

`site/` is the page at https://linka.sumire-sakamoto.co.jp, the Official URL of the Chrome Web Store listing. It is hand-written HTML with no build step, and loads nothing from other origins. Open `site/index.html` in a browser to check it.

When `site/**` changes on `main`, `.github/workflows/deploy-site.yml` copies `site/` to the server with rsync over SSH, then checks that the main URLs return 200. You can also run it by hand from the Actions tab. It does not delete files on the server, since the server keeps a `.htaccess` there.

The subdomain, its TLS certificate and its `.htaccess` are set up outside this repository. The workflow needs these repository settings:

| Name | Kind | Value |
|---|---|---|
| `DEPLOY_SSH_KEY` | Secret | Private key used only for this deploy |
| `DEPLOY_HOST` | Variable | SSH host |
| `DEPLOY_USER` | Variable | SSH user |
| `DEPLOY_PORT` | Variable | SSH port (default 22) |
| `DEPLOY_PATH` | Variable | Absolute path of the subdomain's document root |
| `DEPLOY_KNOWN_HOSTS` | Variable | Output of `ssh-keyscan -p <port> -H <host>`, checked against the server's host key |

## Offscreen document logs

Timings of extraction, `ADDRESSES` judging and questions are logged in the offscreen document's console: open `chrome://extensions` → Linka → **Inspect views: offscreen.html**.

**Do not open `offscreen.html` in a tab.** That page starts its own database worker, becoming a second owner of the OPFS store, which only one place can open at a time.
