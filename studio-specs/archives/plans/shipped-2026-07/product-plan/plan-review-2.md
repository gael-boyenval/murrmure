# Plan Review 2 — Architecture, Desktop & Simplicity
**Reviewer:** Agent 2 (architecture focus)  
**Date:** 2026-07-03

## Executive summary
- The v2 direction is strong (view-first OS model, phase decomposition, explicit deletion plan), but the architecture is still operating as two products in parallel: legacy FDK/install runtime and the new space/apply/view runtime.
- Desktop HMR is partially shipped (hub watch + shell Vite + desktop dev runner), but "any change updates live without manual reload" is not guaranteed for `murrmure/flows`, `murrmure/views`, and local action/hook edits.
- Conceptual alignment is the largest gap: current shell/desktop behavior is still admin-surface-first (`ViewDrawer`, built-in gate forms, always-on chrome), while the north star requires `ViewCanvasHost` as the primary human path.

## Scorecard (1-5 per criteria 2,5,6; brief on others)
| Criterion | Score | Notes |
|---|---:|---|
| **2. Architecture** | **3/5** | Target model is coherent, but boundary enforcement and transition cut-over are under-specified; dual paths remain live in code. |
| **5. Desktop live reload** | **2/5** | HMR foundation exists, but no end-to-end "author file change -> running desktop UX updates" contract. |
| **6. Desktop conceptual alignment** | **1/5** | Current runtime still prioritizes shell drawer/form UX over full custom view canvas. |

**Secondary criteria (brief):**
- **1. Problem framing:** **4/5** — B1-B10 known gaps are explicit and accurate.
- **3. Scope quality:** **3/5** — phases cover key gaps, but desktop HMR and migration cut-over criteria are too implicit.
- **4. Solution specificity:** **3/5** — strong specs in phases 02/06/07; weaker executable detail for desktop live reload and `view init` parity.
- **7. User proof:** **2/5** — acceptance tests/checklists are not yet strict enough to prevent drift between docs/spec and shipped UX.

## Layer model vs codebase (diagram or table)
| Layer (plan) | Planned package boundary | Current package boundary in code | Gap / risk |
|---|---|---|---|
| **Protocol** | `packages/hub-core` (+ persistence/contracts) | Mostly correct, but some projection/advance orchestration sits in `packages/hub-daemon/src/routes/sessions/index.ts` | Domain logic leaks into HTTP route layer; weak SoC. |
| **Flow** | `murrmure/flows` indexed by `space apply`, executed by core engine | New path exists, but legacy install/mount runtime still active in `packages/hub-daemon/src/main.ts` and `routes/flow-static.ts` | Dual runtime model increases complexity and migration risk. |
| **View** | `murrmure/views` + `@murrmure/view-sdk/app` for author apps | Host-side SDK exists in `packages/view-sdk/src`, but app runtime/scaffold is missing; `packages/flow-dev-kit/src/react.tsx` still carries old mount API | Author API split and migration ambiguity (DRY/KISS violation). |
| **Shell** | Admin/operator shell, custom view primary via `ViewCanvasHost` | `packages/shell-web/src/layout/AppShell.tsx` always renders chrome; `SpaceHomePage` uses `ViewDrawer`; run/session use built-in gate forms | Product surface is still shell-first, not view-first. |
| **CLI** | `space flow init`, `view init` (React+Vite), setup/onboard into custom view flow | `packages/cli/src/commands/flow/commands.ts` still promotes legacy `flow init`; `view init` emits static stub; no `space flow init` | Onboarding path is not aligned with v2 architecture. |

## Duplication & violation matrix (DRY/KISS/YAGNI)
| Area | Evidence | Principle impact | Severity | Recommendation |
|---|---|---|---|---|
| Human UI for checkpoints | `ViewDrawer` in `packages/shell-web/src/routes/SpaceHomePage.tsx` + `GateResolvePanel` in run/session routes | DRY + KISS (two primary UIs for same job) | **High** | Make `ViewCanvasHost` default for both start/gate when `requires_view` is set; forms as fallback only. |
| Author SDK split | Legacy `createFlowMount` in `packages/flow-dev-kit/src/react.tsx`; no `view-sdk/app` package surface yet | DRY + YAGNI (old API kept alive without clear adapter) | **High** | Ship `@murrmure/view-sdk/app`; provide codemod/compat wrapper; deprecate `flow-dev-kit/react`. |
| Runtime topology split | `mountFlowStaticRoutes` + `mountViewAssetRoutes` both active in `packages/hub-daemon/src/routes.ts`; legacy mount registry in `main.ts` | KISS (parallel execution paths) | **High** | Add strict cut-over milestone where legacy flow-static/mount runtime is removed behind one release gate. |
| CLI onboarding split | Legacy `mrmr flow init`/skill language in `packages/cli/src/commands/flow/commands.ts` and `packages/cli/src/commands/skill.ts`; `view init` still static | DRY + KISS | **High** | Consolidate around `space flow init` + `view init` React scaffold and retire legacy flow-init path. |
| Desktop HMR readiness logic split | Polling/health logic duplicated across `apps/desktop/src/lifecycle.ts` and `apps/desktop/scripts/run-dev-hmr.ts` | DRY | **Medium** | Share one readiness utility module and one source of truth for retries/timeouts. |
| Gate id prefix dialect | `addGateId()` yields `chk_*` in `packages/hub-core/src/bridge/ids.ts`; `space-home` rewrites to `gte_*` in `packages/hub-core/src/flow-engine/space-home.ts` | KISS + correctness risk | **Medium** | Standardize one gate id format end-to-end and add integration tests for deep links/notifications. |
| Packaging legacy payloads | Desktop build still copies legacy artifacts in `apps/desktop/electrobun.config.ts` | YAGNI | **Medium** | Tie copy list to phase-07 deletion checklist and fail CI on legacy artifacts after cut-over. |

## Separation of concerns assessment
**What is strong now**
- `packages/hub-core` maintains a mostly clean core/domain center (compile, templates, dispatch, gates service APIs).
- `packages/view-sdk/src/host-bridge.ts` gives a clear host/view messaging abstraction.
- `packages/hub-daemon` still acts as an adapter boundary for HTTP and daemon lifecycle.

**Where concerns are blurred**
- Route-level code in `packages/hub-daemon/src/routes/sessions/index.ts` performs projection/state updates and triggers flow advancement, blending transport + domain orchestration.
- `packages/shell-web` combines operator shell concerns with what should become author-defined workflow UX; current route/components make shell UI the primary surface.
- CLI command surfaces still expose both legacy and v2 mental models simultaneously, increasing cognitive load for new authors.

**Assessment**
- Separation is **partially good at package level**, but **weak at product-surface level** and **transition architecture level**.
- The plan should enforce stricter "one layer owns one responsibility" acceptance checks per phase merge.

## Desktop dev experience audit (current state vs plan gaps)
| Area | Current state (observed in code) | Gap vs desired live reload |
|---|---|---|
| Shell UI code (`packages/shell-web`) | Vite dev server in `apps/desktop/scripts/run-dev-hmr.ts`; shell HMR works | Good baseline, but no requirement tying this to view-canvas workflows. |
| Hub daemon code (`packages/hub-daemon`) | `dev:watch` launched by `apps/desktop/scripts/run-hmr-hub.ts` | Restarts daemon, but no explicit UX-level resilience requirements for in-flight runs/views. |
| Desktop process (`apps/desktop/src/main.ts`) | `electrobun dev` path is wired; lifecycle health checks exist | Works for process/dev bootstrap, but not sufficient for author workflow updates. |
| Space flow/action/hook files (`murrmure/`) | No watcher triggers `mrmr space apply` automatically | Requires manual apply/restart cycle. |
| View author source code | `mrmr view init` currently static scaffold (`packages/cli/src/commands/view/init.ts`) | No first-class Vite+React author loop; no guaranteed hot path from source edit to canvas update. |
| View runtime refresh in shell | Assets served via view routes, but shell integration is drawer/form-first | No guaranteed auto-refresh/focus behavior for active run/gate view state. |
| CLI local changes in dev | Dev HMR script links CLI once (`apps/desktop/scripts/dev-hmr-cli.ts`) | CLI source edits are not a live loop unless manually rebuilt/relinked. |

## Live reload requirements missing from plan
The plan should add an explicit **Desktop Live Reload Contract** (acceptance criteria, not only implementation notes):

1. A single command (`desktop:dev:hmr`) must cover shell, hub, desktop process, and `murrmure/` workspace changes.
2. Changes in `murrmure/flows`, `murrmure/actions`, `murrmure/hooks.yaml`, and `murrmure/views` must trigger automatic refresh behavior without manual reload steps.
3. `space apply` should have an optional watch mode (`--watch`) or desktop-managed watcher that re-indexes on safe file changes.
4. Active run/gate view surfaces should auto-revalidate context after apply/hub restart (no stale manual navigation).
5. View authoring should have a first-class dev mode (Vite+React scaffold + iframe refresh/HMR bridge), not static `dist`-only assumptions.
6. CI should include at least one smoke test asserting "edit -> visible desktop update" for both shell code and space content.
7. Plan phases should define latency targets (e.g., median update under 2-3 seconds) for author trust.

## Desktop product surface gaps (ViewCanvasHost, chrome hiding, etc.)
1. **No `ViewCanvasHost` implementation in shell runtime paths:** `packages/shell-web` currently has `ViewDrawer` and built-in gate forms as default behavior.
2. **Shell chrome does not recede in author mode:** `packages/shell-web/src/layout/AppShell.tsx` renders header/sidebar globally; no dedicated view-first route mode.
3. **Gate UX is still form-first:** run/session pages route through `GatePanel`/`GateResolvePanel` rather than canvas-hosted custom views.
4. **Flow schema/runtime for `gate.requires_view` is not fully wired:** compile/dispatch path still primarily models form gates.
5. **Desktop bootstrap path remains admin-centric:** startup hands users into shell-space surfaces rather than directly into workflow view contexts.
6. **Legacy runtime residue remains in desktop packaging:** phase-07 deletion targets are not fully reflected in active desktop build/runtime boundaries.

## Refactoring proposals (concrete, with file paths)
### 1) Implement one primary human surface: `ViewCanvasHost`
**Goal:** Make custom views primary for both start and gate checkpoints; keep forms as fallback only.

**Files to change**
- `packages/shell-web/src/routes/SpaceHomePage.tsx`
- `packages/shell-web/src/routes/RunPage.tsx`
- `packages/shell-web/src/routes/SessionPage.tsx`
- `packages/shell-web/src/layout/AppShell.tsx`
- `packages/shell-web/src/components/ViewDrawer.tsx` (demote/deprecate path)
- `packages/shell-web/src/components/GateResolvePanel.tsx` (fallback mode only)
- `packages/view-sdk/src/index.ts` (host API extensions as needed)

**Result**
- One canonical shell path for `requires_view`: full primary-region view canvas.
- Explicit shell mode switch: operator/admin chrome vs author/human canvas.

### 2) Finish gate runtime parity in engine core
**Goal:** Deliver full phase-02/06 runtime semantics (`gate` dispatch, `on_resolve`, template hydration).

**Files to change**
- `packages/contracts/src/flow/manifest.ts`
- `packages/contracts/src/flow/ir.ts`
- `packages/hub-core/src/flow-engine/compile.ts`
- `packages/hub-core/src/flow-engine/advance.ts`
- `packages/hub-core/src/flow-engine/advance-runner.ts`
- `packages/hub-core/src/gates/service.ts`
- `packages/hub-daemon/src/routes/phase07/index.ts`

**Result**
- Declarative gate steps become first-class runtime behavior.
- `gate.on_resolve` looping works without imperative side channels.

### 3) Add run-context update API in persistence (for template correctness)
**Goal:** Ensure `exec_context.steps` and related template data are updated in one authoritative place.

**Files to change**
- `packages/hub-persistence/src/port.ts`
- `packages/hub-persistence/src/sqlite.ts`
- `packages/hub-persistence/src/memory.ts`
- `packages/hub-daemon/src/routes/sessions/index.ts`

**Result**
- No route-level ad hoc context mutation.
- Reliable `{{steps.*}}` and `MURRMURE_INPUT` behavior from persisted run context.

### 4) Complete view author SDK migration (`flow-dev-kit/react` -> `view-sdk/app`)
**Goal:** Remove author ambiguity and enforce one UI authoring SDK.

**Files to change**
- `packages/view-sdk/src/app/*` (new)
- `packages/view-sdk/src/index.ts`
- `packages/view-sdk/package.json`
- `packages/flow-dev-kit/src/react.tsx` (deprecate with migration pointers)
- `packages/flow-dev-kit/src/index.ts`

**Result**
- `createViewMount`/hooks shipped from `@murrmure/view-sdk/app`.
- Legacy React flow mount path removed on phase-07 schedule.

### 5) Converge CLI onboarding to v2-first commands
**Goal:** One happy-path scaffold for space+flow+view authoring.

**Files to change**
- `packages/cli/src/commands/space/index.ts`
- `packages/cli/src/commands/space/setup.ts`
- `packages/cli/src/commands/flow/commands.ts`
- `packages/cli/src/commands/view/init.ts`
- `packages/cli/src/commands/skill.ts`
- `packages/cli/src/skill/install.ts`

**Result**
- Introduce `mrmr space flow init` and `mrmr space onboard`.
- Rename/align skill output to `murrmure` (not `murrmure-flow`).
- `mrmr view init` scaffolds React+Vite template wired to `view-sdk/app`.

### 6) Add explicit desktop live-reload pipeline for `murrmure/` content
**Goal:** Remove manual apply/reload loops for author workflows.

**Files to change**
- `apps/desktop/scripts/run-dev-hmr.ts`
- `apps/desktop/scripts/run-hmr-hub.ts`
- `apps/desktop/src/lifecycle.ts`
- `packages/cli/src/commands/space/apply.ts` (watch mode)
- `packages/hub-daemon/src/routes/views/index.ts` (refresh/cache semantics as needed)

**Result**
- Author file edits trigger deterministic auto-apply + UI refresh behavior.
- One shared readiness/watch utility (no duplicate pollers).

### 7) Enforce legacy deletion gate in desktop packaging + daemon routes
**Goal:** Ensure phase-07 deletion does not drift.

**Files to change**
- `packages/hub-daemon/src/main.ts`
- `packages/hub-daemon/src/routes.ts`
- `packages/hub-daemon/src/routes/flow-static.ts` (delete at cut-over)
- `apps/desktop/electrobun.config.ts`

**Result**
- Remove flow-static/mount-worker residue once replacement paths are proven.
- Build fails if deprecated artifacts are reintroduced.

## Cross-cutting notes
- Known-gap documentation already correctly identifies many runtime holes (`apps/docs/guide/known-gaps.md` and `packages/cli/skill/reference/known-gaps.md`), which is good; however, these gaps should become **merge-gating checks** for affected phases.
- Naming/ID consistency needs immediate cleanup (`chk_*` vs `gte_*` gate id patterns) to avoid subtle navigation and API contract bugs.
- The strongest risk is not missing features individually; it is prolonged coexistence of legacy and v2 paths, which multiplies testing/docs burden and slows simplification.

## Priority actions (P0/P1/P2)
### P0 (must happen before broad v2 claims)
- Ship `ViewCanvasHost` as default primary human surface for start/gate (`packages/shell-web`).
- Implement declarative gate runtime semantics (`gate` dispatch + `on_resolve`) in core/daemon path.
- Add desktop live-reload contract + acceptance tests (including `murrmure/` file edits).

### P1 (next stabilization wave)
- Ship `@murrmure/view-sdk/app` and move `mrmr view init` to React+Vite scaffold.
- Introduce `mrmr space flow init` and retire legacy flow-init skill language.
- Remove duplicated runtime surfaces (`flow-static`, mount registry, legacy packaging artifacts) once replacement is proven.

### P2 (hardening and maintainability)
- Standardize gate id and route contracts end-to-end.
- Consolidate desktop readiness/watch helpers into one utility.
- Add CI policy checks that block reintroduction of deprecated FDK/install artifacts after phase-07 cut-over.
