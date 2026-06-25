# Desktop (Electrobun MVP)

Murrmure Desktop is a single-process local app shell:

- Electrobun main process starts/stops the hub sidecar
- Hub serves both shell UI and API on `http://127.0.0.1:8787`
- Desktop injects a bootstrap token into browser storage so first run skips `/connect`

## `desktop:dev` (monorepo)

Prerequisites:

- Node 20+
- pnpm workspace install completed
- Bun installed locally (`bun --version`)

Run:

```bash
pnpm desktop:dev
```

What this does:

1. Builds bundled shell (`@murrmure/shell-web`, `VITE_MURRMURE_BUNDLED=1`)
2. Builds hub daemon TS output (`@murrmure/hub-daemon`)
3. Starts the hub sidecar on `http://127.0.0.1:8787`
4. Opens your **system browser** with a one-shot bootstrap link (no Electrobun import — avoids dev RPC noise)

This is a **packaged-path smoke test** for the single-URL desktop layout. It rebuilds shell + hub on each run with no watch/HMR.

For active shell/hub development, use `pnpm dev` (Vite HMR + hub tsx watch) instead.

For a native window, build and launch the packaged app:

```bash
pnpm desktop:build
# then open the artifact from apps/desktop/artifacts (requires Electrobun toolchain)
```

Or run `pnpm --filter @murrmure/desktop dev:window` only inside a built Electrobun `.app` bundle.

## First run and session bootstrap

Desktop v1 uses a local bootstrap token (`tok_01JBOOTSTRAPTOKEN00000001`) to prime shell auth before setup.

- Dev launcher validates token with `GET /v1/auth/whoami`, then opens `#murrmure-bootstrap=<token>` in the browser
- Shell stores `murrmure_token` / `murrmure_hub_url` and redirects to `/setup` (or `/configure` when setup already completed)
- Packaged Electrobun builds inject the same values via webview `executeJavascript` on DOM-ready

## Flows (single-URL desktop path)

Flow behavior is the same as self-hosted/dev; only the transport changes to one origin.

- Canvas shell still loads from `GET /flows/{flow_id}/{version}/ui/shell.html`
- Worker routes still run through hub proxy at `/api/{flow_id}/...`
- Shell + flow iframe + API now share `http://127.0.0.1:8787`, so no separate shell URL/hub URL setup is needed

CLI flow development is unchanged:

- Keep desktop app open, then run `mrmr flow dev`/install/apply as usual
- CLI discovery still reads `~/.murrmure/hubs/shared.json` to target the active desktop hub
- `flow.dev_reload` signaling still updates the mounted flow runtime

## Data and logs

- Hub data dir: `~/.murrmure`
- Hub lock owner file: `~/.murrmure/hub.lock/owner.json`
- Hub DB path: `~/.murrmure/studio.db`

## App menu

Desktop MVP adds:

- **Copy MCP config**: copies a JSON snippet wired to local hub URL
- **Open data folder**: opens `~/.murrmure`

## Full desktop build (manual MVP path)

`desktop:build` is scaffolded and expects Bun/Electrobun tooling locally. The current artifact **does not yet bundle a Node runtime or hub native dependencies** (`better-sqlite3`); treat it as packaging scaffolding until `postBuild` lands.

```bash
pnpm desktop:build
```

If Electrobun packaging is unavailable in your environment, continue using `pnpm desktop:dev` for local testing.
If native Electrobun APIs are unavailable in your runtime, desktop falls back to headless mode and logs the hub URL to open manually.

## Troubleshooting

- **Hub health timeout**: check another process using port `8787`
- **Already running message**: another desktop/hub instance owns the lock; close it first
- **Missing shell dist**: run `pnpm --filter @murrmure/shell-web build:bundled`
- **Missing hub dist**: run `pnpm --filter @murrmure/hub-daemon build`
- **Native API unavailable**: run inside an Electrobun-capable runtime (or use headless fallback URL printed by `desktop:dev`)
