# Desktop v1 spec

Normative baseline for desktop behavior from `murrmure-desktop-v1` (Tasks 1-4).

## Goals

- Serve shell UI and hub APIs from one origin (`http://127.0.0.1:8787`)
- Keep `/v1`, `/api`, `/flows`, `/internal` route precedence over SPA fallback
- Launch/stop hub sidecar with desktop app lifecycle
- Skip manual `/connect` bootstrap in bundled desktop mode

## Single-URL topology

```text
Desktop webview (Electrobun BrowserWindow)
  -> GET /                      shell index
  -> GET /configure/...         shell SPA fallback
  -> GET/POST /v1/*             platform HTTP API
  -> GET/POST /api/*            flow worker proxy
  -> GET /flows/*               flow UI bundles
```

Hub remains the only HTTP server and serves both static shell content and runtime/API routes.

## Shell bundled behavior (Tasks 2 + 2b)

- Bundled shell uses `VITE_MURRMURE_BUNDLED=1`.
- In bundled mode, hub URL resolution is same-origin (`window.location.origin`).
- `/connect` auto-redirects to `/setup` when bundled mode already has `murrmure_token` in localStorage.
- Setup/grants MCP snippets use same-origin hub URL in bundled mode.
- Flow canvas iframe uses relative URL in bundled mode: `/flows/{packageId}/{version}/ui/shell.html?...`.
- `hub-fetch` forwarding from canvas is restricted to `/api/{packageId}/...` for the mounted flow.
- `hub-fetch` forwards only an allowlisted header set (`Content-Type`, `Accept`, `Idempotency-Key`); trust headers (`Authorization`, `X-Murrmure-*`) from iframe payloads are dropped.
- Hub `/api/*` worker proxy strips `X-Murrmure-Internal-Space`, `X-Murrmure-Caller-Token`, and `X-Murrmure-Worker-Token` from browser-originated requests.
- Bundled shell mode rejects non-loopback `MURRMURE_LISTEN_HOST` values.

## Desktop session bootstrap (Task 2b)

- Desktop host validates bootstrap token with `GET /v1/auth/whoami`.
- Desktop host injects web storage values in webview:
  - `murrmure_token`
  - `murrmure_hub_url`
- If first page lands on `/connect`, host-side script redirects to `/setup` (or `/configure` when setup is already complete).
- v1 default bootstrap token remains `tok_01JBOOTSTRAPTOKEN00000001` for localhost desktop MVP.

## Electrobun host (Task 4)

### Process lifecycle

- Main process spawns Node hub sidecar with:
  - `PORT=8787`
  - `MURRMURE_LISTEN_HOST=127.0.0.1`
  - `MURRMURE_DATA_DIR=~/.murrmure`
  - `MURRMURE_SHELL_STATIC_DIR=<shell dist>`
  - `MURRMURE_BUNDLE_ROOT=<bundle resources root>`
- Startup gate: poll `GET /v1/health` until ready (timeout: 30s).
- Quit path: send `SIGTERM` to hub, wait up to 5s, then `SIGKILL` if still alive.

### Single-instance policy (D18)

- Desktop checks `{dataDir}/hub.lock/owner.json`.
- If lock owner endpoint is healthy, second launch exits early (dev path may show informational dialog).

### Menu actions

- **Copy MCP config** copies local MCP JSON template wired to desktop hub URL.
- **Open data folder** opens desktop data directory (`~/.murrmure` in v1).

## Environment

| Variable | Required | Meaning |
|----------|----------|---------|
| `MURRMURE_SHELL_STATIC_DIR` | Optional | Built shell static directory (`dist`) mounted by hub at `/`. |
| `MURRMURE_LISTEN_HOST` | Optional | Hub bind interface (desktop default `127.0.0.1`). |
| `MURRMURE_BUNDLE_ROOT` | Optional | Resource root where seed contracts resolve from `<root>/hub/contracts`. |
| `MURRMURE_DATA_DIR` | Optional | Hub data directory (desktop default `~/.murrmure`). |
| `PORT` | Optional | Hub listen port (desktop default `8787`). |

## Discovery

Desktop/CLI discovery reads `~/.murrmure/hubs/shared.json`.
Canonical shape uses `hubs[].endpoint`; legacy flat `url` shape remains accepted.

Hub writes discovery only after effective port is known and preserves existing `flowProjects`.

## Hub lifecycle + lock semantics (Task 3)

- `startHubDaemon(config)` exposes `shutdown()` and supports embedded mode.
- Shutdown sequence kills workers, releases lock, closes server, and closes SQLite handles.
- Lock reclaim only happens when owner PID is dead or owner health probe fails.
- Timestamp-only lock reclaim is explicitly removed.

## Startup cleanup (D23)

- On startup, stale `{dataDir}/staging/*` directories older than 7 days are deleted.
- Cleanup is best-effort and never targets blob persistence directories.

## Contributor workflow

- Fast desktop smoke path: `pnpm desktop:dev` (opens system browser via `dev-main.ts`, no Electrobun import)
- Full packaged build remains optional/manual for MVP (`pnpm desktop:build`, Bun/Electrobun toolchain required).
