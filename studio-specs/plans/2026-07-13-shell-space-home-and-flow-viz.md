# Plan — Shell: unified space home flows + flow visualization

**Date:** 2026-07-13
**Status:** Planned — **not started**
**Goal:** Make the shell space home a single deduplicated flows list with a bounded, scrollable "Recent completed", and turn the flow detail page into the **same flowchart view used for a running flow**—with a **Run** button in the header, branch decision fan-out, a shared **fail** terminal block, and per-step metadata exposing contracts and space-owned resolver handlers.

**Related:**

- [2026-07-10-flow-branch-api-simplify.md](./2026-07-10-flow-branch-api-simplify.md) — branch routing ergonomics (this plan renders whatever branch shape ships)
- [2026-07-10-step-default-branches.md](./2026-07-10-step-default-branches.md) — default `completed` / `failed` branches from step order (visualization must not assume every branch is explicit)
- [2026-07-10-view-sdk-contracts-and-upload.md](./2026-07-10-view-sdk-contracts-and-upload.md) — per-branch contract shape reused by the step-meta popover

---

## How the shell surfaces these areas today

### Space home — `packages/shell-web/src/routes/SpaceHomePage.tsx`

A vertical stack of separate `Card` panels (not tabs), `max-w-2xl`, fixed order:

| Section | Lines | Notes |
|---------|-------|-------|
| Needs your attention | 173–190 | conditional |
| Active runs | 192–211 | always |
| **Your flows** | 213–235 | always |
| **Available to run** | 237–256 | always |
| Receiving from | 258–276 | conditional |
| **Recent completed** | 278–289 | always, **no max-height / no scroll** |

- `FlowRow` (19–65) renders one flow: name link (if `can_preview`) → `/spaces/:spaceId/flows/:flowId`, plus an inline **Run** button (if `can_run && manual`) or a **Preview** badge.
- `RunRow` (67–100) renders one run: link to `/sessions/:sessionId`, lifecycle `Badge`.
- Data: `useShellClient()` → `client.spaces.home(spaceId)` (`GET /v1/spaces/:id/home`); run mutation `client.spaces.runFlow()` → `POST /v1/flows/:flow_id/run`, then navigate to `/sessions/:sessionId` (123–131).

### Backend split — `packages/hub-core/src/flow-engine/space-home.ts`

`your_flows` and `available_to_run` are **two separate arrays** (127–133):

| Field | Filter |
|-------|--------|
| `your_flows` | local index where `origin_space_id === current space` (authored/indexed here) |
| `available_to_run` | local index where actor has `flow:run` (and passes `flow_acl`) |

They **overlap**: a flow authored in-space and runnable appears in **both**. Per-row `can_run` / `can_preview` come from `flowRow()` (83–99). `recent_completed` is capped server-side at 20 via `recent_completed.splice(20)` (line 194).

### Flow detail / visualization

| Route | Component | Today |
|-------|-----------|-------|
| `/spaces/:spaceId/flows/:flowId` | `FlowPreviewPage` | **flat step list — no graph** |
| `/sessions/:sessionId` | `SessionPage` | `RunFlowchartView` + secondary panel |
| `/runs/:runId` | `RunPage` | `RunFlowchartView` + secondary panel |

- The flowchart (`packages/shell-web/src/components/RunFlowchartView.tsx`) is built from a **runtime run graph** — `client.runs.graph(runId)` → `buildRunGraph()` / `buildStepContractRunGraph()` in `packages/hub-core/src/flow-engine/graph.ts`. There is **no static flow graph from a manifest** today.
- `FlowPreviewPage` instead uses `client.spaces.flowPreview()` → `FlowPreviewPayload` (`packages/shell-client/src/types.ts` 219–232), a flattened step list from `sanitizeFlowPreview()` (`packages/hub-core/src/flow-engine/start.ts` 106–129).
- **No Run button in any page header** — Run is per-row on space home only.

### Flowchart rendering today

- `FlowchartStepNode` (`packages/shell-web/src/components/flowchart/FlowchartStepNode.tsx`) — title, mono subtitle, status pill, `kind` label, static `metaLines` (executor, timestamps, error, federated). **Not expandable.**
- `flowchart-layout.ts` — vertical top-to-bottom; loop back-edges dashed orange (149–160); IR `gate` kind → label **"human gate"** only (83–98), **no distinct gate shape**.
- **Branches are not visualized as fan-out** — edges are linear chains from compiled IR/catalog.
- **No fail terminal node/block** — failed steps/lanes get a red border; `fail` / `fail_run` branch routes from the manifest are **not rendered**.

### Canonical types

| Concept | Type | Path |
|---------|------|------|
| Manifest / step | `FlowManifest`, `FlowStep` | `packages/contracts/src/flow/manifest.ts` (102–129) |
| Compiled IR | `FlowIr`, `FlowStepIr` | `packages/contracts/src/flow/ir.ts` (59–69) |
| Branch (manifest) | `StepBranchDefinition` (`next?`, `fail_run?`, `goto?`, `fail?`, `schema?`, `artifact_slots?`) | `packages/contracts/src/entities/step-contract.ts` (35–47) |
| Branch (catalog) | `StepCatalogBranch` (`routes[]` with `engine`) | same (91–97) |
| Catalog entry | Target `StepContractCatalogEntry` (`step_id`, `parent_id`, `branches`) | resolver modality/View identity removed by Tutorial v3 alignment |
| Gate | `Gate`, `GateForm` | `packages/contracts/src/entities/gate.ts` (15–36) |
| Handler | `HandlerSpec` (`id`, `contract_keys[]`, `on`, `type`, `complete`, `prompt?`) | `packages/contracts/src/entities/handler.ts` (29–42) |
| Handler config load | — | `packages/hub-core/src/handlers/config.ts` |
| Run graph payload | `RunGraphPayload`, `RunGraphNode` | `packages/shell-client/src/types.ts` (242–261) |
| Home payload | `SpaceHomePayload`, `SpaceHomeFlowRow`, `SpaceHomeRunRow` | `packages/shell-client/src/types.ts` (113–138, 207–217) |
| Flow index row | `FlowIndexEntry` (`ir?`, `step_contract_catalog?`, `view_ref?`) | `packages/contracts/src/entities/flow-index.ts` (12–25) |

---

## Problem statement

| ID | Symptom | Impact |
|----|---------|--------|
| **H-1** | "Your flows" and "Available to run" are two cards that overlap | Same flow appears twice; authors scan two lists to find what they can run |
| **H-2** | "Recent completed" has no max height or scroll | 20 capped runs push the page long; no glanceable history |
| **V-1** | Clicking a flow opens a flat list, not the flowchart | Authors cannot see flow shape before running; inconsistent with the running view |
| **V-2** | No Run button in the flow detail header | Running a flow from its detail page requires going back to space home |
| **V-3** | Branches are not visualized (no fan-out or decision shape) | Branching flows look linear |
| **V-4** | No fail terminal block | `fail` / `fail_run` branch targets are invisible; failure paths cannot be reviewed |
| **V-5** | Step nodes show static text only | Branches, contracts, and handlers are not inspectable on the graph |

---

## Target behavior

### 1 — Unified flows list (space home)

Replace the **Your flows** and **Available to run** cards with a single **Flows** card. Each row appears once (deduplicated by logical `{origin_space_id, flow_id}`) and carries compact affordances:

- name link → flow detail (visualization, see #3)
- chips/badges: **authored here**, **runnable**, **preview-only**
- inline Run button preserved when `can_run && manual`

Server returns one deduplicated list (see Phase 0 decision 1) so sort/dedupe lives in one place.

### 2 — Bounded, scrollable "Recent completed"

`Recent completed` card gets a `max-h-*` with `overflow-y-auto`, so the list scrolls internally instead of growing the page. Item count/cap decided in Phase 0 (decision 2).

Keep the server cap at 20 and add a **View all runs** link to the full history surface. Do not paginate or load more inside the home card.

### 3 — Flow detail = flowchart view + Run in header

Applied flow detail and running flow render through one shared flow page/component (`RunFlowchartView` inside the same `ResizableSplitPane` shell), not separate flat-preview and run experiences. Before a run it is driven by the applied manifest/IR/catalog and shows neutral not-started state. The header shows **Run** when manual run is available and authorized; after start, the same page experience gains live session/run state without changing layout or interaction patterns. URL/API transport may change internally.

### 4 — Branch decision and fail visualization

In the flowchart (both applied and live run graphs):

- Steps always remain rectangular modality-neutral nodes.
- Add a separate decision diamond only for custom/multi-outcome branching, with one labeled edge per branch.
- A plain `completed` / `failed` pair uses a direct success edge plus a subdued red edge to one shared failure terminal, avoiding a diamond after every linear step.
- The shared **fail terminal block** is rendered once per flow; run-failure branch routes point to it. Step-level failure styling remains for live runs.
- Default `completed` / `failed` branches render identically to explicitly authored equivalents.

### 5 — Step metadata side panel

Selecting a step node opens the shared page's existing side panel showing:

- **Branches** — name, target, `schema` / `schema_ref`, `artifact_slots`, engine/route kind
- **Contract** — branch schemas, artifact requirements, and routes; no role or presentation identity
- **Resolvers** — the space handler matching the step event, or **No resolver bound** with “This step remains open until an authorized client resolves it,” safe step/branch/contract metadata, and a handler-doc link. Never synthesize a form, resolve button, or fallback action.

Branch contracts and handler→step resolution are produced server-side under authorization so the client does not compile contracts, infer defaults, or re-implement handler matching. `flow:read` may expose schemas, routes, artifact constraints, handler ID/type, and View ID; commands, prompts, paths, parameters, environment, and secrets are always absent.

Static preview shows the current applied resolver. Live and historical graphs show the handler id/config digest recorded when dispatch occurred. Because apply is rejected while any run is non-terminal, active resolver configuration cannot change beneath a run.

The graph remains visible while inspecting details. On narrow screens the side panel becomes a drawer with equivalent content and focus behavior; no metadata popover is added.

---

## Implementation slices

### Slice 1 — Unified flows section on space home (H-1)

| Task | Path |
|------|------|
| Add unified `flows: SpaceHomeFlowRow[]` (deduplicated by `{origin_space_id, flow_id}`, with current digest, `authored_here`, `can_run`, `can_preview`) to `SpaceHomePayload` | `packages/shell-client/src/types.ts`, `packages/hub-core/src/flow-engine/space-home.ts` |
| Build `flows` server-side from the existing `your_flows` ∪ `available_to_run` union, then delete the two old payload fields | `packages/hub-core/src/flow-engine/space-home.ts` (127–133) |
| Replace the two cards with one **Flows** card; `FlowRow` shows authored/runnable/preview chips | `packages/shell-web/src/routes/SpaceHomePage.tsx` (213–256, `FlowRow` 19–65) |
| HTTP test: home payload returns deduplicated `flows` with correct flags | `packages/hub-daemon/test/` (space home suite) |

**Done gate:** a flow authored here and runnable appears exactly once in the Flows card with both affordances.

**Doc impact:** update any tutorial/doc screenshot referencing the two separate cards (Tutorial 1 v3 space home step). Allowed paths: `apps/docs/guide/tutorials/01-local-preview-review-v3/01-launch-and-create-space.md`. Done gate: tutorial text matches the single Flows card.

### Slice 2 — Bounded, scrollable Recent completed (H-2)

| Task | Path |
|------|------|
| Wrap the Recent completed list in a `max-h-[...] overflow-y-auto` container | `packages/shell-web/src/routes/SpaceHomePage.tsx` (278–289) |
| Keep server cap at 20; add View all runs link outside the scroller | home payload + `SpaceHomePage` |
| Story/snapshot covering >cap items to lock the scrollbar | `packages/shell-web/` stories |

**Done gate:** Recent completed shows at most 20 in a fixed-height scroller, page height stays stable, and View all runs opens full history.

**Doc impact:** none expected (behavior-only).

### Slice 3 — Static flow graph + flowchart detail page + Run in header (V-1, V-2)

| Task | Path |
|------|------|
| Add `buildFlowPreviewGraph()` — manifest/IR/catalog → `RunGraphPayload`-shaped nodes/edges (no run state) | `packages/hub-core/src/flow-engine/graph.ts` (or new `flow-preview-graph.ts`) |
| Expose the static graph in the existing flow-detail load path; avoid a client-visible second loading experience | `packages/shell-client/src/types.ts`, client, Hub routes |
| Build one shared flow page/component consumed by applied-flow, session, and run route wrappers | `FlowPreviewPage.tsx`, `SessionPage.tsx`, `RunPage.tsx`, shared flow page |
| Add **Run** to the shared header when `can_run && manual`; start the run and switch the shared page to live state | shared flow page + existing run mutation |
| Tests: preview graph matches manifest shape for a multi-step + branch fixture | `packages/hub-daemon/test/`, `packages/hub-core/test/` |

**Done gate:** clicking a flow name and viewing a run use the same page/component and interactions; Run appears when available and transitions that experience to live state.

**Doc impact:** "Creating flows" / Tutorial 1 flow-preview step currently describes a flat list. Allowed paths: `apps/docs/guide/creating-flows.md`, `apps/docs/guide/tutorials/01-local-preview-review-v3/04-run-and-understand.md`. Done gate: docs describe the flowchart detail view + header Run button.

### Slice 4 — Branch decision nodes + fail terminal (V-3, V-4)

| Task | Path |
|------|------|
| Extend `buildFlowPreviewGraph()` (and `buildRunGraph()` for live runs) to emit branch fan-out edges from `StepCatalogBranch.routes` / `StepBranchDefinition` | `packages/hub-core/src/flow-engine/graph.ts`, `packages/contracts/src/entities/step-contract.ts` (91–97) |
| Emit a single **fail** terminal node per flow; route `fail` / `fail_run` edges to it | same |
| Keep step rectangles; add a separate decision diamond only for custom/multi-outcome branches; render plain default success/failure as direct edges to next/shared failure terminal | flowchart nodes + layout |
| Remove IR `gate` → "human gate" inference; Views/resolver handlers never change protocol node kind | graph/layout builders |
| Respect default `completed` / `failed` branches (no explicit-branch assumption) | align with `2026-07-10-step-default-branches.md` |
| Tests/snapshots: branch fan-out + fail block for a fixture flow | `packages/shell-web/` stories, `packages/hub-core/test/` |

**Done gate:** custom branching renders a separate labeled decision fan-out; plain defaults remain compact; all run-failure edges reach one visible shared terminal.

**Doc impact:** flow visualization reference. Allowed paths: `apps/docs/guide/creating-flows.md`, `studio-specs/current/bridges/` if graph shape becomes normative. Done gate: branch/fail rendering described where flow shape is documented.

### Slice 5 — Step metadata panel: branches / contracts / handlers (V-5)

| Task | Path |
|------|------|
| Project compiled branch contracts plus sanitized resolver matches server-side under `flow:read`; never return raw `HandlerSpec` | Hub graph projection + shell client types |
| Selecting `FlowchartStepNode` populates the shared page side panel with branches, contract, and handlers; narrow screens use a drawer | flowchart node/view + shared flow page/panel |
| Reuse per-branch contract shape from `2026-07-10-view-sdk-contracts-and-upload.md` | `packages/view-sdk/src/types.ts` |
| Tests: meta payload includes matched handlers for a fixture space | `packages/hub-daemon/test/` |
| Test unbound step metadata/status with external protocol resolution | hub/graph integration tests |
| Test active-run apply rejection and historical handler metadata after a later successful apply | hub/graph integration tests |

**Done gate:** selecting a step shows its branches, contract, and matched handlers in the shared side panel/drawer while preserving graph context.

**Doc impact:** operator-facing change is visible. Allowed paths: `apps/docs/guide/creating-flows.md`. Done gate: step-meta popover documented where flow inspection is described.

### Slice 6 — Docs / spec / changelog sync

| Task | Path |
|------|------|
| Update tutorial + creating-flows to the new space home + flow detail experience | `apps/docs/guide/creating-flows.md`, `apps/docs/guide/tutorials/01-local-preview-review-v3/` |
| Update normative bridge if flow graph shape becomes contract | `studio-specs/current/bridges/` (only if Slice 4 makes graph shape normative) |
| Operator changelog entry (space home + flow detail are operator-visible) | root `CHANGELOG.md` |
| `docs-proof` / doc gates green | `packages/cli/test/docs-proof.test.ts` |

---

## Phase 0 — Decisions (blocking)

1. **Unified `flows` array** — add a deduplicated `flows[]` to `SpaceHomePayload` and delete `your_flows` / `available_to_run` in the same clean-slate slice.
2. **Recent completed cap** — keep 20 with fixed-height scroll and View all runs; no home-card pagination/load-more.
3. **Shared flow page** — applied preview and live run are modes of one component. Transport is implementation-owned; prefer adding structural graph data to the existing flow-detail response and layer live status separately, with no `preview` flag in the graph.
4. **Branch rendering** — keep step rectangles; use a separate decision diamond only for custom/multi-outcome branches. Plain `completed`/`failed` pairs use direct edges.
5. **Fail block** — one shared failure terminal per flow, with subdued red default-failure edges.
6. **Contract/resolver projection** — Hub returns authorized compiled branch contracts and sanitized resolver matches; client performs no compile/default/handler matching.
7. **Meta UI** — use the shared page's existing side panel, adapting to a drawer on narrow screens; no popover.
8. **Live-run parity** — branch rendering, shared failure terminal, contract projection, resolver metadata, and side-panel interactions apply to both applied and live modes of the shared page.
9. **Flow identity** — logical identity is `{origin_space_id, flow_id}`; different origins never dedupe merely because name/digest match. Current rows carry latest applied digest; run/historical payloads pin `{origin_space_id, flow_id, flow_digest}`.

---

## Acceptance criteria

- [ ] Space home shows a single deduplicated **Flows** card; a flow authored here and runnable appears once with both affordances.
- [ ] **Recent completed** has a max height and a vertical scrollbar when items overflow; page height stays stable.
- [ ] Recent completed is capped at 20 and View all runs opens full history.
- [ ] Clicking a flow name opens the **flowchart** view (same layout as a running flow), not a flat list.
- [ ] Applied flow detail and live session/run routes render one shared page/component with the same controls and metadata interactions.
- [ ] A **Run** button is visible in the flow detail header when `can_run`; clicking it starts a run and lands on `/sessions/:sessionId`.
- [ ] Custom/multi-outcome branches render a separate modality-neutral decision diamond with labeled edges; plain defaults do not add diamonds.
- [ ] Every `route: { run: failed }` edge points to the visible shared failure terminal.
- [ ] Default `completed` / `failed` branches render identically to explicit ones.
- [ ] Selecting a step opens side-panel/drawer metadata for branches, contract, and matched resolver handlers without flow role/presentation fields.
- [ ] Tutorials, creating-flows doc, and operator changelog updated; `docs-proof` green.

---

## References

| Layer | Path |
|-------|------|
| Space home route | `packages/shell-web/src/routes/SpaceHomePage.tsx` |
| Flow preview route | `packages/shell-web/src/routes/FlowPreviewPage.tsx` |
| Running session / run routes | `packages/shell-web/src/routes/SessionPage.tsx`, `packages/shell-web/src/routes/RunPage.tsx` |
| Flowchart components | `packages/shell-web/src/components/RunFlowchartView.tsx`, `packages/shell-web/src/components/flowchart/` |
| Home payload builder | `packages/hub-core/src/flow-engine/space-home.ts` |
| Run graph builder | `packages/hub-core/src/flow-engine/graph.ts` |
| Manifest → IR compile | `packages/hub-core/src/flow-engine/compile.ts` |
| Flow preview sanitize | `packages/hub-core/src/flow-engine/start.ts` |
| Handler config | `packages/hub-core/src/handlers/config.ts` |
| Shell client types | `packages/shell-client/src/types.ts` |
| Manifest / step / branch / gate / handler types | `packages/contracts/src/flow/manifest.ts`, `packages/contracts/src/entities/step-contract.ts`, `packages/contracts/src/entities/gate.ts`, `packages/contracts/src/entities/handler.ts` |
| Routes | `packages/shell-web/src/App.tsx` |
