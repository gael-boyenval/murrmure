# Plan — Unified step contracts v2.2 (vertical slices)

**Date:** 2026-07-08  
**Status:** Ready for orchestrator execution  
**Normative design:** [2026-07-07-step-contracts-unified-state-machine.md](./2026-07-07-step-contracts-unified-state-machine.md) (v2.2)  
**Inputs:** [Phase A findings](./2026-07-07-phase-a-findings.md), [reviews](./step-contracts-v21review-opus.md)  
**Manual test repo:** `/Users/gaelboyenval/web/GBworkspace/murrmuretuto` (Tutorial 1 clone — currently empty; bootstrap in VS-0)

---

## Orchestrator mission

Ship **unified step contracts v2.2** as a **hard cutover** (no aliases, shims, or dual-write). Work is split into **vertical slices**. Each slice is executed by three subagents in sequence:

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  DEV agent  │ ──► │ REVIEW agent     │ ──► │ MANUAL TEST agent   │
│  implements │     │ (high-thinking)  │     │ (CLI + hub + browser)│
└─────────────┘     └──────────────────┘     └─────────────────────┘
       │                      │                         │
       └──────────────────────┴─────────────────────────┘
                    Slice gate: all three PASS
                              │
                              ▼
                    Next slice may start
```

**Orchestrator rules:**

1. **Strict order** — do not start slice N+1 until slice N gate passes.
2. **One slice branch** — dev agent works on a dedicated git branch `feat/step-contracts-vs-N-short-name`.
3. **Review blocks merge** — review agent must output `VERDICT: PASS | FAIL` with numbered findings; FAIL returns to dev agent (max 2 rework loops, then escalate to human).
4. **Manual test is acceptance** — manual agent writes a findings file under `studio-specs/plans/acceptance/vs-N-*.md`; orchestrator reads `RESULT: PASS | FAIL`.
5. **Monorepo tests** — dev agent runs targeted tests; manual agent runs the real user workflow.
6. **No scope creep** — dev agent implements only the slice checklist; review agent flags anything outside slice scope as `OUT_OF_SCOPE` not `FAIL` unless it breaks the slice.

---

## Subagent prompt templates

### Dev agent (per slice)

```text
You implement Vertical Slice VS-{N} only.

Read first:
- studio-specs/plans/2026-07-08-step-contracts-vertical-slices.md (slice VS-{N} section)
- studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md (v2.2 normative sections cited in slice)

Branch: feat/step-contracts-vs-{N}-{slug}
Do NOT implement items from other slices.

Deliverables checklist (all required):
- [ ] Code changes listed in slice
- [ ] Spec/bridge updates listed in slice
- [ ] Docs + tutorial edits listed in slice
- [ ] Skill edits listed in slice
- [ ] Automated tests listed in slice — all green
- [ ] DEV-NOTES.md at repo root summarizing: files touched, commands run, known gaps for manual tester

When done, output:
SLICE: VS-{N}
STATUS: READY_FOR_REVIEW
BRANCH: ...
TESTS: <command> → pass/fail
DEV-NOTES: path to DEV-NOTES.md
```

### Review agent (high-thinking, per slice)

```text
Review Vertical Slice VS-{N} implementation.

Read:
- studio-specs/plans/2026-07-08-step-contracts-vertical-slices.md (slice VS-{N})
- studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md (v2.2)
- git diff feat/step-contracts-vs-{N}-* vs main (or prior slice branch)
- DEV-NOTES.md from dev agent

Check:
1. Slice scope — only VS-{N} items; no forbidden compatibility shims (aliases, dual-write, gate.resolve for flow progression)
2. Consistency with v2.2 resolved decisions D1–D11
3. Tests cover slice acceptance criteria
4. Docs/skills match code (no stale complete_action / wait_for_gate in slice-owned files)
5. Minimize diff — no drive-by refactors

Output format:
VERDICT: PASS | FAIL
FINDINGS:
  C1 [critical|major|minor] ...
  ...
SCOPE_CREEP: ...
RECOMMENDATIONS: ...
```

**Suggested review models:** `claude-opus-4-8-thinking-high`, `gpt-5.3-codex-xhigh`, or `claude-sonnet-5-thinking-high`.

### Manual test agent (per slice)

```text
Manual acceptance for Vertical Slice VS-{N}.

Environment:
- agentStudio monorepo at /Users/gaelboyenval/web/GBworkspace/agentStudio on branch feat/step-contracts-vs-{N}-*
- murrmuretuto at /Users/gaelboyenval/web/GBworkspace/murrmuretuto
- Hub + Desktop per slice prerequisites

Follow the "Manual testing protocol" in slice VS-{N} exactly.
Use CLI, curl, MCP (if applicable), Desktop, browser MCP for ViewCanvasHost.

Write findings to:
  studio-specs/plans/acceptance/vs-{N}-{slug}-manual.md

Include screenshots paths, run_ids, commands, pass/fail table.

Output:
RESULT: PASS | FAIL
ARTIFACT: studio-specs/plans/acceptance/vs-{N}-...
BLOCKERS: ...
```

---

## Shared environments

### agentStudio monorepo (implementation)

| Service | Command | URL |
|---------|---------|-----|
| Hub daemon | `pnpm --filter @murrmure/hub-daemon dev` | `http://127.0.0.1:8787` |
| Shell (Desktop HMR) | `pnpm desktop:dev:hmr` | Shell `http://127.0.0.1:5174` |
| Unit/integration tests | `pnpm --filter @murrmure/hub-core test` etc. | — |

### murrmuretuto (manual acceptance)

**Purpose:** Clean Tutorial 1 space repo — no monorepo coupling. Mirrors [Tutorial 1](../../apps/docs/guide/tutorials/01-local-preview-review/index.md) layout.

**Bootstrap (VS-0, once):** manual test agent creates:

```text
murrmuretuto/
  agent.md
  package.json          # minimal static site OR app/web/ layout (document choice in VS-0 acceptance)
  app/web/              # if using monorepo-style site (matches Phase A findings ISSUE-01 workaround)
  murrmure/
    actions.yaml
    executors.yaml
    flows/preview-review/flow.manifest.yaml   # migrated per slice
    views/preview-review-intake/
    views/preview-review/
  skills/feature-build/SKILL.md
  specs/                # empty until run
  .murrmure/link        # after onboard
```

**External fixture:** `~/Documents/hero-section.md` (create if missing — same as Phase A).

**Grant capabilities (mint once, update per slice):**

```bash
mrmr grant mint --space spc_… \
  --capabilities flow:run,flow:read,action:invoke,step:resolve,space:read,journal:read \
  --label cursor
```

Replace `gate:resolve` with `step:resolve` when VS-2 lands.

---

## Slice dependency graph

```text
VS-0 Bootstrap murrmuretuto + acceptance harness
  │
  ▼
VS-1 Contracts + StepContractCatalog compile
  │
  ▼
VS-2 Unified resolve API + linear step runner
  │
  ├──────────────────┐
  ▼                  ▼
VS-3 Shell human     VS-4 Safety invariants
  resolve by step    (monotonic memos,
  │                  fail-fast, timeouts)
  │                  │
  └────────┬─────────┘
           ▼
VS-5 Discovery injection + active-step-contract.json
           │
           ▼
VS-6 Step artifacts + workdirs
           │
           ▼
VS-7 Nested steps + engine-routed goto (preview-review v2)
           │
           ▼
VS-8 Hard cutover cleanup + full Tutorial 1 docs/skills/example
```

---

## VS-0 — Bootstrap murrmuretuto + orchestrator harness

**Branch:** `feat/step-contracts-vs-0-bootstrap`  
**Depends on:** none  
**Blocks:** all other slices

### Goals

- Provide a **repeatable manual acceptance repo** for Tutorial 1 workflows.
- Document orchestrator conventions (branch naming, acceptance file paths).

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-0.1 | Manual test agent | A clean space repo at `murrmuretuto/` | I can run Tutorial 1 without agentStudio monorepo pollution |
| US-0.2 | Orchestrator | Acceptance doc templates | Each slice produces comparable PASS/FAIL artifacts |
| US-0.3 | Dev agent | A pinned hero-section spec file | Intake steps are deterministic |

### Code changes

| Area | Path | Action |
|------|------|--------|
| Acceptance templates | `studio-specs/plans/acceptance/README.md` | **Create** — template for manual findings tables |
| Orchestrator index | `studio-specs/plans/README.md` | **Update** — link this plan |

**No hub/cli code in VS-0.**

### murrmuretuto bootstrap (manual agent creates in repo)

1. Scaffold minimal site per Tutorial Part 1 (use `app/web/` layout documented in Phase A findings).
2. Copy **current v2** preview-review assets from `examples/flows/preview-review-v2/` into `murrmuretuto/murrmure/` (temporary — updated in later slices).
3. Run Tutorial Parts 2–7 once on **current shipped** Murrmure (`mrmr setup`, views build, `space apply --strict`).
4. Record `spc_…` in acceptance doc.

### Docs / tutorial changes

- None in `apps/docs/` (VS-0 only creates acceptance harness).

### Skill changes

- Copy current `skills/feature-build/SKILL.md` into murrmuretuto (baseline).

### Spec updates

- Add `studio-specs/plans/acceptance/README.md` referencing v2.2 plan.

### Tests updates

- None.

### Manual testing protocol

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | `cd murrmuretuto && mrmr whoami` | Actor present |
| 2 | `mrmr space status` | `preview-review` flow indexed |
| 3 | `pnpm desktop:dev:hmr` in agentStudio + open murrmuretuto space in Desktop | Space visible |
| 4 | Run preview-review → intake view renders (not JSON error) | Attach spec UI |
| 5 | Document baseline run_id (optional full loop on **current** API) | Record in acceptance file |

**Acceptance file:** `studio-specs/plans/acceptance/vs-0-bootstrap-manual.md`

### Slice gate

- [ ] murrmuretuto onboarded and apply succeeds
- [ ] Intake view loads in Desktop
- [ ] Acceptance README exists

---

## VS-1 — Contracts + StepContractCatalog compile

**Branch:** `feat/step-contracts-vs-1-catalog`  
**Depends on:** VS-0  
**Implements:** v2.2 § Authoring shape, § Step contract catalog (compile only), § Step identity/status

### Goals

- Introduce **normative types** for step contracts and catalog entries.
- Compile **StepContractCatalog** at `mrmr space apply` from new manifest shape.
- **Strict linter** rejects unknown `{{murrmure.*}}` tokens and invalid routes (compile-time).

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-1.1 | Flow author | One step YAML shape with `branches` + `routes` | I don't maintain parallel invoke/checkpoint kinds |
| US-1.2 | Hub | A compiled catalog on the space index entry | Runtime can inject scoped slices without parsing YAML per request |
| US-1.3 | CLI apply | `--strict` errors on dead steps / bad tokens | I catch manifest bugs before run |

### Code changes

| Package | Path | Action |
|---------|------|--------|
| `contracts` | `src/entities/step-contract.ts` | **Create** — `StepStatus`, `StepBranch`, `StepRoute`, `StepContract`, `StepContractCatalog`, `StepContractSlice` types + Zod |
| `contracts` | `src/entities/resolve-step.ts` | **Create** — `ResolveStepBodySchema` (`branch`, `payload`, `artifacts_out`, `idempotency_key`) |
| `contracts` | `src/capabilities.ts` or grants | **Add** `step:resolve` capability |
| `contracts` | `src/journal.ts` | **Add** `mrmr.step.opened`, `mrmr.step.resolved` event types (no dual-write yet) |
| `hub-core` | `src/flow-engine/step-contract-compile.ts` | **Create** — YAML → catalog; flatten nested steps to qualified ids |
| `hub-core` | `src/flow-engine/parse.ts` | **Update** — parse single `step` block; reject bare `invoke:`/`checkpoint:` at strict apply (error message points to migration doc) |
| `hub-core` | `src/flow-engine/compile.ts` | **Wire** catalog into index entry |
| `hub-core` | `src/flow-engine/types.ts` | **Extend** indexed flow with `step_contract_catalog` |
| `cli` | `src/commands/space/apply.ts` | **Surface** catalog digest in apply output |
| `cli` | `src/lint/flow-manifest.ts` | **Create/extend** — branch coverage, dead step detection, token lint |
| `hub-daemon` | `src/routes/spaces/apply.ts` | **Persist** catalog on apply |

**Explicitly NOT in VS-1:** resolve handler, runner merge, delete old tools.

### Docs / tutorial changes

| File | Action |
|------|--------|
| `studio-specs/current/bridges/step-contract.md` | **Create** — normative authoring shape (single step block, branches, nested `steps:`) |
| `apps/docs/guide/creating-flows.md` | **Add** "Step contracts (v2.2)" section linking bridge |
| `apps/docs/guide/tutorials/01-local-preview-review/05-flow-manifest.md` | **Add** callout: "Migrating in VS-7 — current invoke/checkpoint still shown until cutover" |

### Skill changes

| File | Action |
|------|--------|
| `packages/cli/skill/reference/flows.md` | **Create or extend** — document target manifest shape |

### Spec updates

| File | Action |
|------|--------|
| `studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md` | **Update** status → "In progress (VS-1)" |
| `studio-specs/current/bridges/step-contract.md` | Normative (above) |

### Tests updates

| File | Coverage |
|------|----------|
| `packages/hub-core/test/unit/flow-engine/step-contract-compile.test.ts` | **Create** — nested flatten, branch routes, token lint |
| `packages/hub-daemon/test/http/spaces/apply.test.ts` | **Extend** — catalog persisted, strict rejects legacy invoke/checkpoint |
| `packages/cli/test/docs-proof.test.ts` | **Extend** — bridge doc exists |

**Run:** `pnpm --filter @murrmure/hub-core test step-contract-compile` + apply tests.

### Manual testing protocol (murrmuretuto)

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Add **parallel** test manifest `murrmure/flows/preview-review-v2/flow.manifest.yaml` in new shape (do not switch default flow yet) | File valid YAML |
| 2 | `mrmr space apply --strict` | Fails on legacy `preview-review` with clear migration error OR passes if dual manifest allowed for test — **dev must document behavior** |
| 3 | Apply v2-shaped test flow only | Catalog digest printed; `mrmr space status` shows digest field |
| 4 | Introduce typo `{{murrmure.unknown_token}}` in test manifest | Strict apply fails with token error |

**Note:** Full run not expected until VS-2. Manual PASS = compile + apply behavior correct.

**Acceptance file:** `studio-specs/plans/acceptance/vs-1-catalog-manual.md`

### Slice gate

- [ ] Types exported from `@murrmure/contracts`
- [ ] Catalog compile tests green
- [ ] `step-contract.md` bridge written
- [ ] Manual apply strict behavior verified

---

## VS-2 — Unified resolve API + linear step runner

**Branch:** `feat/step-contracts-vs-2-resolve`  
**Depends on:** VS-1  
**Implements:** v2.2 § Unified step API, § Routing (top-level linear), § Engine invariants (partial), § Executors (`explicit_resolve`)

### Goals

- **One write path:** `POST /v1/runs/{run_id}/steps/{step_id}/resolve` + `murrmure_resolve_step`.
- **Single advance runner** for top-level linear steps (intake → write_spec → build → …) using catalog routes.
- Agent steps complete only via **`resolve_step`**, not subprocess exit alone.

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-2.1 | Agent | `murrmure_resolve_step({ step_id, branch, payload })` | One MCP tool for all step completions |
| US-2.2 | Human view | Submit form → same resolve handler | Views and agents share semantics |
| US-2.3 | Operator | No `complete_action` / gate resolve for flow steps | Tutorial 1 issues I1/I4 are structurally impossible |

### Code changes

| Package | Path | Action |
|---------|------|--------|
| `hub-core` | `src/flow-engine/step-resolve.ts` | **Create** — validate branch schema, merge output, apply route, call advance |
| `hub-core` | `src/flow-engine/advance-runner.ts` | **Refactor** — use catalog routes; open next step; dispatch executor |
| `hub-core` | `src/flow-engine/checkpoint-runner.ts` | **Delete or fold** into advance runner (linear human steps only) |
| `hub-core` | `src/flow-engine/checkpoint-resolve.ts` | **Delete** flow progression paths |
| `hub-core` | `src/projections/step-memo.ts` | **Update** — statuses: `awaiting_human`, `working`, terminal |
| `hub-daemon` | `src/routes/runs/resolve-step.ts` | **Create** — HTTP handler |
| `hub-daemon` | `src/mcp-handlers.ts` | **Add** `murrmure_resolve_step`; **remove** handler registration for flow use of `complete_action` |
| `hub-daemon` | `src/mcp-tool-registry.ts` | **Add** `murrmure_resolve_step` (`step:resolve`); mark old tools deprecated in registry comments only until VS-8 |
| `hub-daemon` | `test/http/actions/complete-action.test.ts` | **Replace** with `resolve-step.test.ts` |
| `shell-web` / view-sdk | view submit path | **Route** to resolve-step (minimal — full ViewCanvasHost in VS-3) |

**Migration for murrmuretuto (dev agent):** convert `preview-review` manifest to v2.2 **linear** shape (keep top-level `review` for now — nested comes VS-7):

```yaml
# interim linear manifest — review still top-level until VS-7
steps:
  - id: intake
    presentation: { view: preview-review-intake }
    branches:
      continue: { schema: …, next: write_spec }
      cancel: { …, fail_run: true }
  - id: write_spec
    executor: { action: feature_write_spec, params: … }
    branches:
      completed: { …, next: build }
      failed: { …, fail_run: true }
  # build, review, archive, commit — same pattern
```

### Docs / tutorial changes

| File | Action |
|------|--------|
| `apps/docs/reference/mcp-tools.md` | **Document** `murrmure_resolve_step`; strike `complete_action` for flow steps |
| `packages/cli/skill/reference/mcp.md` | **Same** |
| `apps/docs/guide/tutorials/01-local-preview-review/08-run-the-loop.md` | **Update** Step 4: `resolve_step` with `branch: completed` instead of `complete_action` |

### Skill changes

| File | Action |
|------|--------|
| `murrmuretuto/skills/feature-build/SKILL.md` | **Update** — `resolve_step` for build completion (linear: still top-level review) |
| `examples/flows/preview-review-v2/skills/feature-build/SKILL.md` | **Mirror** interim linear instructions |

### Spec updates

| File | Action |
|------|--------|
| `studio-specs/current/bridges/step-contract.md` | **Add** resolve API section |
| `studio-specs/current/bridges/action-invoke.md` | **Update** — flow steps use resolve, not complete_action |

### Tests updates

| File | Coverage |
|------|----------|
| `packages/hub-daemon/test/http/runs/resolve-step.test.ts` | **Create** — agent resolve, idempotency, wrong branch |
| `packages/hub-core/test/unit/flow-engine/advance-runner.test.ts` | **Extend** — linear next routing |
| `packages/hub-daemon/test/http/deprecated-removed.test.ts` | **Prepare** — list complete_action as deprecated until VS-8 |

### Manual testing protocol (murrmuretuto)

**Prerequisites:** Re-apply space with migrated linear manifest; mint grant with `step:resolve`.

| Step | Tutorial beat | Action | Pass criteria |
|------|---------------|--------|---------------|
| 1 | Start | Desktop → Run preview-review | Run created |
| 2 | Intake | Attach `~/Documents/hero-section.md`, submit | `resolve_step` equivalent via view; run advances to write_spec |
| 3 | write_spec | Agent runs (or mock via curl resolve) | `specs/current/hero-section.md` exists |
| 4 | build | Agent resolves `build` branch `completed` with `{ preview_url }` | Run advances to review; output on step memo |
| 5 | review | Human validates in view | Resolves branch `validated`; run advances to archive |
| 6 | MCP | Cursor agent uses `murrmure_resolve_step` only | No `complete_action` in agent transcript |

**Acceptance file:** `studio-specs/plans/acceptance/vs-2-resolve-manual.md`

### Slice gate

- [ ] HTTP + MCP resolve work for linear flow
- [ ] Tutorial Part 8 steps 2–5 pass on murrmuretuto (archive/commit may be VS-2 or VS-3)
- [ ] Tests green

---

## VS-3 — Shell human resolve + ViewCanvasHost by step_id

**Branch:** `feat/step-contracts-vs-3-shell-views`  
**Depends on:** VS-2  
**Implements:** v2.2 § Human checkpoints without Gate entity, § Relation to product north star

### Goals

- ViewCanvasHost binds to **`step_id` + run`**, not gate id.
- View SDK `submit(params, artifacts?)` → resolve-step.
- **Notifications / Needs you** query step memos `status = awaiting_human` (not gates table for flow).

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-3.1 | Human reviewer | Custom view full canvas for intake/review | I never see generic gate forms as primary UX |
| US-3.2 | Shell | Iframe view auth (cookie) still works | Phase A H2 fix preserved |
| US-3.3 | Author | Assignees on `presentation` | Review step shows in my inbox |

### Code changes

| Package | Path | Action |
|---------|------|--------|
| `shell-web` | ViewCanvasHost binding | **Resolve** active step from run memos, not gate queue |
| `shell-web` | notifications | **Query** awaiting_human steps |
| `view-sdk` | submit API | **Target** `POST …/steps/{step_id}/resolve` |
| `hub-core` | `src/gates/service.ts` | **Remove** flow progression via gates; keep orchestration approval only |
| `hub-daemon` | `test/http/gates/resolve.test.ts` | **Narrow** to orchestration gates only |
| `hub-daemon` | `test/http/flows/requires-view.test.ts` | **Update** — step memo driven |

### Docs / tutorial changes

| File | Action |
|------|--------|
| `apps/docs/guide/views.md` or checkpoint docs | **Update** — ctx.step_id, ctx.contract |
| `apps/docs/guide/tutorials/01-local-preview-review/06-build-views.md` | **Note** view submit → resolve |

### Skill changes

- None (views are human-facing).

### Spec updates

| File | Action |
|------|--------|
| `studio-specs/current/bridges/step-contract.md` | **Add** presentation + ViewCanvasHost section |
| `studio-specs/current/bridges/product.md` | **Remove** gate.resolve from flow progression table |

### Tests updates

| File | Coverage |
|------|----------|
| `packages/shell-web/src/...` | **Extend** view binding tests |
| `packages/hub-daemon/test/http/flows/requires-view.test.ts` | intake + review views |

### Manual testing protocol (murrmuretuto)

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Full run through intake + review in Desktop | Both views render in ViewCanvasHost (screenshots) |
| 2 | DevTools → iframe | No `token_denied`; relative asset paths load |
| 3 | Shell notifications | "Needs you" when review awaiting_human |
| 4 | Validate + feedback branches | Correct run advancement (feedback stays on review until VS-7 nested) |

**Acceptance file:** `studio-specs/plans/acceptance/vs-3-shell-views-manual.md`

### Slice gate

- [ ] No flow progression via `POST /gates/.../resolve`
- [ ] Full Tutorial 1 UI path works in Desktop
- [ ] Automated view tests green

---

## VS-4 — Safety invariants (fail-fast, monotonic memos, timeouts)

**Branch:** `feat/step-contracts-vs-4-safety`  
**Depends on:** VS-2 (may parallel with VS-3 after VS-2 merges)  
**Implements:** v2.2 § Engine invariants 2–5, § Executor timeouts, Issues I2, ISSUE-14

### Goals

- Terminal run **rejects late resolve** (409).
- Run failure **cancels** in-flight executors.
- Step memos **monotonic** (terminal never regresses).
- Parent executor `timeout_ms` **excludes** human `awaiting_human` time.

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-4.1 | Operator | Failed run stops agent work | No zombie subprocesses after fail |
| US-4.2 | Agent author | 3600s build timeout that survives 30min human review | ISSUE-14 class failures gone |
| US-4.3 | Hub | Idempotent resolve on completed step | Safe MCP retries |

### Code changes

| Package | Path | Action |
|---------|------|--------|
| `hub-core` | `src/projections/step-memo.ts` | **Enforce** monotonic transitions |
| `hub-core` | `src/flow-engine/step-resolve.ts` | **Reject** resolve on terminal run |
| `hub-core` | `src/invoke/` | **Cancel** executors on run fail |
| `hub-core` | executor scheduler | **Pause** parent timeout while child step `awaiting_human` |
| `hub-daemon` | notifications on ACTION_TIMED_OUT | **Improve** message |

### Docs / tutorial changes

| File | Action |
|------|--------|
| `apps/docs/guide/tutorials/01-local-preview-review/09-troubleshooting.md` | **Update** timeout section — human time excluded |
| `examples/flows/preview-review-v2/murrmure/actions.yaml` | **Set** `feature_write_spec.timeout_ms: 300000` default |

### Skill changes

- None.

### Spec updates

| File | Action |
|------|--------|
| `studio-specs/plans/2026-07-07-phase-a-findings.md` | **Append** ISSUE-14 → fixed in VS-4 |
| `studio-specs/current/bridges/step-contract.md` | **Add** invariants section |

### Tests updates

| File | Coverage |
|------|----------|
| `packages/hub-core/test/unit/flow-engine/step-resolve.test.ts` | late resolve rejected |
| `packages/hub-core/test/unit/projections/step-memo.test.ts` | monotonic |
| `packages/hub-daemon/test/http/actions/invoke-run-failed-notification.test.ts` | cancel on fail |
| New timeout test | human wait excluded |

### Manual testing protocol (murrmuretuto)

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Start run; cancel at intake | Run failed; late resolve → 409 |
| 2 | write_spec with slow agent (< timeout) + long pause on review | Run does NOT fail with ACTION_TIMED_OUT during review wait |
| 3 | Force fail run during build | Subprocess cancelled (check hub logs / process list) |

**Acceptance file:** `studio-specs/plans/acceptance/vs-4-safety-manual.md`

### Slice gate

- [ ] ISSUE-14 repro from Phase A no longer fails
- [ ] Invariant tests green

---

## VS-5 — Discovery injection + active-step-contract.json

**Branch:** `feat/step-contracts-vs-5-discovery`  
**Depends on:** VS-2, VS-4  
**Implements:** v2.2 § Step contract catalog (runtime slice), § Prompt and environment injection, § list_step_contracts

### Goals

- Hub writes **`active-step-contract.json`** on every step transition.
- Shell/agent prompts receive **`MURRMURE_STEP_CONTRACT`** JSON slice.
- **`murrmure_list_step_contracts`** for advanced discovery.
- Remove hand-written MCP instructions from default prompts.

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-5.1 | Agent in long shell session | Re-read contract file after transitions | I don't rely on stale env vars (I3 fix) |
| US-5.2 | Action author | `{{murrmure.agentStepContract}}` in prompt | Machine contract is authoritative |
| US-5.3 | Complex flow author | `list_step_contracts` | Agents discover callable steps without whole-flow prompt |

### Code changes

| Package | Path | Action |
|---------|------|--------|
| `hub-core` | `src/flow-engine/step-contract-slice.ts` | **Create** — `StepContractSlice(run, stepId)` |
| `hub-core` | `src/flow-engine/advance-runner.ts` | **Write** `active-step-contract.json` on open/goto |
| `hub-core` | action prompt renderer | **Inject** tokens + JSON env |
| `hub-daemon` | MCP `murrmure_list_step_contracts` | **Create** |
| `hub-daemon` | `GET /v1/runs/{id}/step-contracts` | **Create** |
| `cli` | prompt token indexer | **Validate** `{{murrmure.*}}` at apply |

### Docs / tutorial changes

| File | Action |
|------|--------|
| `apps/docs/guide/tutorials/01-local-preview-review/04-prompt-triggers.md` | **Replace** hand-written MCP list with contract injection |
| `apps/docs/reference/mcp-tools.md` | **Document** `list_step_contracts` |

### Skill changes

| File | Action |
|------|--------|
| `murrmuretuto/skills/feature-build/SKILL.md` | **Rewrite** — read `active-step-contract.json`, use `resolve_step` / `wait_for_run` per slice |
| `examples/flows/preview-review-v2/skills/feature-build/SKILL.md` | **Mirror** |
| `packages/cli/skill/reference/mcp.md` | **Document** contract file loop |

### Spec updates

| File | Action |
|------|--------|
| `studio-specs/current/bridges/step-contract.md` | **Add** injection + catalog slice sections |

### Tests updates

| File | Coverage |
|------|----------|
| `packages/hub-core/test/unit/flow-engine/step-contract-slice.test.ts` | slice shape, then-hints |
| `packages/hub-daemon/test/http/runs/step-contracts.test.ts` | list endpoint |
| `packages/cli/test/preview-review-v2-example.test.ts` | **Update** — no `complete_action` in skill |

### Manual testing protocol (murrmuretuto)

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Start run; inspect `.mrmr.temp/runs/{run_id}/active-step-contract.json` | Exists; matches active step |
| 2 | Advance to write_spec | File rewritten with new step_id |
| 3 | Inspect resolved `feature_build` prompt (hub debug or log) | Contains `MURRMURE_STEP_CONTRACT` or markdown block |
| 4 | MCP `murrmure_list_step_contracts` | Returns active slice + graph_digest |

**Acceptance file:** `studio-specs/plans/acceptance/vs-5-discovery-manual.md`

### Slice gate

- [ ] Contract file updates on transitions
- [ ] Skill/tests don't reference complete_action
- [ ] Prompt injection verified manually

---

## VS-6 — Step artifacts + workdirs

**Branch:** `feat/step-contracts-vs-6-artifacts`  
**Depends on:** VS-5  
**Implements:** v2.2 § Step artifacts, artifact tokens in injection

### Goals

- Per-step **`work/`** scratch and stable post-resolve artifact paths.
- Resolve accepts **`artifacts_out`**; promotes to registered slots.
- Prompt tokens **`{{murrmure.step.{id}.artifact.{slot}.path}}`**.

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-6.1 | Agent | Spec path injected from intake artifact | I don't parse arbitrary payload shapes |
| US-6.2 | Human intake view | Upload spec → artifact slot | Large markdown not in inline payload |
| US-6.3 | Downstream step | Reference prior artifact by slot | Params stay small |

### Code changes

| Package | Path | Action |
|---------|------|--------|
| `hub-core` | artifact promotion on resolve | **Implement** `artifacts_out` |
| `hub-core` | workdir layout | **Create** `.mrmr.temp/runs/{run_id}/steps/{qualified}/work/` |
| `hub-daemon` | artifacts transfer integration | **Wire** intake upload → slot |
| `view-sdk` | submit with artifacts | **Support** file upload → artifacts_out |
| `contracts` | resolve body | Already in VS-1 — wire validation |

### Docs / tutorial changes

| File | Action |
|------|--------|
| `studio-specs/current/bridges/artifacts.md` | **Update** — step-scoped layout |
| `apps/docs/guide/tutorials/01-local-preview-review/05-flow-manifest.md` | **Document** artifact slots on branches |

### Skill changes

| File | Action |
|------|--------|
| `murrmuretuto/skills/feature-build/SKILL.md` | Use `{{murrmure.step.intake.artifact.spec.path}}` or injected path |
| `examples/flows/preview-review-v2/agent.md` | **Update** artifact references |

### Spec updates

| File | Action |
|------|--------|
| `studio-specs/current/bridges/step-contract.md` | **Add** artifacts section |

### Tests updates

| File | Coverage |
|------|----------|
| `packages/hub-daemon/test/http/artifacts/transfer.test.ts` | **Extend** step resolve promotion |
| `packages/hub-core/test/unit/flow-engine/step-resolve-artifacts.test.ts` | **Create** |

### Manual testing protocol (murrmuretuto)

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Intake attach spec file | Artifact registered; path in contract slice |
| 2 | write_spec resolves with spec artifact | `specs/current/` file matches attachment |
| 3 | build prompt | Contains spec path token from intake slot |
| 4 | resolve with `artifacts_out` screenshot slot (optional) | Path in run artifacts map |

**Acceptance file:** `studio-specs/plans/acceptance/vs-6-artifacts-manual.md`

### Slice gate

- [ ] Artifact paths injected into build prompt
- [ ] Tests green

---

## VS-7 — Nested steps + engine-routed goto

**Branch:** `feat/step-contracts-vs-7-nested`  
**Depends on:** VS-5, VS-6  
**Implements:** v2.2 § Nested steps, § Engine-routed lifecycle, § Orchestration modes, D2–D4

### Goals

- **`build`** parent with nested **`build.build-loop`** ⇄ **`build.review`**.
- **Remove top-level `review`** step.
- Engine opens **`build.review`** after agent resolves build-loop — agent does **not** invoke review.
- Loop: `changes_required` → `continue: parent` + `goto: build-loop`.

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-7.1 | Tutorial follower | One build agent session for code + review waits | Mixed orchestration without complete_action |
| US-7.2 | Flow author | Portable nested block | I can reuse build+review in another flow |
| US-7.3 | Operator | Nested steps visible in run graph | Observability shows loop iterations |

### Code changes

| Package | Path | Action |
|---------|------|--------|
| `hub-core` | `advance-runner.ts` | **Nested** open, one active child, goto, complete:parent |
| `hub-core` | `step-resolve.ts` | **Nested** route vocabulary |
| `hub-core` | `get_run_graph` | **Show** nested nodes |
| `examples/flows/preview-review-v2/murrmure/flows/preview-review/flow.manifest.yaml` | **Rewrite** — nested build |
| `murrmuretuto/murrmure/flows/preview-review/flow.manifest.yaml` | **Mirror** |

**Target manifest shape (abbreviated):**

```yaml
steps:
  - id: intake
    …
  - id: write_spec
    …
  - id: build
    orchestration: engine-routed
    executor: { action: feature_build, params: … }
    steps:
      - id: build-loop
        description: Implement site; resolve when preview URL ready.
        branches:
          completed: { schema: …, goto: review }   # engine opens build.review
          failed: { …, fail: true }
      - id: review
        presentation: { view: preview-review, assignees: … }
        branches:
          validated: { …, complete: parent }
          changes_required: { …, continue: parent, goto: build-loop }
          cancel: { …, fail: true }
  - id: archive
    …
  - id: commit
    …
```

### Docs / tutorial changes

| File | Action |
|------|--------|
| `apps/docs/guide/tutorials/01-local-preview-review/index.md` | **Rewrite** story table — review inside build |
| `apps/docs/guide/tutorials/01-local-preview-review/05-flow-manifest.md` | **Full** nested manifest |
| `apps/docs/guide/tutorials/01-local-preview-review/08-run-the-loop.md` | **Rewrite** build loop — resolve build-loop, wait for build.review |
| `examples/flows/preview-review-v2/README.md` | **Update** |

### Skill changes

| File | Action |
|------|--------|
| `murrmuretuto/skills/feature-build/SKILL.md` | **Final** — contract file loop, resolve `build.build-loop`, wait, no invoke review |
| `examples/flows/preview-review-v2/skills/feature-build/SKILL.md` | **Mirror** |
| `examples/flows/preview-review-v2/murrmure/actions.yaml` | Remove complete_action/wait_for_gate prose |
| `examples/flows/preview-review-v2/agent.md` | **Update** |

### Spec updates

| File | Action |
|------|--------|
| `studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md` | Status → "Shipped" when VS-8 completes |
| `studio-specs/current/bridges/flow-engine.md` | **Replace** invoke/checkpoint with step contract model |

### Tests updates

| File | Coverage |
|------|----------|
| `packages/hub-core/test/unit/flow-engine/nested-steps.test.ts` | **Create** — goto loop, complete:parent |
| `packages/cli/test/preview-review-v2-example.test.ts` | **Rewrite** — nested manifest assertions |
| `packages/hub-daemon/test/http/runs/nested-resolve.test.ts` | **Create** — qualified step ids |

### Manual testing protocol (murrmuretuto)

**Full Tutorial 1 loop on nested manifest:**

| Step | Beat | Pass criteria |
|------|------|---------------|
| 1 | Intake | Spec attached |
| 2 | write_spec | `specs/current/hero-section.md` |
| 3 | build session | Single Cursor agent spawn |
| 4 | build.build-loop | Agent resolves with preview_url |
| 5 | build.review | Engine opens review **without** agent invoke; view shows iframe |
| 6 | Feedback round | Send feedback → agent fixes → engine reopens build-loop → review again |
| 7 | Validate | Parent build completes → archive → commit |
| 8 | Git | Commit hash recorded; run **completed** |

**Record:** run_id, session_id, iteration count, screenshots.

**Acceptance file:** `studio-specs/plans/acceptance/vs-7-nested-manual.md`

### Slice gate

- [ ] Full loop with feedback round passes
- [ ] Run graph shows nested steps
- [ ] No top-level review step

---

## VS-8 — Hard cutover cleanup + publication

**Branch:** `feat/step-contracts-vs-8-cutover`  
**Depends on:** VS-7  
**Implements:** v2.2 § Hard cutover, D8, deleted tools list

### Goals

- **Delete** `murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate` from MCP registry.
- **Delete** `POST /v1/gates/{id}/resolve` for **flow** progression (orchestration approval remains).
- **Delete** invoke/checkpoint YAML parsing — strict apply rejects legacy manifests.
- Publish docs, skills, examples, tutorials aligned with v2.2.

### User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-8.1 | Maintainer | No dual code paths | Debt from v2.1 reviews eliminated |
| US-8.2 | New user | Tutorial only teaches resolve_step | No obsolete MCP tools |
| US-8.3 | CI | deprecated-removed tests | Regressions caught |

### Code changes

| Package | Path | Action |
|---------|------|--------|
| `hub-daemon` | `mcp-tool-registry.ts` | **Remove** deleted tools |
| `hub-daemon` | `mcp-handlers.ts` | **Remove** handlers |
| `hub-daemon` | routes | **Remove** complete-action route for flow steps |
| `hub-core` | parse.ts | **Remove** invoke/checkpoint sugar |
| `hub-daemon` | `test/http/deprecated-removed.test.ts` | **Assert** 410/404 on old endpoints |
| All packages | grep cleanup | Remove `complete_action`, `wait_for_gate` strings in production code |

### Docs / tutorial changes

| File | Action |
|------|--------|
| `apps/docs/guide/tutorials/01-local-preview-review/*.md` | **Final pass** — no legacy terms |
| `apps/docs/guide/tutorials/index.md` | **Update** MCP table |
| `apps/docs/guide/cli.md` | apply strict migration note |
| `apps/docs/guide/known-gaps.md` | Close step-contract backlog item |
| `apps/docs/reference/mcp-tools.md` | **Final** tool list |

### Skill changes

| File | Action |
|------|--------|
| `packages/cli/skill/` | **Full sync** with v2.2 MCP surface |
| Regenerate published skill if version bump | `murrmure` skill v1.x → v2.0 |

### Spec updates

| File | Action |
|------|--------|
| `studio-specs/current/bridges/step-contract.md` | Mark **normative shipped** |
| `studio-specs/plans/README.md` | Move step contracts to shipped |
| `studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md` | Status → **Shipped** |

### Tests updates

| File | Coverage |
|------|----------|
| `packages/hub-daemon/test/http/deprecated-removed.test.ts` | **Complete** |
| `packages/cli/test/docs-proof.test.ts` | No stale tool names |
| Full CI | `pnpm test` green |

### Manual testing protocol (murrmuretuto)

**Regression suite (full Tutorial 1 + negative tests):**

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Fresh clone setup of murrmuretuto from tutorial docs | Parts 1–7 without deviating |
| 2 | Full Part 8 loop | Same as VS-7 |
| 3 | MCP tool list | `complete_action` absent |
| 4 | Apply legacy manifest | Strict fail with migration message |
| 5 | `mrmr doctor` (if updated) | No legacy skill warnings |

**Acceptance file:** `studio-specs/plans/acceptance/vs-8-cutover-manual.md`

### Slice gate

- [ ] All deprecated surfaces removed
- [ ] Full CI green
- [ ] Tutorial 1 completable from docs alone in murrmuretuto
- [ ] v2.2 spec marked shipped

---

## Orchestrator checklist (master)

| Slice | Dev branch | Review PASS | Manual PASS | Merged |
|-------|------------|-------------|-------------|--------|
| VS-0 | Bootstrap murrmuretuto + acceptance harness | ✅ PASS |
| VS-1 | Contracts + StepContractCatalog compile | ✅ PASS |
| VS-2 | Unified resolve API + linear runner | ✅ PASS |
| VS-3 | Shell human resolve + ViewCanvasHost | ✅ PASS |
| VS-4 | Safety invariants | ✅ PASS |
| VS-5 | Discovery injection | ✅ PASS |
| VS-6 | Step artifacts + workdirs | ✅ PASS |
| VS-7 | Nested steps + engine-routed goto | ✅ PASS |
| VS-8 | Hard cutover cleanup | ✅ PASS |

**Final release:** merge VS-8 to main; tag release notes referencing v2.2 step contracts.

---

## Risk register (orchestrator watches)

| Risk | Slice | Mitigation |
|------|-------|------------|
| Hard cutover breaks existing spaces | VS-8 | VS-2–7 migrate murrmuretuto incrementally; example flow tracks each slice |
| Nested goto reliability regression | VS-7 | Review agent checks engine opens review without agent invoke; manual feedback round required |
| Prompt injection too large | VS-5 | Review enforces slice not full graph; test token count |
| View auth regression | VS-3 | Manual iframe checks every slice touching shell |
| murrmuretuto drift from docs | VS-8 | Final manual = fresh setup from docs only |
| Scope explosion | All | Review `OUT_OF_SCOPE` flag; max 2 rework loops |

---

## References

- [Unified step contracts v2.2](./2026-07-07-step-contracts-unified-state-machine.md)
- [Phase A findings](./2026-07-07-phase-a-findings.md)
- [Tutorial 1](../../apps/docs/guide/tutorials/01-local-preview-review/index.md)
- [preview-review-v2 example](../../examples/flows/preview-review-v2/)
- [Opus](./step-contracts-v21review-opus.md) · [Codex](./step-contracts-v21review-codex.md) · [Sonnet](./step-contracts-v21review-sonnet.md) reviews
