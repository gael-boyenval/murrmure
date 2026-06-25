# ADR-002: Desktop single-URL with Node hub sidecar

**Status:** accepted (2026-06-24)  
**Plan:** [archives/plans/murrmure-desktop-v1.md](../archives/plans/murrmure-desktop-v1.md)  
**Normative spec:** [current/desktop/spec.md](../current/desktop/spec.md)

## Context

Murrmure today runs as two processes for contributors (Vite shell on `:5174` + hub on `:8787`). End users need simpler setup: one app, one URL, hub starts and stops with the app, flows unchanged.

Electrobun runs on Bun; the hub uses `better-sqlite3` and spawns flow workers via `process.execPath`. A full Bun port of the hub is deferred.

## Decision

1. **Electrobun orchestrates only** — window, lifecycle, session bootstrap; not hub persistence or flow runtime.
2. **Node hub sidecar** — desktop main spawns bundled Node hub via `Bun.spawn`; workers stay on Node.
3. **Single origin** — hub serves `shell-web/dist` at `/` on the same port as `/v1/*`, `/api/*`, `/flows/*`; webview loads `http://127.0.0.1:8787/`, not `views://`.
4. **Fixed loopback port `8787`** in desktop mode so `localStorage` session survives restarts (D13).
5. **Bundled shell client** — `VITE_MURRMURE_BUNDLED=1`: same-origin hub URL, relative flow iframe paths, no manual hub URL in setup.
6. **CLI/MCP unchanged** — external tools discover hub via `~/.murrmure/hubs/shared.json` (`hubs[0].endpoint`).
7. **Contributor path preserved** — `pnpm dev` (Vite + hub) remains the daily dev workflow; `pnpm desktop:dev` is packaged-path smoke only.

## Security (v1 internal builds)

- `/api/*` proxy strips internal trust headers at hub edge.
- `hub-fetch` bridge allowlists paths to `/api/{flowId}/…` and whitelists safe headers.
- Per-install bootstrap secret and signed distribution are **external-release gates** (§11 in plan), not blockers for internal MVP.

## Consequences

- New private package `@murrmure/desktop` under `apps/desktop/`.
- Hub gains `MURRMURE_SHELL_STATIC_DIR`, embedded shutdown mode, improved lock reclaim (pid/health, not timestamp).
- Packaged `.app` build is scaffolded; full bundle (Node binary + native deps) is follow-up before external distribution.
- Bun unification of hub remains explicitly deferred.
