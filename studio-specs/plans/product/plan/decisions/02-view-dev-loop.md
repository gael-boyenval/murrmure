# Decision 02 — View dev loop (`mrmr view dev`)

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § Assumptions #2](../plan-review-1.md), [plan-review-2.md § Desktop live reload](../plan-review-2.md)  
**Related:** [Decision 01 — npm distribution](./01-view-sdk-npm-distribution.md)  
**Blocks:** Phase 03b (scaffold + dev contract), phase 06 (ViewCanvasHost dev route)

---

## Context

Custom views are the primary human interface ([philosophy.md § North star](../../../current/product/philosophy.md#north-star-non-negotiable--2026-07-03)). Authors iterate on React UI constantly. The plan (03b) originally implied:

```text
edit → npm run build → mrmr space apply → manual Desktop reload
```

That loop is too slow for UI work and did not specify **where view context comes from** when no real run or gate exists.

In production, the **shell** (ViewCanvasHost) sends `murrmure.view.context` via postMessage — built from run `exec_context`, pending gate, and session tokens. Views read data through `useViewContext()`; they do not fetch orchestration state directly.

The legacy FDK solved local iteration with `mrmr flow dev --sim --fixture …` ([11-dev-loop-reload-protocol.md](../../../current/build-capability/11-dev-loop-reload-protocol.md)). v2 needs an equivalent for space-directory views and the view-sdk postMessage protocol.

### Discussion (2026-07-03)

**Product owner requirements:**

1. **One CLI entry:** `mrmr view dev <id>` — not two separate commands (`npm run dev` + something else).
2. **Author owns the toolchain** — Murrmure must **not** hide the bundler or build step. The view is a normal npm package; the author controls dependencies, Vite config, and when to build.
3. **Required `package.json` scripts** — `dev` and `build` so `mrmr view dev` can invoke the author's dev server; `build` produces `dist/`.
4. **Preview in Desktop** — dev mode shows the view inside the Murrmure app (ViewCanvasHost dev route), not a standalone browser tab as the primary path.
5. **Fixture tabs in dev** — shell dev chrome lets the author switch between fixture scenarios (simulated context) without a real run.
6. **Ship path unchanged** — when satisfied, author (or agent) runs `npm run build` → `mrmr space apply` → validate with a **real** flow run (no fixtures).

**Agreed refinements:**

- Dev iframe loads the author's **dev server URL** (from `npm run dev`); production iframe loads **hub-served `dist/`** after apply.
- Submit in dev mode **logs only** by default — no real gate resolve until a real run.
- Fixture files live under **`dev/fixtures/`**; one tab per fixture file (scaffold includes 2–3 examples).
- `space apply --strict` should fail when a referenced view has no built `dist/` (see decision follow-up in phase 01).

---

## Decision

### Author workflow (normative)

| Phase | Goal | Commands |
|-------|------|----------|
| **Design** | Iterate UI against simulated run context | `mrmr view dev <view-id>` |
| **Ship** | Index built assets for real runs | `npm run build` (author) → `mrmr space apply` |
| **Validate** | Real scenario with engine + hub | Run flow in Desktop — real `exec_context`, no fixtures |

The author runs **`mrmr view dev` only** for the design phase. The CLI starts the author's `dev` script internally; the author does not need a second terminal for `npm run dev` unless debugging the script itself.

When ready to integrate with the space, the author (or their agent) runs **`npm run build`** then **`mrmr space apply`**. Murrmure never auto-builds for apply without the author's explicit build step.

---

### View package contract (required)

Every scaffolded view under `murrmure/views/<id>/` **must** include:

```text
murrmure/views/<id>/
  view.manifest.yaml       # entry: ./dist/index.html
  package.json             # scripts.dev + scripts.build (required)
  dev/
    fixtures/
      start.json           # optional: start checkpoint scenario
      gate-round-1.json    # default gate scenario (example name)
      gate-round-2.json    # alternate scenario (example name)
  src/                     # author source (Vite+React typical)
  dist/                    # build output — required before apply
```

#### `view.manifest.yaml`

```yaml
apiVersion: murrmure.view/v1
id: {id}
entry: ./dist/index.html
params_schema: schemas/params.json  # optional — start params only
```

#### `package.json` (minimum)

```json
{
  "name": "@views/{id}",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@murrmure/view-sdk": "^0.1.0"
  }
}
```

| Requirement | Enforced by |
|-------------|-------------|
| `scripts.dev` | `mrmr view dev` — exits with clear error if missing |
| `scripts.build` | Documented ship path; optional `mrmr view build` wrapper |
| `dist/` after build | `mrmr space apply --strict` — warn/fail if missing (phase 01 extension) |
| `dev/fixtures/*.json` | `mrmr view dev` — at least one fixture; scaffold ships 2–3 |

Authors may use npm, pnpm, or bun; **`mrmr view dev` detects lockfile** and runs the matching package manager for `dev` / documents that `npm run dev` is the portable default in tutorials.

---

### Fixture format (normative)

Each file in `dev/fixtures/` is a **complete simulated `ViewAppContext`** (same shape the shell sends in production via `murrmure.view.context`).

Example `dev/fixtures/gate-round-1.json`:

```json
{
  "flow_id": "preview-review",
  "space_id": "spc_local",
  "hub_base_url": "http://127.0.0.1:8787",
  "token": "dev-readonly",
  "session_id": "ses_dev",
  "run_id": "run_dev",
  "mode": "gate",
  "gate": {
    "gate_id": "gte_dev",
    "step_id": "review"
  },
  "input": {
    "reviewer": "you@local",
    "preview_url": "http://localhost:3000"
  },
  "steps": {
    "build": {
      "status": "completed",
      "output": { "preview_url": "http://localhost:3000" }
    }
  }
}
```

- **Tab label** — filename without `.json` (e.g. `gate-round-1`). Optional `label` field in JSON later; not required for v1.
- **`schemas/params.json`** — documents start-checkpoint param shape only; does **not** replace gate fixtures.
- **Hub client stubs** — optional `dev/hub-stub.json` per fixture for `useViewHubClient` mock responses (phase 03b+; can start with empty/no-op stub).

---

### `mrmr view dev <view-id>` behavior (normative)

```bash
mrmr view dev preview-review
mrmr view dev preview-review --fixture gate-round-2   # initial tab
```

1. Resolve `murrmure/views/<view-id>/` from space root (cwd or `--space-root`).
2. Validate package contract (`scripts.dev`, `dev/fixtures/` non-empty).
3. Start author's dev server: `npm run dev` (or pnpm/bun equivalent) as subprocess.
4. Wait for dev server URL (parse Vite stdout or read `vite.config.ts` port; default 5173).
5. Register dev session with Desktop/shell (local hub dev endpoint or IPC — implementation detail in 03b/06).
6. Open **ViewCanvasHost dev route** in Desktop:
   - iframe `src` → author's dev server URL (not `dist/`)
   - **Fixture tabs** in dev-only shell chrome (not inside the view bundle)
7. On tab switch → shell re-posts selected fixture as `murrmure.view.context` to iframe.
8. On view `submit` in dev mode → **log params to terminal** (and optional dev panel); **do not** call gate resolve API.
9. On source change (dev server HMR) → view hot-reloads; active fixture context re-sent after reload.
10. On CLI exit → stop dev subprocess; close dev session.

**Flags (v1 minimum):**

| Flag | Effect |
|------|--------|
| `--fixture <name>` | Initial tab (`gate-round-1` → `dev/fixtures/gate-round-1.json`) |
| `--space-root <path>` | Override murrmure root |

**Deferred (not v1):** `--live --gate gte_…` — pull real context from hub; spec in a later decision if needed.

---

### Desktop / shell dev surface (normative)

| Surface | Dev mode | Production (after apply + run) |
|---------|----------|--------------------------------|
| **iframe URL** | Author's dev server (`http://localhost:…`) | Hub asset URL (`/v1/spaces/…/views/…/dist/index.html`) |
| **Context source** | `dev/fixtures/*.json` (tab-selected) | Run `exec_context` + pending gate |
| **Fixture tabs** | Visible — **dev-only shell chrome** | Hidden |
| **Submit** | Log only | Real `POST …/run` or `POST …/gates/…/resolve` |
| **Shell chrome** | Minimal dev bar (tabs + "Dev" badge) | ViewCanvasHost full primary region; admin chrome per north star |

Fixture tabs are **author/operator tooling**, not end-user UX. They must not appear at real gates.

---

### Philosophy alignment

| Principle | How this decision honors it |
|-----------|----------------------------|
| Custom views are the product | Author owns a real npm package and build pipeline |
| Presentation = view bundle | View code stays in `src/`; fixtures simulate **protocol** context only |
| Shell = admin/operator | Fixture tabs are dev shell chrome, not domain UI |
| Dist + apply = ship path | No shortcut that skips `dist/` for production |
| Breaking changes OK | Replaces implied "hidden bundler" and browser-only sim from early plan drafts |

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [03b-view-sdk.md](../03b-view-sdk.md) | Add view package contract, `mrmr view dev`, fixture layout, dev route; add `view dev` to CLI commands table |
| [06-gate-requires-view.md](../06-gate-requires-view.md) | ViewCanvasHost **dev route** + fixture tabs; production route unchanged |
| [03-space-flow-scaffold.md](../03-space-flow-scaffold.md) | `space flow init` scaffolds `dev/fixtures/` with flow-shaped examples |
| [01-apply-validation.md](../01-apply-validation.md) | `--strict`: fail/warn when `requires_view` / `view_ref` target has no `dist/` |
| [08-docs-and-proof.md](../08-docs-and-proof.md) | Tutorial documents design → build → apply → real run loop |
| [09-review-synthesis.md](../09-review-synthesis.md) | Add Q-dev resolved row |
| `apps/docs/reference/view-sdk.md` | Author dev loop section |
| Skill `reference/views.md` | Same |

### Implementation notes (non-normative)

- Reuse patterns from `packages/cli/src/dev-sim/` for fixture loading; replace FDK mount protocol with view-sdk postMessage.
- Desktop dev registration may extend existing `desktop:dev:hmr` orchestration (hub watch) — separate from view dev subprocess lifecycle.
- `mrmr view build [id]` remains optional convenience wrapping `npm run build`.

---

## Open follow-ups (other decision queue)

| # | Topic | Status |
|---|-------|--------|
| 3 | Gate view context shape (flat vs nested) | Pending |
| 4 | `outcome` vs `decision` wire mapping | Pending |
| 5 | Build-before-apply strict lint detail | Partially covered here |
| — | `--live` attach to real gate context | Deferred post-v1 |

---

*End of decision 02.*
