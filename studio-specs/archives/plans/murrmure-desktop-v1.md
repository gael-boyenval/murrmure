# Murrmure Desktop v1 — Electrobun shell, single URL, hub lifecycle

**Status:** executed (2026-06-24)  
**Archived to:** `studio-specs/archives/plans/murrmure-desktop-v1.md`  
**Normative spec:** `studio-specs/current/desktop/spec.md`  
**ADR:** [ADR-002-desktop-single-url.md](../../ADR/ADR-002-desktop-single-url.md)  
**Packages:** `@murrmure/desktop` (new, private), `@murrmure/hub-daemon`, `@murrmure/shell-web` (private)  
**Aligns with:** [agent.md](../../../agent.md) phase 2 → 3  
**Normative output (created during execution):** `studio-specs/current/desktop/spec.md`

---

## 0. Reader context (for agents without chat history)

This plan was produced after a product conversation about packaging Murrmure as a desktop app. Key outcomes:

| Topic | Decision |
|-------|----------|
| **Primary goal** | Simpler config — user opens one app, one URL; no separate shell port vs hub port |
| **Daemon lifecycle** | Hub **starts when the app opens**, **stops when the app quits** (workers killed, lock released) |
| **Flows** | **Must work identically** — install, apply, canvas iframe, `hubFetch`, MCP tools, worker proxy; no flow-author or FDK changes |
| **Runtime for hub** | **Keep Node** for hub + workers (`better-sqlite3` native addon blocks Bun today) |
| **Electrobun role** | Window + lifecycle orchestration only; **not** a rewrite of hub persistence or flow runtime |
| **Single URL approach** | Hub serves `shell-web` static assets at `/` on the same port as `/v1/*`, `/api/*`, `/flows/*` |
| **Webview loading** | Load **`http://127.0.0.1:<port>/`** in the webview — **not** `views://` while flows load from `http://` (cross-origin breaks iframes + CSP) |
| **Hub URL config** | Desktop mode: **no manual hub URL** in `/connect` or setup wizard; default to `window.location.origin` |
| **CLI / MCP** | **Stay external** (`mrmr`, `murrmure-mcp`); they discover hub via `~/.murrmure/hubs/shared.json` (already written by hub on start) |
| **Bun unification** | **Explicitly deferred** — optional future work to port SQLite to `bun:sqlite`; not in this plan |
| **Data directory** | Default `~/.murrmure/` unchanged; desktop may set `MURRMURE_DATA_DIR` under app support later (Task 3) |
| **Publishable npm** | **None** — all touched packages are private; no changeset |

### Why flows still work (do not re-architect)

Current flow path (unchanged by this plan):

```
Shell page
  └── iframe → /flows/{flowId}/{version}/ui/shell.html     (hub static route)
        └── hubFetch("/api/...")                           (relative paths)
              └── parent postMessage bridge → hub
                    └── hub proxies /api/* → worker 127.0.0.1:18xxx
                          └── capability-worker-entry.js → mount.mjs
```

Workers are **never** exposed to the browser. Single origin (shell + iframe both on hub port) **improves** CSP (`connect-src 'self'`) and preview policy — no flow code changes required.

Reference code:

- Hub flow static: `packages/studio-hub-daemon/src/routes/flow-static.ts`
- Hub worker proxy: `packages/studio-hub-daemon/src/routes.ts` (`app.all("/api/*", …)`)
- Worker spawn: `packages/studio-hub-daemon/src/flow-worker-pool.ts` (`spawn(process.execPath, …)`)
- Shell iframe host: `packages/shell-web/src/FlowCanvasHost.tsx`
- Flow bridge: `examples/capabilities/feature-spec/ui/shell.html` (`hubFetch` → postMessage)

### Current dev layout (what we are replacing for end users)

| Process | Port | Role |
|---------|------|------|
| `shell-web` (Vite) | 5174 | React UI; proxies `/v1`, `/api` → 8787 |
| `hub-daemon` | 8787 | HTTP, SSE, MCP, flows, workers |

**Contributors** keep `pnpm dev` (two processes). **Desktop users** get one process tree: Electrobun → Node hub → webview at hub URL.

### Electrobun constraints (from official docs)

- Main process runs on **Bun**; hub runs as **bundled Node sidecar** spawned via `Bun.spawn`
- Extra binaries go in app bundle `Contents/MacOS` (macOS); use `postBuild` hook in `electrobun.config.ts`
- Builds are **per-host OS** (CI matrix for macOS / Windows / Linux)
- Dev launcher routes Bun/Zig output to terminal

### Source of truth hierarchy

| Priority | Source | Use for |
|----------|--------|---------|
| 1 | **This plan** | Scope, slices, desktop UX |
| 2 | **Hub daemon routes** — `packages/studio-hub-daemon/src/` | HTTP paths, flow proxy, static routes |
| 3 | **`studio-specs/current/desktop/spec.md`** | Normative desktop spec (created Task 1) |
| 4 | **`studio-specs/current/build-capability/03-shell-host.md`** | Canvas iframe contract |
| 5 | **`studio-specs/current/hub/architecture.md`** | Hub topology (fix Node vs Bun drift in Task 5) |
| 6 | **`apps/docs/guide/self-hosted.md`** | Operator vs desktop user paths |

**Known spec drift to fix during execution:**

| Stale | Correct |
|-------|---------|
| `hub/architecture.md` says "Bun HTTP" for hub-daemon | Implementation uses **Node** + `@hono/node-server` |
| `build-capability/03-shell-host.md` path `/capabilities/{pkg}/…` | Wire uses **`/flows/{flow_id}/{version}/ui/…`** |
| Self-hosted docs assume shell `:5174` + hub `:8787` | Add **desktop single-URL** mode alongside dev two-process layout |

### Execution model ([agent.md](../../../agent.md))

Orchestrator delegates ~90% to dev subagents. After each slice: 3 parallel review subagents (scope/contract, failure/trust, experience/craft); synthesize fixes; repeat until green. Each slice includes **code + tests + `apps/docs` + `studio-specs/current`** in one pass. End each slice with:

```bash
pnpm typecheck && pnpm build && pnpm test
```

Include `pnpm test:acceptance` when the slice touches hub HTTP or flow runtime (Tasks 1, 3, 5).

**Changeset:** none (private packages only).

---

## 0b. Plan review synthesis (2026-06-24)

Three parallel high-thinking reviews (scope/architecture, security/trust, UX/DX). **Verdict:** direction is sound — single-origin hub-static + Node sidecar + Electrobun orchestrator is the right v1. **Do not execute until blockers below are incorporated** (several are pre-existing bugs the desktop path exposes).

### Blockers (must fix in plan)

| ID | Issue | Evidence | Plan fix |
|----|-------|----------|----------|
| **B1** | **Dynamic port wipes session** — `localStorage` is origin-scoped; `PORT=0` changes origin every launch → user re-authenticates | `shell-web/src/storage.ts`, D8 | **D13:** desktop uses **fixed port `8787`** on `127.0.0.1` (or inject session via Electrobun RPC + skip localStorage — fixed port is simpler for v1) |
| **B2** | **Packaged hub crashes on seed contracts** — `main.ts` reads repo-relative `fixtures/hub/contracts/` | `packages/studio-hub-daemon/src/main.ts:27-58` | **Task 4:** `postBuild` copies seed contracts into bundle; `main.ts` resolves via `import.meta.url` / `MURRMURE_BUNDLE_ROOT`, not monorepo path |
| **B3** | **Discovery schema mismatch (pre-existing)** — hub writes `hubs[].endpoint`; CLI reads top-level `url` + `token` | `ops.ts` vs `cli/src/auth.ts` | **Task 1 or 3:** align CLI to read `hubs[0].endpoint`; document schema in `desktop/spec.md`; optional: hub never stores tokens in shared.json |
| **B4** | **`process.exit(0)` kills embedded host** — shutdown handler always exits | `main.ts:122-128` | **Task 3:** `embedded: true` → `shutdown()` without `process.exit`; SIGTERM from Electrobun is enough for sidecar |
| **B5** | **Lock stale after 30s allows split-brain** — timestamp staleness reclaims lock even if pid alive | `ops.ts:84-99` | **Task 3:** reclaim only when **pid dead OR health check fails**; never timestamp-only; add regression test |
| **B6** | **No desktop first-run auth** — hiding hub URL still leaves bootstrap token paste | `SetupWizard.tsx` | **Task 2b (new):** desktop auto-session — host mints/obtains human token, passes to webview (query nonce or Electrobun RPC); skip `/connect` in bundled mode |
| **B7** | **Hub start failure = blank webview** | Task 4 gap | **Task 4:** native error dialog + log path before opening window |

### Pre-existing security (do not regress; tighten in desktop v1 where cheap)

| Issue | Desktop impact | v1 action |
|-------|----------------|-----------|
| `/api/*` proxies browser headers to worker without hub auth | Same-origin + drive-by POST risk | **Task 5:** document; **v1.1:** require bearer or signed bridge token on `/api` |
| `hub-fetch` postMessage `"*"` + unrestricted paths | Malicious flow UI can proxy admin APIs with shell token | **Task 2:** allowlist paths to `/api/{flowId}/…` only; reject `/v1`, `/internal` |
| Host-bridge `system` fallback + `X-Murrmure-Internal-Space` | Worker/browser header injection | **Task 5:** strip internal headers at hub edge on `/api` proxy |
| Static bootstrap token default | Known secret on localhost | **Task 2b:** per-install bootstrap file in app support (mode 0600), not hardcoded in bundle |

### Architecture review — affirmed

- Node sidecar (not Bun port) — correct for `better-sqlite3` + `process.execPath` workers
- Hub serves shell at `/` — better than Electrobun reverse-proxy or split origins
- Flow runtime unchanged — proxy + iframe model holds
- Hexagon boundaries — no hub-core / FDK violations in plan

### Packaging opportunities (prioritized)

| Priority | Opportunity | Task |
|----------|-------------|------|
| **v1** | Menu: Copy MCP config (reads live `shared.json` endpoint) | Task 4 |
| **v1** | Menu: Open data folder (`~/.murrmure` or app support) | Task 4 |
| **v1** | Single-instance — second launch focuses existing window | Task 4 |
| **v1** | Native error UI on hub boot failure | Task 4 |
| **v1.1** | Tray icon + "hub running" status | follow-up |
| **v1.1** | OS notification on `gate.pending` (subscribe SSE in Bun main) | follow-up |
| **v1.1** | Bundled demo flows on first run | follow-up |
| **v1.1** | Electrobun auto-update | follow-up |
| **defer** | Keychain token storage (replace localStorage) | v1.1 |

### Temp files & data lifecycle (new policy — §9)

See [§9 Data, temp files & cleanup](#9-data-temp-files--cleanup) added below.

### Task reslicing (from review)

| Change | Reason |
|--------|--------|
| Add **Task 2b — Desktop session bootstrap** | B6; without it "simple config" goal fails |
| Merge flow smoke into **Task 1** smoke (minimal) + keep **Task 5** full chain | Earlier signal on `/flows` vs SPA catch-all |
| Split **Task 4** acceptance: bundle layout test before GUI manual | B2 caught earlier |
| **Task 3** before **Task 4** — non-negotiable (embedded shutdown, lock, discovery) | B4, B5, B3 |

---

## 1. Goals

1. **One URL for humans** — opening Murrmure loads shell + API + flow assets from a single origin.
2. **Hub tied to app lifecycle** — no orphaned hub after quit; flow workers terminated on shutdown.
3. **Flows unchanged** — existing bundles, iframe bridge, worker pool, MCP dispatch behave as today.
4. **Simpler first-run** — no hub URL field when running the desktop app.
5. **CLI/MCP compatibility** — external tools find the running hub via existing discovery file.
6. **Contributor path preserved** — `pnpm dev` (Vite + hub) continues to work for monorepo development.

---

## 2. Resolved technical decisions

| # | Topic | Decision |
|---|-------|----------|
| D1 | Hub runtime | **Node 20+** sidecar; bundle `node` + compiled `hub-daemon` in desktop app |
| D2 | Shell delivery | Hub serves **`shell-web/dist`** at `/`; SPA fallback for client routes |
| D3 | Route precedence | Register `/v1/*`, `/api/*`, `/flows/*`, `/internal/*` **before** static `/` catch-all |
| D4 | Static root env | `MURRMURE_SHELL_STATIC_DIR` — absolute path to built shell `dist/`; unset = hub-only (current behavior) |
| D5 | Same-origin client | `getStoredHubUrl()` returns `window.location.origin` when `import.meta.env.VITE_MURRMURE_BUNDLED === "1"` or path `/connect` skipped |
| D6 | Desktop detect (shell) | Build flag `VITE_MURRMURE_BUNDLED=1` when building shell for hub/desktop bundle |
| D7 | Embedded hub shutdown | `startHubDaemon()` returns `{ shutdown }` that kills workers + releases lock **without** `process.exit(0)` when `embedded: true` |
| D8 | Desktop port | Hub binds **`127.0.0.1:8787` (fixed)** in desktop mode — avoids localStorage origin churn (see B1). Dev/CLI may still override via `PORT`. |
| D9 | Electrobun webview URL | `http://127.0.0.1:8787/` after health check — never load shell from `views://` while flows use HTTP |
| D10 | CORS | When shell is same-origin, CORS is irrelevant for shell; keep existing localhost CORS for dev Vite origin |
| D11 | Monorepo tooling | `apps/desktop` uses **bun** for Electrobun (`bun install electrobun`); rest of monorepo stays **pnpm**; root script `desktop:dev` orchestrates build + bun dev |
| D12 | CI | Desktop **build** job on macOS runner (manual/nightly initially); unit/acceptance tests run without Electrobun where possible |
| D13 | Session persistence | Fixed loopback port **8787** for desktop v1 (not `PORT=0`) so `localStorage` auth survives restarts |
| D14 | Discovery schema | `shared.json` canonical shape: `{ hubs: [{ endpoint, pid, … }], flowProjects: [...] }`; CLI reads `hubs[0].endpoint` for URL (token from credentials only) |
| D15 | Bundled seed contracts | Ship `fixtures/hub/contracts/*.json` inside app bundle; hub resolves path relative to bundle root |
| D16 | Desktop auth | Bundled mode skips `/connect`; host establishes session token and injects into first navigation (one-time bootstrap exchange) |
| D17 | `hub-fetch` allowlist | Parent shell only forwards paths under mounted flow's `/api/{flowId}/…` prefix |
| D18 | Single-instance | Second app launch focuses existing window; does not start second hub |
| D19 | Data dir (desktop) | v1: keep `~/.murrmure` for CLI compatibility; document path; v1.1 optional `~/Library/Application Support/Murrmure` |
| D20 | Hub boot errors | Electrobun shows native dialog + `~/Library/Logs/Murrmure/hub.log` (platform-specific) before any webview |
| D21 | Lock semantics | Reclaim lock only if owner **pid is dead** or **GET owner.endpoint/v1/health fails** — not timestamp-only |
| D22 | Sidecar shutdown | Desktop quit: SIGTERM sidecar → wait exit → force kill after 5s; sidecar `embedded: false` (separate process) |
| D23 | Staging cleanup | On hub startup: delete `staging/` entries older than 7 days (configurable); never delete referenced blob digests |
| D24 | Distribution trust | External DMG/release requires signed app + signed Node sidecar + notarization (internal dev builds exempt) |
| D25 | Contributor path | `pnpm dev` unchanged; `pnpm desktop:dev` documented as packaged-path smoke only |

---

## 3. Target topology

```
┌─────────────────────────────────────────────────────────┐
│  Murrmure.app (Electrobun / Bun main)                   │
│    on launch:  Bun.spawn(node, hub-entry, env…)         │
│    on quit:    shutdown() → SIGTERM hub                   │
│    webview:    http://127.0.0.1:<port>/                   │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  hub-daemon (Node) — single listen port                   │
│    GET  /              → shell-web static (index.html)  │
│    GET  /configure/…   → SPA fallback → index.html      │
│    *    /v1/*          → platform API                     │
│    *    /api/*         → flow worker proxy                │
│    GET  /flows/*/ui/*  → flow bundle static               │
│    spawn workers       → capability-worker-entry.js       │
└─────────────────────────────────────────────────────────┘

External (unchanged):
  mrmr / murrmure-mcp  →  reads ~/.murrmure/hubs/shared.json  →  same port
```

---

## 4. Task slices

Each task is a **vertical slice** that leaves the product working. Format: **Goal → User story → Work → Done when**.

---

### Task 1 — Hub serves shell on one port

**Goal:** A running hub can serve the built shell UI at `/` on the same port as `/v1/health`, so operators (and later the desktop app) need only one URL — without Electrobun yet.

**User story:** As a **self-hosted operator**, I want to point users at a single `http://host:8787/` URL after building the shell, so I don't run two processes or configure a reverse proxy for dev demos.

**Work**

- **`packages/studio-hub-daemon/src/routes/shell-static.ts`** (new):
  - If `config.shellStaticDir` set, serve files from that directory
  - `GET` assets with correct MIME
  - SPA fallback: unknown non-API paths → `index.html` (exclude `/v1`, `/api`, `/flows`, `/internal`)
- **`packages/studio-hub-daemon/src/context.ts`** — add `shellStaticDir?: string` to `DaemonConfig`
- **`packages/studio-hub-daemon/src/main.ts`** — read `MURRMURE_SHELL_STATIC_DIR`; pass to config; mount shell routes **after** API routes in `createHubApp`
- **Discovery alignment (B3):** update `packages/cli/src/auth.ts` — resolve hub URL from `shared.json` → `hubs[0].endpoint` when present; add test with hub-shaped file
- **Tests** (`packages/studio-hub-daemon/test/http/shell-static/`):
  - With fixture `dist/` (minimal `index.html` + asset): `GET /` → 200 HTML
  - `GET /v1/health` still 200 when static enabled
  - `GET /configure/spaces/x` → SPA fallback `index.html`
  - `GET /flows/...` not swallowed by SPA fallback (existing flow-static tests still pass)
- **`studio-specs/current/desktop/spec.md`** (create skeleton): goals, single-URL topology, env vars `MURRMURE_SHELL_STATIC_DIR`, out-of-scope (Bun port)
- **`apps/docs/guide/self-hosted.md`** — add subsection "Single URL (bundled shell)" with build + env instructions
- **`studio-specs/plans/README.md`** — index this plan

**Done when**

- `pnpm typecheck && pnpm build && pnpm test && pnpm test:acceptance` green
- Manual: `pnpm --filter @murrmure/shell-web build && MURRMURE_SHELL_STATIC_DIR=packages/shell-web/dist pnpm --filter @murrmure/hub-daemon start` → browser at `:8787/` shows shell
- `studio-specs/current/desktop/spec.md` exists with Task 1 sections filled

**Changeset:** none

---

### Task 2 — Shell same-origin mode (no hub URL config)

**Goal:** When the shell is served from the hub origin, it uses relative API paths and hides manual hub URL entry — flows and configure screens work without `murrmure_hub_url` in localStorage.

**User story:** As a **Murrmure desktop user**, I want to open the app and land in setup without pasting `http://127.0.0.1:8787`, so first-run matches a normal desktop product.

**User story:** As a **flow reviewer**, I want the canvas iframe and `hubFetch` to keep working when shell and hub share one origin, so I don't notice any difference from today's dev setup.

**Work**

- **`packages/shell-web/src/hooks.ts`**:
  - `getStoredHubUrl()`: if `import.meta.env.VITE_MURRMURE_BUNDLED === "1"`, return `window.location.origin`
  - Else existing behavior (`localStorage` → default `http://127.0.0.1:8787`)
- **`packages/shell-web/src/App.tsx`**, **`SetupWizard.tsx`**, **`GrantList.tsx`**: hide hub URL input when bundled; MCP snippet uses `window.location.origin`
- **`FlowCanvasHost.tsx`**: iframe `src` = `/flows/...` (relative) when bundled; keep absolute when dev cross-origin
- **`FlowCanvasHost.tsx` (security D17):** `hub-fetch` handler rejects paths not matching `/api/{packageId}/` prefix
- **`packages/shell-web/package.json`**: script `build:bundled` → `VITE_MURRMURE_BUNDLED=1 vite build`
- **Hub desktop build helper** (script or doc): `build:bundled` then set `MURRMURE_SHELL_STATIC_DIR`
- **Tests** (`packages/shell-web` or vitest project if added):
  - Unit test `getStoredHubUrl` with mocked `import.meta.env` and `window.location`
- **`studio-specs/current/build-capability/03-shell-host.md`** — add "Bundled / desktop mode" section: same-origin, relative iframe, `hubUrl` in init ctx = origin
- **`apps/docs/guide/self-hosted.md`** — note bundled shell skips `/connect` hub URL step
- **`studio-specs/current/desktop/spec.md`** — shell client behavior section

**Done when**

- `pnpm typecheck && pnpm build && pnpm test` green
- Task 1 manual path + bundled shell: `/connect` flow works with token only; flow canvas loads (install example flow if needed)
- Dev path unchanged: `pnpm dev` still uses Vite proxy + stored hub URL

**Changeset:** none

---

### Task 2b — Desktop session bootstrap (skip `/connect`)

**Goal:** First double-click reaches setup wizard **authenticated** — no bootstrap token paste, no `/connect` screen in bundled mode.

**User story:** As a **solo builder opening Murrmure for the first time**, I want the app to set up my workspace automatically, like any desktop product, without copying tokens from docs.

**User story:** As a **returning user**, I want my session to persist across app restarts on the same machine.

**Work**

- **`apps/desktop/src/session.ts`** (or hub helper):
  - On first launch: read or generate per-install bootstrap secret in app support (`bootstrap.secret`, mode 0600) — replaces hardcoded `01JBOOTSTRAP…` for desktop only
  - Exchange bootstrap for human-scoped token via hub API (or use pre-seeded setup token from first-run endpoint)
  - Navigate webview to `http://127.0.0.1:8787/setup?…` or inject token via Electrobun → webview RPC → `setStorageItem('murrmure_token', …)` **before** shell loads
- **`packages/shell-web`**: when `VITE_MURRMURE_BUNDLED=1`, skip `/connect` route — redirect to `/setup` or `/configure` if token present
- **`GrantList.tsx` MCP snippet:** use `window.location.origin` (dynamic port safe because D13 fixed 8787)
- **Tests:** bundled-mode redirect logic; desktop session helper unit tests (mock fetch)
- **`studio-specs/current/desktop/spec.md`** — first-run state machine
- **`apps/docs/guide/desktop.md`** — first run vs returning user (section outline in §10 below)

**Done when**

- Manual desktop dev: open app → lands on setup wizard without token paste
- Restart app → still authenticated (localStorage on fixed origin)
- `pnpm typecheck && pnpm build && pnpm test` green

**Changeset:** none

---

### Task 3 — Embeddable hub lifecycle (start/stop without exit)

**Goal:** The hub daemon exposes a clean programmatic lifecycle for the desktop host: start, health, shutdown — killing workers and releasing the lock without terminating the parent Electrobun process.

**User story:** As the **desktop app host**, I need to stop the hub when the user quits Murrmure, so flow worker subprocesses don't keep running and block the next launch.

**Work**

- **`packages/studio-hub-daemon/src/main.ts`**:
  - `startHubDaemon(config)` accepts `embedded?: boolean` (for in-process tests only; **desktop uses separate sidecar process per D22**)
  - Return `{ handler, server, db, ctx, shutdown, port }` where `shutdown()` = `workerPool.killAll()` + `releaseLock()` + close HTTP server + close DB connections
  - SIGINT/SIGTERM handlers call `shutdown()` then `process.exit(0)` only when **not** embedded
- **`packages/studio-hub-daemon/src/ops.ts` (B5/D21):** fix `acquireLock` — remove timestamp-only stale reclaim; reclaim when pid dead OR health unreachable
- **`packages/studio-hub-daemon/src/context.ts`** — `listenHost?: string` default `127.0.0.1`; assert bind is loopback in desktop mode
- **Startup cleanup (D23):** optional `cleanupStaleStaging(dataDir, maxAgeDays)` on hub start
- **Log actual bound port** after listen; `writeDiscovery(config, actualPort)` — preserve `flowProjects` in shared.json
- **Seed contracts (B2):** resolve fixture path from `MURRMURE_BUNDLE_ROOT` env set by desktop launcher
- **Tests** (`packages/studio-hub-daemon/test/`):
  - Embedded start → health → shutdown → second start succeeds (lock released)
  - **Lock held >30s with live pid → second start returns 409** (split-brain regression)
  - Existing worker-crash-supervision test still passes
- **`packages/studio-hub-daemon/bin/murrmure-hub`** — CLI entry unchanged (non-embedded)
- **`studio-specs/current/desktop/spec.md`** — lifecycle + discovery sections
- **`apps/docs/reference/environment.md`** — document `MURRMURE_SHELL_STATIC_DIR`, embedded mode (operator note)

**Done when**

- `pnpm typecheck && pnpm build && pnpm test && pnpm test:acceptance` green
- Vitest: embedded shutdown allows immediate re-acquire of hub lock
- `studio-specs/current/desktop/spec.md` lifecycle section complete

**Changeset:** none

---

### Task 4 — Electrobun desktop app (MVP)

**Goal:** Ship a minimal `Murrmure.app` (macOS first) that starts the hub, waits for health, opens a window at the single URL, and stops the hub on quit.

**User story:** As a **solo builder**, I want to double-click Murrmure and use Configure + Runtime + flow canvas without running `pnpm dev` or configuring ports.

**Work**

- **`apps/desktop/`** (new):
  - `package.json` — `name: "@murrmure/desktop"`, private, depends on `electrobun`
  - `electrobun.config.ts` — app name, icon placeholder, views entry (optional splash); **main entry** `src/main.ts`
  - `src/main.ts`:
    1. Single-instance check (D18) — if hub lock held and healthy, focus window and exit
    2. Resolve paths to bundled `node`, `hub-daemon/dist/main.js`, `shell-web/dist`, seed contracts
    3. `Bun.spawn([node, hubEntry], { env: { MURRMURE_SHELL_STATIC_DIR, PORT: "8787", MURRMURE_DATA_DIR, MURRMURE_BUNDLE_ROOT, … } })`
    4. Poll `GET http://127.0.0.1:8787/v1/health` (max 30s)
    5. Run session bootstrap (Task 2b) → open `BrowserWindow`
    6. On quit: SIGTERM sidecar → await exit (5s timeout → SIGKILL)
  - **`src/menus.ts`:** Copy MCP config, Open data folder, Open logs
  - **`src/errors.ts`:** native dialog if health poll fails; show log path (D20)
  - `scripts/postBuild.ts` — copy hub dist, shell dist, `capability-worker-entry.js`, **seed contracts**, node binary
- **Root `package.json`**: scripts `desktop:build` (build shell:bundled + hub + bun run electrobun build), `desktop:dev`
- **`.gitignore`** — desktop build artifacts if needed
- **Tests** (lightweight):
  - `apps/desktop/test/lifecycle.test.ts` — mock spawn + health poll logic (no GUI in CI)
- **`apps/docs/guide/desktop.md`** (new) — see §10 outline
- **`apps/docs/.vitepress/config.ts`** — nav link to Desktop guide
- **`studio-specs/current/desktop/spec.md`** — Electrobun packaging, bundle layout, platform support matrix (macOS v1; Win/Linux follow-up)
- **`studio-specs/current/product/spec.md`** — add desktop app under "In" scope

**Done when**

- `pnpm typecheck && pnpm build && pnpm test` green (desktop unit tests)
- **Manual on macOS:** `pnpm desktop:dev` opens window; setup wizard works without token paste; quit app → hub process gone
- Hub boot failure shows native error (kill hub binary manually to test)
- Menu actions: copy MCP JSON with `http://127.0.0.1:8787`
- Docs page exists and links from self-hosted guide

**Changeset:** none

**Out of scope for Task 4:** Windows/Linux builds, auto-updater, notarization CI (required only for external release per D24)

---

### Task 5 — Flow smoke acceptance (desktop path)

**Goal:** Prove end-to-end that **flows behave the same** on the single-URL path: static UI, iframe bridge, `/api` worker proxy, SSE reload signal.

**User story:** As a **release verifier**, I want an automated test that installs a fixture flow and hits canvas + API routes through the bundled layout, so we don't regress flow runtime when changing shell static serving.

**Work**

- **`packages/studio-hub-daemon/test/http/desktop/single-url-flow-smoke.test.ts`** (new):
  - Start hub with `shellStaticDir` + fixture flow install (reuse `helpers/example-install.ts` / feature-spec)
  - Assert `GET /flows/{id}/{ver}/ui/shell.html` 200
  - Assert `GET /api/...` proxied to worker (reuse patterns from `phase2-full-chain.test.ts`)
  - Assert `GET /` returns shell HTML containing root mount
- **Security smoke:** `/api` proxy strips `X-Murrmure-Internal-Space` from external requests (if implemented in Task 5)
- **Packaged path smoke (B2):** hub starts with `MURRMURE_BUNDLE_ROOT` pointing at test bundle dir containing seed contracts
- **Optional fixture:** `studio-specs/current/fixtures/desktop/single-url-flow-smoke.json`
- **`studio-specs/current/flow-runtime/spec.md`** — note single-URL desktop is transparent to flow runtime
- **`apps/docs/guide/desktop.md`** — "Flows" section: same install/apply/canvas; CLI `mrmr flow dev` still targets discovery URL
- **`studio-specs/current/hub/architecture.md`** — fix "Bun HTTP" → Node; add desktop adapter line in topology diagram
- **`studio-specs/plans/README.md`** — mark plan in progress / ready for execution

**Done when**

- `pnpm typecheck && pnpm build && pnpm test && pnpm test:acceptance` green
- New acceptance test passes in CI
- Spec drift (Bun HTTP, `/capabilities/` paths in BC3) corrected or cross-linked

**Changeset:** none

---

## 5. Out of scope (explicit)

| Item | Reason |
|------|--------|
| Bun migration / `bun:sqlite` | Deferred; Node sidecar sufficient for v1 |
| Bundle `@murrmure/cli` inside desktop app | External tools; discovery already works |
| Cloud shell / BFF | See `studio-specs/plans/cloud/` |
| Auto-update (Electrobun bsdiff) | Task 4+ follow-up |
| Windows/Linux desktop builds | macOS MVP first (D12) |
| Replace postMessage `hub-fetch` bridge | Works same-origin; optimization only |
| TLS termination | Localhost-only desktop v1 |

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| SPA catch-all swallows `/api` or `/flows` | Strict path prefix exclusion; Task 1 + 5 tests |
| Electrobun webview cross-origin with flows | Load webview at hub HTTP URL (D9) |
| Orphan hub after crash | Desktop reaps sidecar on launch; lock reclaim per D21 (pid/health, not timer) |
| `better-sqlite3` native rebuild per OS | Build hub on each platform CI runner; postBuild copies correct binary |
| pnpm + bun dual package managers | Isolate `apps/desktop`; document in desktop guide |
| Dynamic port breaks hardcoded `:8787` in CLI | **Fixed port 8787 for desktop (D13)**; discovery still updated |
| localStorage auth lost each launch | Fixed port + Task 2b session bootstrap |
| Discovery schema CLI/hub mismatch | Task 1 CLI fix (B3) |
| Split-brain hub after 30s | Task 3 lock fix (B5) |

---

## 9. Data, temp files & cleanup

| Location | Class | Desktop policy |
|----------|-------|----------------|
| `{dataDir}/studio.db` (+ `-wal`, `-shm`) | **Critical** | Never auto-delete; graceful shutdown closes handles; crash → SQLite WAL recovery on next start |
| `{dataDir}/blobs/capability/{digest}/` | **Critical** | Keep while install references digest; no TTL |
| `{dataDir}/blobs/sources/{flowId}/{version}/` | Rebuildable | Optional TTL 30d (v1.1); never delete if only copy |
| `{dataDir}/staging/` | Temp | Delete entries **>7 days** on hub startup (D23); ingest allowlist unchanged |
| `{dataDir}/hub.lock/` | Runtime | Removed on clean shutdown; reclaimed per D21 |
| `{dataDir}/hubs/shared.json` | Config | Atomic write; merge `flowProjects` + `hubs[]`; **no tokens in file** |
| `~/.murrmure/flows/` (CLI build output) | User | CLI-managed; desktop does not touch |
| OS `TMPDIR` / worker temp | Temp | Workers inherit sanitized env; no persistent secrets |
| Electrobun self-extract cache | Cache | OS app support; survives updates; document "Reset app" in v1.1 |
| Desktop logs | Observability | `~/Library/Logs/Murrmure/` (macOS); hub stdout/stderr tee'd here (D20) |

**Permissions:** create `dataDir` and sensitive files mode `0700`/`0600` where hub creates them.

**Uninstall:** v1 — document manual delete of `~/.murrmure`; v1.1 — optional "Delete all data" in app menu.

---

## 10. `desktop.md` doc outline (underspecified in original plan)

1. **What Murrmure Desktop is** — vs cloud vs `pnpm dev`
2. **Install** — DMG / first open / Gatekeeper note (D24)
3. **First run** — auto-setup, no `/connect`, wizard steps
4. **Daily use** — Runtime vs Configure; flows identical to web
5. **Data location** — `~/.murrmure`, what's inside, backup tip
6. **CLI + desktop together** — `mrmr login` / credentials; discovery URL; **only one hub** on 8787; error if port taken
7. **MCP for Cursor** — menu "Copy MCP config"; points at `127.0.0.1:8787`
8. **Flow development loop** — `mrmr flow dev` while app open; `flow.dev_reload` SSE
9. **Troubleshooting** — hub failed to start (logs path), port in use, reset lock, corrupt DB
10. **Contributors** — use `pnpm dev`, not desktop build, for active development

---

## 11. Security release gates

Desktop v1 **internal dev builds** may ship without D24. **External distribution** requires:

- [ ] Hub binds loopback only (test)
- [ ] Lock split-brain regression test passes
- [ ] `hub-fetch` path allowlist (D17)
- [ ] Per-install bootstrap secret (not hardcoded default in desktop bundle)
- [ ] Signed app + signed Node sidecar + notarization (D24)

**v1.1 security hardening (document, do not block MVP):**

- Bearer auth on `/api/*` browser path
- OS keychain for human token (replace localStorage)
- Host-bridge: remove `system` fallback for browser-originated traffic

---

## 12. Quick reference — env vars

| Variable | Desktop default | Purpose |
|----------|-----------------|--------|
| `MURRMURE_SHELL_STATIC_DIR` | `<bundle>/shell/dist` | Hub serves shell at `/` |
| `MURRMURE_DATA_DIR` | `~/.murrmure` | DB, blobs, discovery |
| `PORT` | `8787` (fixed desktop) | Hub listen port |
| `DATABASE_PATH` | `{dataDir}/studio.db` | SQLite |
| `VITE_MURRMURE_BUNDLED` | `1` at shell build time | Same-origin client mode |
| `MURRMURE_BUNDLE_ROOT` | `<bundle>/Resources` | Seed contracts + worker entry resolution |

---

## 13. Post-execution

When all tasks green and human validates ([agent.md](../../../agent.md) gate):

1. Move this file to `studio-specs/archives/plans/murrmure-desktop-v1.md`
2. Update `studio-specs/plans/README.md` index → **Executed**
3. Add `studio-specs/ADR/ADR-00N-desktop-single-url.md` if architectural decision warrants ADR (single URL + Node sidecar)
