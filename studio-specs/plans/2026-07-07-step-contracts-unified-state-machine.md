# Spec — Unified step contracts (v2.2)

**Date:** 2026-07-07  
**Updated:** 2026-07-08  
**Status:** In progress (VS-1 — catalog compile)  
**Inputs:** [Phase A findings](./2026-07-07-phase-a-findings.md), [reviews](./step-contracts-v21review-opus.md), [action-invoke bridge](../current/bridges/action-invoke.md), [artifacts bridge](../current/bridges/artifacts.md)

**Reviews:** [Opus](./step-contracts-v21review-opus.md) · [Codex](./step-contracts-v21review-codex.md) · [Sonnet](./step-contracts-v21review-sonnet.md)

---

## Summary

Murrmure today treats **invoke steps** and **checkpoint gates** as different protocol nouns with different completion paths. That split caused Tutorial 1 failures (I1–I4). The fix is **one run state machine, one step contract, one resolve API**.

**v2.2 foundation:**

| Pillar | Decision |
|--------|----------|
| **One step kind** | Authoring uses a single `step` shape (optional `executor`, optional `presentation`, `branches`, routes). No parallel invoke/gate runtime. |
| **One write API** | Agents/scripts/humans complete steps via **`murrmure_resolve_step`**. Step **activation** is engine-internal (same handler as today’s advance), not a public agent tool in the default mode. |
| **Nested steps** | Parent step holds a `steps:` graph (e.g. `build.build-loop` ⇄ `build.review`). One shell spawn for the parent; loop without re-invoking the action. |
| **Engine-routed `goto`** | After resolve, the **engine** opens the next step from manifest routes. Agent does **not** call “open review” on the happy path. |
| **Automated discovery** | `mrmr space apply` compiles a **StepContractCatalog**; runtime injects **scoped slices** + `active-step-contract.json` (not the whole flow in the prompt). |
| **Hard cutover** | **No** migration aliases, HTTP shims, dual-write journal events, or YAML sugar lowering. Delete old surfaces in the same release. |

---

## Issues traced (Tutorial 1)

| ID | Problem | v2.2 fix |
|----|---------|----------|
| I1 | Dual completion (shell exit vs gate vs complete_action) | `explicit_resolve`; kernel completion = branch resolve only |
| I2 | Failure doesn’t stop in-flight work | Monotonic memos, cancel executors, reject resolve on terminal runs |
| I3 | No contract injection | StepContractCatalog + scoped injection + contract file |
| I4 | Gate vs invoke split in UX and engine | One step contract; human checkpoint = step + `presentation.view` |
| I5 | Example/config nits | Downstream; not blocking kernel |

---

## Design thesis

```text
pending → active → resolved(branch) → engine routes → open(next) → …
```

A **step contract** defines:

- `id`, optional `description`
- `role`: `agent` | `human` | `system` (derived: has `presentation.view` ⇒ human-primary)
- `branches`: named outcomes + payload schema + optional artifact slots
- `routes`: per branch (see Routing)
- optional `executor` (engine dispatch on step open)
- optional `presentation` (view, assignees)
- optional nested `steps[]` (child graph under a parent)

**Fulfillment** (view, MCP, shell wrapper) calls the **same** resolve endpoint. **Activation** (open step, start executor, bind view) is the engine’s job unless `orchestration: agent-scheduled` is set on the parent.

---

## Step identity

| Scope | ID | Example |
|-------|-----|---------|
| Top-level | `{step_id}` | `write_spec`, `build`, `archive` |
| Nested | `{parent}.{child}` | `build.build-loop`, `build.review` |

- Dot separator; one nesting level in v2.2.
- Memos, journal, `exec_context.steps` use qualified keys.

### Step status (normative — extends contracts)

| Status | Meaning |
|--------|---------|
| `pending` | Not yet opened |
| `working` | Agent/system fulfillment in progress |
| `awaiting_human` | Presentation open; human must resolve |
| `completed` | Terminal success-family branch applied |
| `failed` | Terminal failure |
| `skipped` | Engine skipped (join/matrix edge cases) |

Run lifecycle `input-required` is **derived** from step memos (any step `awaiting_human`), not a separate protocol.

---

## Orchestration modes

Set on a parent step (or whole flow default `engine-routed`).

### `engine-routed` (default)

- Engine **opens** the next step when a branch route says so (`next`, `goto`, `complete: parent`).
- Agent **resolves** agent-owned steps and **waits** on human steps.
- Agent does **not** publicly invoke/open sibling steps on the happy path.
- Matches preview-review build/review loop with one `cursor agent` session.

### `agent-scheduled` (optional, advanced)

- Agent may call **`murrmure_invoke_step`** for steps in the catalog’s `callable` list (policy + prerequisites).
- Engine still validates grants and graph policy.
- Use when the author wants non-linear scheduling beyond declared routes.

---

## Unified step API

### Public MCP (agent-facing)

| Tool | Scope | Purpose |
|------|-------|---------|
| **`murrmure_resolve_step`** | `step:resolve` | Submit `branch`, `payload`, optional `artifacts_out` |
| **`murrmure_get_run`** | `space:read` | Run state, memos, outputs, active step |
| **`murrmure_wait_for_run`** | `space:read` | Long-poll until run or step terminal (existing; primary wait primitive) |
| **`murrmure_list_step_contracts`** | `space:read` | Active + callable steps with branch schemas (complex / agent-scheduled flows) |

**Not public in engine-routed mode:** `murrmure_invoke_step` (engine-internal only).

**Deleted (no aliases):** `murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate`, `POST /v1/gates/{id}/resolve` for flow progression.

### HTTP

```http
POST /v1/runs/{run_id}/steps/{step_id}/resolve
GET  /v1/runs/{run_id}
GET  /v1/runs/{run_id}/step-contracts          # list_step_contracts mirror
```

View SDK `submit(params, artifacts?)` → same resolve handler.

### Resolve body

```json
{
  "branch": "completed",
  "payload": { "preview_url": "http://127.0.0.1:5173" },
  "artifacts_out": [
    { "slot": "preview_screenshot", "path": "work/preview.png" }
  ],
  "idempotency_key": "optional"
}
```

**Branch selection:** caller sends **`branch`** explicitly. No runtime `on_resolve.when` / `disposition` routing — those compile to branch names at apply time.

### One API, all step IDs

Parent and nested children use the same resolve/wait/read surface. Qualification is addressing only.

| Step | Who opens (engine-routed) | Who resolves |
|------|---------------------------|--------------|
| `write_spec` | Engine on advance | Agent |
| `build` (parent) | Engine on advance + starts executor | Engine on child `complete: parent`; agent for `failed` |
| `build.build-loop` | Engine (first child + `goto` re-activation) | Agent |
| `build.review` | **Engine** after `build-loop` completes | Human view; agent waits |

---

## Routing

### Top-level steps

Each branch on a step:

```yaml
branches:
  completed:
    schema: …
    next: archive          # step id, or null = run completed if success branch
  failed:
    schema: …
    next: null
    fail_run: true
```

Backward loops: `next: build` from `review` on `changes_required`.

### Nested steps (under parent)

Nested routes are **local** (never reference top-level ids like `archive`).

| Route | Effect |
|-------|--------|
| `complete: parent` | Close nested graph; engine resolves parent success; advance top-level `next` |
| `continue: parent` | Merge child output/artifacts; parent stays active |
| `goto: <child_id>` | Engine opens sibling child (required for non-linear graphs) |
| `fail: true` | Fail parent + run |

Example:

```yaml
  - id: build
    description: Build and review loop until validated.
    orchestration: engine-routed
    executor:
      action: feature_build
      params:
        spec_filename: "{{input.spec_filename}}"
    steps:
      - id: build-loop
        description: Implement the site; resolve when preview URL is ready.

      - id: review
        description: Human validates preview — wait; do not resolve yourself.
        presentation:
          view: preview-review
          assignees: ["{{input.reviewer}}"]
        branches:
          validated:
            schema: …
            complete: parent
          changes_required:
            schema: …
            continue: parent
            goto: build-loop
          cancel:
            schema: …
            fail: true
```

Top-level flow: `intake → write_spec → build → archive → commit` (no top-level `review`).

### Engine-routed lifecycle (preview-review)

```text
1. Engine opens build → starts feature_build (one shell spawn)
2. Engine opens build.build-loop (first child)
3. Agent resolve_step(build.build-loop, completed, { preview_url, … })
4. Engine opens build.review (view, awaiting_human)   ← agent does NOT invoke
5. Agent wait_for_run until build.review terminal
6a. validated → complete: parent → build completed → engine opens archive
6b. changes_required → continue + goto build-loop → goto 3 (same shell)
```

---

## Step contract catalog (automated discovery)

Discovery is **generated from the manifest at apply time**, not hand-written in skills.

### Compile pipeline

```text
flow.manifest.yaml
  → mrmr space apply
  → compile StepContractCatalog (per flow, stored on index entry)
  → strict linter (branches, routes, schemas, dead steps, token refs)
```

### Catalog entry (per step)

```json
{
  "step_id": "build.build-loop",
  "parent_id": "build",
  "description": "Implement the site; resolve when preview URL is ready.",
  "role": "agent",
  "branches": {
    "completed": {
      "schema_ref": "murrmure.schemas/build_loop.completed.v1.json",
      "routes": [{ "engine": "open", "step_id": "build.review" }]
    },
    "failed": { "schema_ref": "…", "routes": [{ "fail_run": true }] }
  },
  "artifact_slots": { … },
  "executor": null
}
```

The catalog holds **all** steps (flat + nested). Nothing is copied into prompts wholesale.

### Runtime slice (scoped injection)

When step `S` becomes active, hub computes **`StepContractSlice(run, S)`**:

- active step id, role, description
- branch names + schemas + **`then`** hints (`engine opens X`, `goto Y`, `complete parent`)
- workdir path, iteration counter (nested loops)
- **`inputs_from_run`**: resolved artifact paths + inline fields from prior steps

**Does not include** the full flow graph.

### `active-step-contract.json`

For long-lived shell agents, env vars do not update mid-process. Hub writes:

```text
{space_root}/.mrmr.temp/runs/{run_id}/active-step-contract.json
```

Rewritten on **every** engine transition (`open`, `goto`, `complete: parent` child effects). Agent loop:

```text
read active-step-contract.json → resolve → wait → read again
```

Same schema as `StepContractSlice`.

### `murrmure_list_step_contracts`

```json
{
  "run_id": "run_…",
  "orchestration": "engine-routed",
  "active": { /* StepContractSlice */ },
  "callable": [ /* agent-scheduled only; steps agent may invoke_step */ ],
  "graph_digest": "sha256:…"
}
```

Complex flows: agent uses **`list_step_contracts` + `get_run`** instead of memorizing branches. Simple flows: initial prompt + contract file suffice.

### MCP JSON Schema

Tool descriptors for `murrmure_resolve_step` are generated **per active step** from catalog branch schemas (hub catalog rebuild on apply).

---

## Prompt and environment injection

**Principle:** author prose in `actions.yaml`; machine contract from catalog. **Never** inject the entire flow into one prompt.

### Primary: structured contract

| Delivery | Content |
|----------|---------|
| `MURRMURE_STEP_CONTRACT` | Initial `StepContractSlice` for parent dispatch (JSON) |
| `active-step-contract.json` | Updated slice on each transition (same shape) |
| `{{murrmure.agentStepContract}}` | Optional markdown render of active slice (composite) |

Example generated markdown (engine-routed nested loop):

```markdown
## Active step: build.build-loop (iteration 2)
Implement the site; resolve when preview URL is ready.
Workdir: .mrmr.temp/runs/run_…/steps/build.build-loop/work

When ready: murrmure_resolve_step({ step_id: "build.build-loop", branch: "completed", payload: … })
Then: engine opens build.review — do NOT invoke review yourself.

When review opens: murrmure_wait_for_run until build.review is terminal.
If changes_required: read steps.build.review.output; engine re-opens build.build-loop.

Abort parent: murrmure_resolve_step({ step_id: "build", branch: "failed", … })
```

### Secondary: atomic tokens (author wraps with prose)

| Token | Use |
|-------|-----|
| `{{murrmure.run_id}}` | Run id |
| `{{murrmure.space_root}}` | Space root |
| `{{murrmure.step.{qualified}.description}}` | Author description |
| `{{murrmure.step.{qualified}.workdir}}` | Scratch path |
| `{{murrmure.step.{qualified}.iteration}}` | Loop iteration |
| `{{murrmure.step.{qualified}.artifact.{slot}.path}}` | Artifact path |
| `{{murrmure.step.{qualified}.artifact.{slot}.transfer_id}}` | Hub artifact id |
| `{{murrmure.inputs.json}}` | Prior-step inputs slice from catalog |

**Removed from default injection:** per-branch `.invoke.mcp` strings; `sequencing.rules` that tell agents to invoke the next step in engine-routed mode.

**Indexer:** unknown `{{murrmure.*}}` → `space apply --strict` error.

**After wait:** agents must **`get_run`** for fresh `steps.*.output` (prompt tokens may be stale).

### Example action prompt

```yaml
feature_build:
  executor: shell
  prompt: |
    Follow agent.md. Author notes below; contract is authoritative.

    Spec: {{murrmure.step.write_spec.artifact.spec.path}}
    Reviewer: {{murrmure.inputs.reviewer}}

    {{murrmure.agentStepContract}}

    During the loop, re-read:
      {{murrmure.space_root}}/.mrmr.temp/runs/{{murrmure.run_id}}/active-step-contract.json
  command: cursor agent -p --force "{{prompt}}"
  cwd: "{{space_root}}"
  timeout_ms: 3600000
```

### Shell environment

| Variable | Content |
|----------|---------|
| `MURRMURE_STEP_CONTRACT` | Initial JSON slice |
| `MURRMURE_ACTIVE_STEP_CONTRACT_PATH` | Path to `active-step-contract.json` |
| `MURRMURE_STEP_WORKDIR` | Active step workdir |
| `MURRMURE_RUN_ARTIFACTS` | JSON map of resolved artifacts on run |
| `MURRMURE_PROMPT` | Fully resolved prompt |

### Executor timeouts

- `timeout_ms` on parent executor = **agent work only** (coding subprocess).
- Human `awaiting_human` time is **excluded** (separate optional `presentation.expires_at` per step).
- Prevents ACTION_TIMED_OUT during long human review (Opus C3).

---

## Step artifacts

| Channel | Limit | Access |
|---------|-------|--------|
| Inline `payload` | ≤ 64 KiB | `get_run`, templates |
| Artifacts | TTL-bound | Paths under `.mrmr.temp/` + `transfer_id` |

### Layout

```text
.mrmr.temp/
  runs/{run_id}/steps/{qualified_step_id}/     # stable after resolve
  runs/{run_id}/steps/{qualified_step_id}/work/  # scratch while active
  active-step-contract.json                    # discovery slice (run root)
  inbox/… outbox/…                             # hub transfer (internal)
```

Resolve promotes `artifacts_out[].path` (relative to workdir) to registered slots. View upload on intake uses the same path.

Downstream: `artifacts_in` on executor params references `{{murrmure.step.intake.artifact.spec.transfer_id}}` or injected paths.

---

## Human checkpoints without Gate entity (flow steps)

Flow human steps are contracts with `presentation.view`. **Delete** parallel flow progression via `gates` table + `gate.resolve`.

- ViewCanvasHost binds to `step_id` + run.
- Notifications / “Needs you” = **query** over step memos where `status = awaiting_human`.
- View SDK: `ctx.step_id`, `ctx.contract` (slice); submit → resolve.

**Orchestration approval** (agent attach pipeline) is **not** a flow step — keep as separate approval surface or a dedicated `system` step type; do not conflate with checkpoint collapse (Opus C7).

---

## Executors

| Kind | Opens | Completes |
|------|-------|-----------|
| Shell script | Engine on step open | `resolve_step` (wrapper may map exit 0 → resolve internally) |
| `cursor agent` | Engine on parent open | **`resolve_step` only** — subprocess exit ≠ done |
| Human view | Engine on step open | View submit → resolve |

Default for agent actions: **`explicit_resolve`**. No long-lived `shell_exit` as a kernel concept for flow steps.

---

## Engine invariants

1. **Single advance function** — validate resolve → merge output/artifacts → apply branch route → open next (internal) → dispatch top-level when parent completes.
2. **Fail-fast** — terminal run before downstream top-level dispatch.
3. **Cancellation** — run failure cancels executors; reject late resolve.
4. **Monotonic memos** — terminal status never regresses.
5. **Schema + artifact validation** on every resolve.
6. **One active nested child** under a parent (engine-routed).
7. **Engine opens next step** on routes (default); agent does not invoke on happy path.
8. **Journal** — only `mrmr.step.opened`, `mrmr.step.resolved` (no dual-write legacy).

---

## Authoring shape (target — hard cutover)

Single step block in manifest (illustrative; exact YAML TBD in `step-contract.md` bridge):

```yaml
steps:
  - id: intake
    description: Human attaches spec markdown.
    presentation:
      view: preview-review-intake
    branches:
      continue: { schema: …, next: write_spec }
      cancel: { schema: …, next: null, fail_run: true }

  - id: write_spec
    description: Agent writes spec to repo.
    executor: { action: feature_write_spec, params: … }
    branches:
      completed: { schema: …, next: build }
      failed: { schema: …, next: null, fail_run: true }
```

No parallel `invoke:` / `checkpoint:` runtime kinds.

---

## Implementation order (clean rebuild)

| Order | Work |
|-------|------|
| 1 | **Contracts** — step status enum, StepContractCatalog compile, single step manifest shape |
| 2 | **Engine** — one advance/resolve runner; delete checkpoint-runner split |
| 3 | **API** — `POST …/steps/…/resolve`; delete gate flow resolve, complete_action, wait_for_gate |
| 4 | **Shell** — ViewCanvasHost + client resolve by step_id; notifications from step memos |
| 5 | **Discovery** — slice generator, `active-step-contract.json`, `list_step_contracts`, injection |
| 6 | **Safety** — monotonic memos, terminal reject, executor cancel, split human/agent timeouts |
| 7 | **Artifacts** — workdirs, `artifacts_out`, path injection |
| 8 | **Reference** — rewrite preview-review-v2 manifest, actions, skills, tutorial (nested build) |

No phased aliases. One release cut.

---

## Resolved decisions

| # | Decision |
|---|----------|
| D1 | One resolve API for all step ids; activation engine-internal (engine-routed default) |
| D2 | **Keep nested steps** under parent `build`; remove top-level `review` |
| D3 | **Engine-driven `goto`** — agent resolves + waits; engine opens next child |
| D4 | Nested routes: `complete \| continue \| goto \| fail`; no top-level ids in nested routes |
| D5 | **StepContractCatalog** at apply; **scoped slice** + **active-step-contract.json** at runtime |
| D6 | **`list_step_contracts`** for complex / agent-scheduled discovery |
| D7 | Injection: JSON contract primary; small atom token set; no whole-flow prompts |
| D8 | **Hard cutover** — no aliases, shims, dual-write, invoke/checkpoint sugar |
| D9 | Flow human steps replace gate entity for progression; orchestration approval separate |
| D10 | Executor timeout excludes human review time |
| D11 | Optional `orchestration: agent-scheduled` exposes public `invoke_step` |

---

## Relation to product north star

Custom views remain the human OS (`presentation.view` → ViewCanvasHost). Unifying contracts changes **how the kernel hears outcomes**, not view authoring. Flow preview (admin) shows nested steps and goto edges; that is observability, not the product surface.

---

## References

- [Phase A findings](./2026-07-07-phase-a-findings.md)
- [Opus review](./step-contracts-v21review-opus.md) · [Codex review](./step-contracts-v21review-codex.md) · [Sonnet review](./step-contracts-v21review-sonnet.md)
- [action-invoke.md](../current/bridges/action-invoke.md) · [artifacts.md](../current/bridges/artifacts.md)
- [philosophy.md](../current/product/philosophy.md)
- [preview-review-v2 example](../../examples/flows/preview-review-v2/)

---

## Decision requested

Adopt **unified step contracts v2.2** (nested steps, engine-routed discovery, hard cutover):

- [ ] **Yes** — proceed normative `step-contract.md` bridge + implementation order above
- [ ] **Yes** — kernel only first; defer nested manifest migration
- [ ] **No** — narrower scope

**Recommendation:** First checkbox — catalog + single runner + resolve API, then nested preview-review in the same cut.
