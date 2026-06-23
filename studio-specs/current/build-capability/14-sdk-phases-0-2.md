# SDK Phases 0–2 — Build assets, sim server mount, dev asset serving

**Status:** implementing (2026-06-22)  
**Scope:** `@studio/capability-sdk` build + `dev --sim` in one delivery

---

## Goals

| Phase | Outcome |
|-------|---------|
| **0 — Build completeness** | Stage full UI tree (not just `entry.js`); server bundle errors fail the build; shell asset refs validated post-build |
| **1 — Sim server mount** | `dev --sim` loads `server/mount.mjs` and serves `routes_prefix/*` like hub worker |
| **2 — Dev asset loop** | Sim serves staged UI first, source `ui/` fallback; watch already covers static edits via rebuild |

**Not in scope:** preview proxy (Phase 4), CLI dist bin (Phase 3), dev-kit precompile (Phase 5).

---

## Phase 0 — Build

### 0.1 Copy UI static assets

After esbuild produces `ui/entry.js`, copy from source `ui/` → stage `ui/`:

- **Include:** everything under `ui/` except `ui/src/`
- **Exclude:** `ui/src/` (bundled into `entry.js`)
- **Optional manifest:** `ui.assets: string[]` — explicit relative paths under `ui/` instead of default copy-all

`shell.html` and `entry.js` remain authoritative: build writes/bundles them after copy (copy must not clobber `entry.js` if present in source — skip `entry.js` in copy).

### 0.2 Server bundle loud failure

Mirror UI: `catch` → `{ ok: false, errors: [{ code: "SERVER_BUNDLE_FAILED", … }] }`.

### 0.3 Post-build shell asset validation

Parse `ui/shell.html` for relative `src="./…"` and `href="./…"`; fail post-build with `UI_ASSET_MISSING` if missing in stage `ui/`.

---

## Phase 1 — Dev sim server mount

### 1.1 In-process capability mount

New module `dev-sim/capability-mount.ts`:

- Dynamic `import()` of `{stageDir}/server/mount.mjs`
- Minimal Hono-like router (same as `capability-worker-entry.js`)
- Stub `CapabilityServerContext` + sim hub bridge

### 1.2 Route wiring in sim HTTP server

| Path pattern | Handler |
|--------------|---------|
| `{routes_prefix}/*` | Capability mount (direct HTTP) |
| `POST /__sim/hub-fetch` with path under `{routes_prefix}` | Capability mount |
| `/sim/*` | Existing install/instance FSM |
| `/capability/ui/*` | Static UI (phase 2 fallback) |

### 1.3 Hot reload

On `reload()`, re-import `mount.mjs` and replace route table; SSE `capability.dev_reload` unchanged.

---

## Phase 2 — Dev asset serving

### 2.1 Staged-first, source-fallback

For `GET /capability/ui/*`:

1. `{stageDir}/ui/{path}`
2. `{sourceDir}/ui/{path}` (dev-only)

### 2.2 Watch

Existing `watch(sourceDir, { recursive: true })` + debounced rebuild copies static assets on change — no separate watcher needed.

---

## Acceptance

- [x] Capability with `ui/crit/style.css` linked from `shell.html` builds and validates
- [x] Broken `server/index.ts` fails build with `SERVER_BUNDLE_FAILED`
- [x] `dev --sim` responds on `{routes_prefix}/health` from scaffold server
- [x] `hub-fetch` to capability API path works in sim
- [x] Static asset 404 fixed after build (assets in stage)
- [x] Docs updated: build layout, `--sim` server routes, UI static convention
