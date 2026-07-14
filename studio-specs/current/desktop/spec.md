# Desktop v1 spec

Normative baseline for desktop behavior from `murrmure-desktop-v1` (Tasks 1-4).

## Goals

- Serve shell UI and hub APIs from one origin (`http://127.0.0.1:8787`)
- Keep `/v1`, `/api`, `/flows`, `/internal` route precedence over SPA fallback
- Launch/stop hub sidecar with desktop app lifecycle
- Skip manual `/connect` bootstrap in bundled desktop mode
- Start fresh storage with zero spaces, persisted contracts, flow installs, or indexed flows

## Clean first boot

Desktop packages compiled product schemas, not contract fixtures or demo data.
The Hub creates schema-only SQLite storage plus the local bootstrap actor; product
objects enter storage only through explicit space creation and apply/install.
Earlier development databases are not read or migrated during this cutover.
Operators must use the documented one-time local-state reset.

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

**v2 shell packages (phase 06):** `@murrmure/shell-ui`, `@murrmure/shell-client`, `@murrmure/shell-web`. See [shell/spec.md](../shell/spec.md).

- Bundled shell uses `VITE_MURRMURE_BUNDLED=1`.
- In bundled mode, hub URL resolution is same-origin (`window.location.origin`).
- `/connect` auto-redirects to `/spaces/new` when bundled mode already has `murrmure_token` in localStorage.
- Configure/setup wizards retired; legacy `/configure` and `/setup` redirect to `/spaces/new`.
- Local-tool setup uses `mrmr connection create`; Desktop never exposes connection token material.
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
- If first page lands on `/connect`, host-side script redirects to `/spaces/new` when token is present.
- v1 default bootstrap token remains `tok_01JBOOTSTRAPTOKEN00000001` for localhost desktop MVP.

## Electrobun host (Task 4)

### Bundled resources

Packaged Desktop copies build artifacts into `Resources/`:

| Path | Package | Role |
|------|---------|------|
| `Resources/hub/` | `@murrmure/hub-daemon` | Hub sidecar entry (`main.js`) |
| `Resources/shell/dist/` | `@murrmure/shell-web` | Bundled observer shell static |
| `Resources/mcp-bridge/` | `@murrmure/mcp-bridge` | Agent MCP stdio bridge (`main.js` → `murrmure-mcp`) |

Dev modes resolve the same bridge entry from `packages/mcp-bridge/dist/main.js` when present.

### Process lifecycle

- Main process spawns Node hub sidecar with:
  - `PORT=8787`
  - `MURRMURE_LISTEN_HOST=127.0.0.1`
  - `MURRMURE_DATA_DIR=~/.murrmure`
  - `MURRMURE_SHELL_STATIC_DIR=<shell dist>`
  - `MURRMURE_MCP_BRIDGE_ENTRY=<bundled mcp-bridge/main.js>` when the bridge artifact is present
- Startup gate: poll `GET /v1/health` until ready (timeout: 30s).
- Quit path: send `SIGTERM` to hub, wait up to 5s, then `SIGKILL` if still alive.

### Single-instance policy (D18)

- Desktop checks `{dataDir}/hub.lock/owner.json`.
- If lock owner endpoint is healthy, second launch exits early (dev path may show informational dialog).

### Menu actions

- **Copy MCP config** copies an ID-only neutral descriptor: stable
  `~/.murrmure/bin/murrmure-mcp` command plus Hub and connection arguments. It
  never copies a token or environment entry.
- **Open data folder** opens desktop data directory (`~/.murrmure` in v1).

## Environment

| Variable | Required | Meaning |
|----------|----------|---------|
| `MURRMURE_SHELL_STATIC_DIR` | Optional | Built shell static directory (`dist`) mounted by hub at `/`. |
| `MURRMURE_LISTEN_HOST` | Optional | Hub bind interface (desktop default `127.0.0.1`). |
| `MURRMURE_DATA_DIR` | Optional | Hub data directory (desktop default `~/.murrmure`). |
| `MURRMURE_MCP_BRIDGE_ENTRY` | Optional | Current absolute bundled bridge entry; launcher-only discovery. |
| `MURRMURE_MCP_BRIDGE_COMMAND` | Desktop-set | Stable per-user launcher command. |
| `MURRMURE_MCP_BRIDGE_RUNTIME` | Desktop-set | Runtime used for the current bundled entry. |
| `PORT` | Optional | Hub listen port (desktop default `8787`). |

## Discovery

Desktop/CLI discovery reads `~/.murrmure/hubs/shared.json`.
Canonical shape uses `hubs[].endpoint`; legacy flat `url` shape remains accepted.

Hub writes discovery only after effective port is known and preserves existing `flowProjects` and `mcp_bridge`.

When `MURRMURE_MCP_BRIDGE_ENTRY` is set at hub start, discovery also records:

```json
{
  "mcp_bridge": {
    "command": "/path/to/mcp-bridge/main.js"
  }
}
```

Desktop atomically installs or updates `~/.murrmure/bin/murrmure-mcp` with mode
`0700` at launch. Discovery records the stable command plus current bundled
entry/runtime. The launcher reads discovery at invocation, rejects values that
do not match its installed allowlist, and then starts the bundle. Moving or
upgrading Desktop is repaired by relaunching Desktop; client descriptors remain
unchanged.

Packaged launcher and OS credential-store support are certified on macOS only
for this release. Unsupported packaged Windows/Linux connection setup fails
explicitly and writes no integration config. Headless PATH setup is separate.

## Hub lifecycle + lock semantics (Task 3)

- `startHubDaemon(config)` exposes `shutdown()` and supports embedded mode.
- Shutdown sequence kills workers, releases lock, closes server, and closes SQLite handles.
- Lock reclaim only happens when owner PID is dead or owner health probe fails.
- Timestamp-only lock reclaim is explicitly removed.

## Startup cleanup (D23)

- On startup, stale `{dataDir}/staging/*` directories older than 7 days are deleted.
- Cleanup is best-effort and never targets blob persistence directories.

## Contributor workflow

- **Primary dev path:** `pnpm desktop:dev:hmr` — native Electrobun window, shell HMR via Vite (`:5174`), hub API-only watch (`tsx watch` on `:8787`). Vite proxies `/v1`, `/api`, `/flows` to the hub.
- **Smoke / regression:** `pnpm desktop:dev:smoke` — system browser via `dev-main.ts`, hub serves bundled shell static (single-URL path).
- Full packaged build remains optional/manual for MVP (`pnpm desktop:build`, Bun/Electrobun toolchain required).

### Dev HMR environment

| Variable | Required | Meaning |
|----------|----------|---------|
| `MURRMURE_DESKTOP_DEV_HMR` | Set by `desktop:dev:hmr` | Electrobun loads Vite shell URL instead of hub static; connects to external hub + Vite. |
| `VITE_MURRMURE_BUNDLED` | Set by `shell-web dev:bundled` | Bundled shell client mode in Vite (same-origin API via proxy). |

## Push notifications (phase 15)

When the desktop app is backgrounded (minimized or hidden), the host subscribes to hub SSE `out_of_shell.desktop` and shows a native OS notification via Electrobun `Utils.showNotification`.

| Concern | Behavior |
|---------|----------|
| Triggers | `mrmr.gate.pending` (assignees / `gate:resolve` fallback), `mrmr.run.failed` (session watchers + resolvers) |
| Suppressed | Run started, action completed, hook delivered — shell SSE covers live use |
| Focus debounce | No OS notification when the main window is visible and not minimized |
| Deep link | `murrmure://runs/{run_id}?gate={gate_id}` → shell route `/runs/{id}?gate=…` via `open-url` handler |
| User prefs | `PATCH /v1/me` fields `notify_email`, `notify_desktop` (default on; per-channel opt-out) |

Register `murrmure` URL scheme in `electrobun.config.ts` (`app.urlSchemes`).
