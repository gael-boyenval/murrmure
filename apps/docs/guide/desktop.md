# Murrmure Desktop

Murrmure Desktop is the **primary human surface**. It bundles a local hub sidecar and the observer shell in one native app (Electrobun).

- Electrobun main process starts and stops the hub sidecar
- Hub serves the API on `http://127.0.0.1:8787`
- Shell UI loads in the desktop webview (packaged) or via Vite HMR in dev
- Desktop injects a bootstrap token so first run lands on `/spaces/new` — no manual token paste

## Install and run

### Packaged app (recommended)

Build and open the native artifact:

```bash
pnpm desktop:build
# open the artifact from apps/desktop/artifacts (requires Electrobun toolchain locally)
```

### Monorepo dev — native window + HMR (contributors)

Prerequisites: Node 20+, pnpm workspace install, Bun (`bun --version`).

```bash
pnpm desktop:dev:hmr
```

This starts three processes:

1. **Hub** — `tsx watch` on `http://127.0.0.1:8787` (API only)
2. **Shell** — Vite on `http://127.0.0.1:5174` with bundled proxy to hub (`/v1`, `/api`, `/flows`)
3. **Electrobun** — native window loading the Vite URL with HMR

Use this for day-to-day shell and hub development inside a real desktop window.

### Smoke test (single URL, no HMR)

```bash
pnpm desktop:dev:smoke
```

Rebuilds bundled shell + hub, serves both on `http://127.0.0.1:8787`, and opens your system browser. Useful for CI-style regression checks — not the primary dev loop.

## First run and authentication

Desktop users **do not paste tokens**. On first launch:

1. Desktop validates the local bootstrap token (`tok_01JBOOTSTRAPTOKEN00000001`) against `GET /v1/auth/whoami`
2. The webview stores `murrmure_token` and `murrmure_hub_url` in local storage
3. You land on **`/spaces/new`** — follow the on-screen hint or run `mrmr setup` in a terminal

The **`/spaces/new`** page and `mrmr setup` share the same handoff: after link + apply, open Desktop → space home → **Run**. Checkpoint steps open your flow's **ViewCanvasHost** custom view — shell chrome is operator mode, not the primary human surface.

| Actor | How to authenticate |
|-------|----------------------|
| **Desktop human** | Bootstrap token auto-injected — no `/connect` paste |
| **Participant (MCP)** | Accept setup connection consent; credential stays in macOS Keychain |
| **CLI operator** | `mrmr login` (bootstrap first time) → saved operator credentials |

The **`/connect`** route exists for contributor debugging only. End users on Desktop never need it.

## App menu

- **Copy MCP config** — stable launcher plus Hub/connection IDs; no token
- **Open data folder** — opens `~/.murrmure`

## Out-of-shell notifications

When the desktop window is minimized or hidden, Murrmure can show **native OS notifications** for gate and run events. The desktop process subscribes to the hub journal via SSE (`/v1/auth/sse-ticket` → `/v1/journal/subscribe`) and surfaces:

- Pending gates that need human approval
- Failed runs that need attention

Clicking a notification navigates the webview using the `murrmure://` URL scheme (see below).

## `murrmure://` deep links

Desktop registers the `murrmure://` URL scheme. Deep links map to shell routes, for example:

| Deep link | Shell route |
|-----------|-------------|
| `murrmure://runs/{runId}` | `/runs/{runId}` |
| `murrmure://runs/{runId}?gate={gateId}` | `/runs/{runId}?gate={gateId}` |
| `murrmure://notifications` | `/notifications` |

Used by OS notifications and external integrations to focus the desktop window on the right session or gate.

## Flows (single origin)

Flow canvas loads from `GET /flows/{flow_id}/{version}/ui/shell.html`. Worker routes run through the hub proxy at `/api/{flow_id}/…`. Shell, flow iframe, and API share one origin — no separate shell URL setup.

CLI flow development is unchanged: keep Desktop open, then run `mrmr flow dev`, `mrmr space apply`, etc. The CLI reads `~/.murrmure/hubs/shared.json` to target the active desktop hub.

## Data and logs

- Hub data dir: `~/.murrmure` (`MURRMURE_DATA_DIR` override)
- Hub lock owner: `~/.murrmure/hub.lock/owner.json`
- Hub DB: `~/.murrmure/murrmure.db` (`DATABASE_PATH` — set by the desktop sidecar at spawn)

## Troubleshooting

- **Hub health timeout** — another process may be using port `8787`
- **Already running** — close the other desktop/hub instance (lock file in `~/.murrmure`)
- **Missing shell dist** — run `pnpm --filter @murrmure/shell-web build:bundled`
- **Missing hub dist** — run `pnpm --filter @murrmure/hub-daemon build`
- **Native API unavailable** — run `pnpm desktop:dev:hmr` via `electrobun dev`, not plain Node

## Next

- [Quick start](./quick-start) — Desktop → `mrmr setup` → Run
- [CLI](./cli) — setup, connections, and automation
- [Shell UI routes](./shell-routes) — observer screens inside Desktop
- [Connect your agent](./agents-mcp)
