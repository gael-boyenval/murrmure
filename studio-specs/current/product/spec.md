# Space–Flow–Protocol v2 — Spec Revision 1

**Status:** ✅ normative — promoted from rev-1 (phase 16, 2026-06-30)  
**Supersedes:** [space-flow-protocol-v2.md](../../archives/plans/space-flow-protocol-v2.md) draft

---

## 0. What changed in rev-1

This revision **preserves** the v2 boundary philosophy and product goal. It **fixes entity precision**, **resolves open questions**, **cuts over-engineering**, and **resequences migration** based on cross-reference review.

| Area | v2 draft (2026-06-28) | rev-1 (2026-06-29) |
|------|------------------------|---------------------|
| Unit of work | **Session** does everything | **Session** (correlation) + **Run** (immutable execution unit) |
| Parallel lanes | Lanes inside session projection | **Sibling Runs** under one Session |
| Session identity | Open (#2 path vs opaque) | **Resolved:** opaque ids + CloudEvents `subject` path |
| Action / invoke | Deferred executor model | **Action + Executor** first-class; invoke preflight required |
| Triggers | `triggers.yaml` + flow `on:` overlap | **Hooks** (space reactors) vs **flow start conditions** |
| View | Hub view registry (Slice F) | **View = architectural rule**; hub stores no view entity |
| Flow visibility | `scope: local \| global` property | **Grants only**; file location is hint |
| ACL | 4-level ladder + PLATFORM_SCOPES | **Single capability grant model** |
| Headless invoke | "Attach to session when possible" | **Mandatory** session + run on every hub delivery |
| Journal | Ad hoc `HubEvent` | **CloudEvents-shaped envelope** with `subject` |
| Step durability | Reconstruct graph from events | **Run step memo table** + journal as source of truth |
| Migration order | A→B→C→D→…→I | **A→B→D→C→H→E→G→F→I** |
| Inferred progress | Deferred entirely | **Journal replay view** ships with Session (minimal) |
| Architecture open items (2026-06-30) | §11 in architecture doc | **Resolved** — see [§16b](#16b-architecture-resolutions-2026-06-30) |

**Spec principle (unchanged intent, updated framing):**

> Flows declare work; the protocol runs it; **custom views are the human OS**; shell admin surfaces observe and operate.

---

## 0a. Reader context

Murrmure is an **agentic operating system**: a hardened **communication protocol** (spaces, flows, agents, gates, hooks) plus **custom views** as the primary human interface.

**North star (normative — see [philosophy.md § North star](../../current/product/philosophy.md#north-star-non-negotiable--2026-07-03)):**

> **Custom views that take over the UI are the goal of the product.** Default shell chrome (space home, flowchart, notifications) is **admin/operator mode** — for observing runs, managing spaces, and debugging — not the primary experience workflow authors ship to their users.

**One-sentence product goal:**

> Teams run coordinated agentic work across spaces and machines: authors ship flows + **full custom views**; humans work inside those views; the protocol coordinates agents; sessions and runs make cross-boundary work observable.

**Read first:** [philosophy.md](../../current/product/philosophy.md)

**Supersedes for:** entity model, wire API sketch, ACL, open questions #1–#9 and §16b architecture resolutions, migration slices, shell UX navigation model.

**Does not supersede for:** v1 shipped behavior, hub kernel semantics in [hub/architecture.md](../../current/hub/architecture.md).

**Post-1.0 amendment (2026-07-09 — handlers cutover):** Default spaces use **`.mrmr/`** layout and **handlers.yaml** bound via **`on::key`** (`contract_keys` is prompt-scope only). Flow manifests are **protocol-only** (no `invoke:` / `executor.action`). See [bridges/handlers.md](../bridges/handlers.md).

---

## 0b. Decision summary (rev-1)

| Topic | Decision |
|-------|----------|
| **Murrmure role** | Agentic OS **kernel** — journal, grants, invoke, artifacts, gates, audit, agent coordination. Never prompts, skills, models, agent definitions. |
| **Primary human UX** | **Custom views** (`.mrmr/views/`) in **ViewCanvasHost** — full primary-region UI; hide generic shell. **Not** narrow drawers or built-in gate forms as default. |
| **Shell chrome** | **Admin/operator** — space home, flowchart, notifications, grants, debug. Observe and manage; not the product authors ship to end users. |
| **Space** | User root directory + `.mrmr/` index. Opaque immutable identity (`spc_*`), editable name/slug, and binding (path/host). May be shared git repo. |
| **Session** | **Correlation context** — user-facing tracker spanning spaces, flows, and time. Mutable grouping only. |
| **Run** | **Immutable execution unit** — lifecycle, step state, gates, exec context (worktree, preview URL). Parallel lanes = sibling Runs. |
| **Flow** | Declarative orchestration — step graph. **Start conditions** on manifest (manual/event/schedule). Thin wiring only — **no executor refs**. |
| **Handler** | Space-owned execution unit in `.mrmr/space/handlers.yaml` — bound via **`on::key`** (dispatched on `step.opened::{alias}` / events); `contract_keys` is prompt-scope only. Replaces actions + executors + hooks for default spaces. |
| **contract_key** | Protocol address `{flow_ref}.{qualified_step_id}` used to compile prompt scope; handler dispatch binds through `on::key`. |
| **View** | **Primary human interface** — full custom UI packages in `.mrmr/views/`. Not a hub entity. **ViewCanvasHost** fills main content; shell chrome recedes. |
| **Gate** | Run in `input-required`; the bound View (resolved from the space's `handlers.yaml` + `.mrmr/views/`) opens the author's view canvas. Without a binding, the shell is observability-only and exposes no resolve form. |
| **Journal** | CloudEvents-compatible append-only log. `subject` carries session/run correlation path. |
| **Headless delivery** | Every hub trigger/hook delivery **must** create Session (if needed) + Run. No silent executions. |
| **Flow vs UI** | Flows declare orchestration; **views are the human OS surface**. Authors ship flow + view together; human gates **require** custom view canvas in finished product (phase 06). |
| **Shell role** | **Admin/operator mode** by default when no view active. Flowchart, notifications, space management — not a substitute for domain UI. |
| **Orchestration editor** | Rejected — file/CLI-first; shell admin visualizes only. |
| **CLI vs shell** | CLI/agents mutate; shell **admin** surfaces observe. Wizards in CLI. **Custom views** = end-user surface. |
| **Global flows** | Visibility via **grants** on `(actor, space, flow)` — no `scope` property, no catalog space type. |
| **Landing space** | Per-user `landing_space_id`. Never hub-wide default. |
| **Notifications** | Global `Needs you` + center + `/notifications`. Gates primary. Persist across refresh. |
| **Agent** | `harness × task × context × space` — not stored. |
| **A2A** | Do not adopt as core. Borrow context/task split → Session/Run. Optional `executor: a2a` later. |
| **Flows in flows** | Deferred; reserve `on: flow_call` syntax (GHA `workflow_call`). |
| **Inline payload cap** | **64 KiB** — larger payloads must use artifacts. |

---

## 1. Goals

1. **Legible boundaries** — protocol / flow / view (rule) / space implementation.
2. **Space-as-directory** — hub indexes; never owns agent content.
3. **Session + Run observability** — every execution visible; cross-space correlation without identity overload.
4. **Reliable invoke** — Action + Executor with preflight; no invoke into void.
5. **Durable run projection** — step memoization; journal replayable; flowchart is projection not mutation.
6. **CLI-first mutation; shell-first observation** — shell reacts in real time to CLI.
7. **Artifact exchange** — `.mrmr.temp/` + global exchange store.
8. **Harness-agnostic clients** — Cursor, Claude Desktop, CLI, cron, federation.
9. **Preserve v1** — cutover complete; migration aliases removed (historical record in [§10.8](#108-v1-migration-aliases-historical-non-normative)).

---

## 2. Core entity model

### 2.1 Noun inventory

```text
Murrmure hub (protocol)
  Journal · Session · Run · Gate · Artifact · Grant

Space (directory — hub indexes)
  Space · Handler · Flow · contract_key

Concepts (not stored)
  Agent = harness × task × context × space
  View  = client that reads protocol (architectural rule)
```

**Count:** 6 hub entities + 4 space-indexed concepts (legacy Action/Executor removed in the handlers-only cutover — Task 15).

### 2.2 Responsibility table — hub-owned

| Noun | Owns | Must NOT |
|------|------|----------|
| **Journal** | Append-only CloudEvents-shaped log; global `seq`; dedup via `source`+`id` | Inline payloads > 64 KiB; interpret business meaning |
| **Session** | Correlation grouping; user-facing label; optional `subject` path prefix; list/filter anchor | Own step state machines; store worktree as sole truth |
| **Run** | Immutable execution unit; lifecycle; step memo; exec context; gate attachment; terminal immutability | Restart after terminal (refine = new Run); store prompts |
| **Gate** | Run in `input-required`; approve/reject/reschedule; assignee routing | Define business validation rules |
| **Artifact** | `transfer_id`, digest, size, TTL, authorized readers; materialize to `.mrmr.temp/` | Interpret file semantics |
| **Grant** | Capability tokens on `(actor, space[, flow[, action]])` | Duplicate visibility ladder; store agent config |

### 2.3 Responsibility table — space-owned (files)

| Noun | Owns |
|------|------|
| **Space** | Directory content; `.mrmr/` index; team artifacts |
| **Handler** | Step/event dispatch: `on::key`, `type`, `complete`, prompt/command (`contract_keys` is prompt-scope only) |
| **Flow** | Declarative step graph; start conditions; branch schemas — **protocol only** |
| **Action** *(legacy — removed)* | Named callable in `actions.yaml` — removed; handlers-only cutover complete (Task 15) |
| **Executor** *(legacy — removed)* | Reachability binding for legacy actions (removed with them) |

### 2.4 Demoted / folded

| Former noun | Becomes |
|-------------|---------|
| **View** (hub entity) | Rule: clients read `/v1/sessions`, `/v1/runs`, journal SSE |
| **Trigger** (space) | **Event handler** in `handlers.yaml` (`on: event: …`) |
| **Trigger** (flow) | **Start conditions** on flow manifest |
| **Instance** (v1) | **Run** (`instance_id` alias during migration) |
| **Capability / FlowInstall** | Flow index row (origin space, digest, grants) |
| **`scope: local \| global`** | Grant `flow:run` / `flow:read` on indexed flow |
| **Session lanes** | Sibling **Runs** with `reference_run_ids` |
| **Gate quorum any/all/count** | Single approver v2; assignee list optional |

### 2.5 Reference mapping

| Murrmure rev-1 | A2A | Temporal | Inngest | Windmill |
|----------------|-----|----------|---------|----------|
| Session | `contextId` | — | — | Workspace (loose) |
| Run | `Task` | Workflow Execution | Function run | Job run |
| Action | — | Activity | `step.run` | Script |
| Executor | Agent endpoint | Worker poll | HTTP handler | Worker |
| Flow | — | Workflow (declarative) | Function def | OpenFlow DAG |
| Hook | — | Schedule/signal | Event trigger | Trigger |
| Gate | `input-required` | Signal wait | `waitForEvent` | Approval/suspend |
| Journal | Task events | History | Event stream | Run history |

---

## 3. Session + Run model (detailed)

### 3.1 Why split

v2 draft overloaded **Session** with five jobs: correlation id, state machine, exec context, parallel container, journal tag. A2A separates **`contextId`** (grouping) from **`Task`** (immutable unit with lifecycle + artifacts). Murrmure adopts the same split.

### 3.2 Session

| Property | Semantics |
|----------|-----------|
| `session_id` | Opaque hub-issued ULID (`ses_*`) — **never** a filesystem path |
| `subject` | Optional hierarchical display/filter path (CloudEvents-style), e.g. `feature-Y/lane-A` |
| `title` | User-facing label; shell header may show this instead of raw id |
| `status` | **Derived** from child runs: `active`, `completed`, `partial_failure`, `failed`, `cancelled` |
| `created_by` | Actor or `{ type: "hook", hook_id }` / `{ type: "flow", flow_id }` |
| `spaces_touched` | Denormalized list for ACL filter and space home |

Session is **mutable** for metadata (title, subject, watchers). It does **not** own step progress directly — Runs do.

### 3.3 Run

| Property | Semantics |
|----------|-----------|
| `run_id` | Opaque ULID (`run_*`); v1 alias: `instance_id` |
| `session_id` | Parent correlation context |
| `flow_id` | Optional — null for headless hook/action-only runs |
| `flow_digest` | Pinned manifest digest at start — **immutable for run lifetime** |
| `lifecycle` | `working` → `input-required` → `completed` \| `failed` \| `cancelled` |
| `exec_context` | Worktree path, branch, preview URL, opaque JSON bag |
| `reference_run_ids` | Parallel siblings or refinement lineage (A2A `referenceTaskIds`) |
| `started_at` / `ended_at` | Timestamps |

**Terminal immutability:** A Run in `completed`, `failed`, or `cancelled` is **never restarted**. Follow-up work creates a **new Run** in the same Session with `reference_run_ids` pointing to prior run(s).

**Parallel worktrees:** Two lanes = two Runs under one Session, e.g.:

```text
Session: feature-Y (ses_01J…)
├── Run: research      (run_01J…, completed)
├── Run: spec          (run_01J…, input-required — gate pending)
├── Run: dev-lane-A    (run_01J…, working)
└── Run: dev-lane-B    (run_01J…, working)
```

Flow declares graph once; each Run records execution of a segment or matrix branch.

### 3.4 Session status derivation

| Condition | Session status |
|-----------|----------------|
| Any run `working` or `input-required` | `active` |
| All runs terminal, all `completed` | `completed` |
| All runs terminal, mix of `completed` + `failed` | `partial_failure` |
| All runs terminal, all `failed` or `cancelled` | `failed` or `cancelled` |
| User cancelled session | `cancelled` (cascade policy — see §3.6) |

### 3.5 Identity resolution (open #2 — closed)

| Question | Resolution |
|----------|------------|
| Path-as-id? | **No.** Paths are never primary keys. |
| Opaque + path? | **Yes.** `session_id` + `run_id` opaque; optional `subject` string on Session and journal events. |
| Prefix filter? | `GET /v1/journal?subject=feature-Y/*` — filter on `subject`, not id structure. |
| Nesting? | Sibling Runs + `reference_run_ids`; optional shared `subject` prefix — no FK tree required. |

### 3.6 Headless runs, cancel cascade, retry (closed 2026-06-30)

**Headless `step_id` namespace** (runs with `flow_id: null`):

| Origin | `step_id` | Step memo |
|--------|-----------|-----------|
| Hook delivery | `hook:{hook_id}` | Single row; journal replay or one-node graph |
| Direct action invoke *(legacy — removed)* | `action:{action_name}` | Removed; superseded by `handler:{id}` (handlers-only cutover complete — Task 15) |
| MCP orchestration attach (pre-bind) | `orchestration:proposed` | Until graph binds; then flow step ids apply |

**Session cancel cascade:**

1. Journal `mrmr.session.cancel_requested` immediately on user cancel.
2. Hub calls `ExecutorPort.cancel` on in-flight dispatches (best-effort).
3. Active runs → `cancelled` when executor acks **or** after hub timeout (default **30s**), whichever comes first.
4. Session → `cancelled` when all child runs are terminal.

Hub owns the deadline; executors may ack faster.

**Retry-from-step** (failed run):

- Terminal immutability stands — **never restart the same Run**.
- Shell **Retry** creates a **new Run** in the same Session with `reference_run_ids: [failed_run_id]`, same pinned `flow_digest`, starting from the failed `step_id` (or user-selected step).
- UX label: **Retry** (new attempt), not “Resume run”.

---

## 4. Handlers, execution binding, and legacy invoke

**Canonical (2026-07-09, updated 2026-07-14 — `on::key` cutover):** Spaces own execution via **handlers** in `.mrmr/space/handlers.yaml`, bound by **`on: step.opened::{flow_name}.{qualified_step_id}`** (the `on::key` binding); `contract_keys` is **prompt-scope only**. Flow manifests declare protocol shape only — `id`, optional `description`, optional `branches`, and optional nested `steps` — not `invoke:` or `executor.action`. Full field reference: [bridges/handlers.md](../bridges/handlers.md).

```yaml
# .mrmr/space/handlers.yaml
version: 1
handlers:
  - id: write-spec
    on: step.opened::preview-review.write_spec
    type: shell_spawn
    complete: explicit          # agent calls murrmure_resolve_step / mrmr step resolve
    prompt: |
      …
    command: cursor agent -p --force {{prompt}}
```

| Field | Semantics |
|-------|-----------|
| `id` | Stable handler id; journal prefix `handler:{id}` |
| `on` | `step.(opened|resolved)::{flow_name}.{qualified_step_id}` \| `event: { type, source? }` |
| `type` | `shell_spawn` \| `mcp_session` \| `queue_poll` \| `remote_hub` \| `view_resolver` |
| `complete` | `auto` \| `cli` \| `explicit` — who calls resolve after dispatch |
| `contract_keys` | Prompt-scope addresses (which steps a prompt-scoped handler may address); empty for event-only and `view_resolver` handlers — **not** the binding key |

**`contract_keys` (prompt scope):**

```text
contract_key := {flow_ref}.{qualified_step_id}
```

- `flow_ref` = apply-time resolved flow identity.
- `qualified_step_id` = dot path from step catalog (e.g. `build.review`).
- Prompt-scope documentation only; binding is via `on::key`, not `contract_keys`.
- Human-step keys in multi-key handlers are **scope/documentation only** — never dispatched on `step.opened`.

**Completion path:** Handler dispatch → agent/shell work → `murrmure_resolve_step` (MCP) or `mrmr step resolve` (CLI, env `MURRMURE_RUN_ID`, `MURRMURE_STEP_ID`, short-lived `MURRMURE_HUB_TOKEN`).

---

### 4.1 Action + Executor *(legacy — removed, Task 15)*

The sections below describe the pre-cutover **Action + Executor** invoke model as a historical record, including the public action-invoke HTTP route in [§4.4](#44-invoke-http). Legacy `actions.yaml`, `executors.yaml`, and `hooks.yaml` — and that `POST /v1/spaces/{space_id}/actions/{action_name}/invoke` route — are **removed**; the handlers-only cutover is complete (Task 15). Spaces use handlers + `murrmure_resolve_step` instead (no public action-invoke route in the clean protocol).

### 4.1a Action (space-owned, hub-indexed) *(legacy — removed, Task 15)*

```yaml
# legacy (removed — handlers-only cutover complete, Task 15): .mrmr/space/actions.yaml
version: 1
actions:
  review_url:
    executor: cursor-mcp
    timeout_ms: 600_000
    response_schema: murrmure.schemas/review_url.v1.json
    idempotency: caller_key          # optional default

  daily_checkin:
    executor: shell
    command: ./bin/checkin.sh
    cwd: "{{space_root}}"
    response_schema: murrmure.schemas/checkin.v1.json
```

**Protocol responsibilities:**

- Index action names per space on `mrmr space apply`
- Accept invoke with opaque params (JSON bytes)
- Validate response against declared schema when `expect.response_schema` set
- Enforce dedup, timeout, retry policy
- Journal lifecycle on Run
- **Never** interpret param semantics (prompt text, task meaning)

### 4.2 Executor binding *(legacy)*

| Type | Semantics | Reachability |
|------|-----------|--------------|
| `mcp_session` | Long-lived MCP connected with grants | Last heartbeat / `ControlPrincipal` seen |
| `shell_spawn` | One-shot command in space root | Process lifecycle + stdout capture |
| `queue_poll` | **External worker** polls hub task-offer API (see §4.6) | Worker registration + poll timestamp |
| `remote_hub` | Federation relay to peer hub | Remote ack + health; retry policy §16b F3 |
| `a2a` | External A2A agent endpoint | Optional future |

**Default registration pattern (documented, not schema-enforced):**

| Type | Default | Typical harness |
|------|---------|-----------------|
| `mcp_session` | Long-lived connection | Cursor, Claude Desktop |
| `shell_spawn` | One-shot process | Scripts, CI |
| `queue_poll` | External worker process | Cloud / remote workers |
| `remote_hub` | Peer hub adapter | Cross-hub invoke |

Action declares `executor` ref; hub validates reachability per type via preflight.

```yaml
# legacy: .mrmr/space/executors.yaml
executors:
  cursor-mcp:
    type: mcp_session
    required_scopes: [space:enter]

  shell:
    type: shell_spawn
```

### 4.3 Invoke preflight *(legacy — removed, Task 15)*

Before marking invoke `dispatched`:

1. Resolve action registry entry in target space
2. Check executor reachability for binding type
3. If unreachable:
   - **Default:** fail fast with `EXECUTOR_UNAVAILABLE` (Run step → `failed` with typed error)
   - **Opt-in:** `delivery: queue_until_executor` on action or invoke — Run step shows `waiting_for_executor` (visible in shell)

Replaces the removed v1 `mcp.wake_pending` silent default.

### 4.4 Invoke HTTP *(legacy — removed, Task 15)*

```http
POST /v1/spaces/{space_id}/actions/{action_name}/invoke
Authorization: Bearer tok_…
Idempotency-Key: {optional}

{
  "session_id": "ses_…",
  "run_id": "run_…",
  "step_id": "review_url",           // stable within flow graph or hook delivery
  "params": { … },                   // opaque
  "expect": {
    "response_schema": "murrmure.schemas/review_url.v1.json"
  },
  "artifacts_in": ["xfr_01J…"],
  "delivery": "fail_fast"            // | queue_until_executor
}
```

**Completion contract (async-safe):**

| Mode | Complete when |
|------|---------------|
| Sync | HTTP response matches schema |
| Async | Journal `mrmr.action.completed` from executor with `run_id`, `step_id`, result ref |
| Timeout | Run step → `failed`; journal `mrmr.action.timed_out` |
| Unreachable | `EXECUTOR_UNAVAILABLE` unless queue mode |

### 4.5 Idempotency matrix

| Operation | Key scope | Behavior on duplicate |
|-----------|-----------|------------------------|
| Run start | `Idempotency-Key` + `flow_id` | Return existing run |
| Step invoke | `Idempotency-Key` + `run_id` + `step_id` | Return memoized outcome |
| Gate resolve | `gate_id` + decision | Reject conflict |
| Artifact put | `transfer_id` or content digest | Return existing |
| Hook delivery | `hash(event.source, event.id, hook_id)` | Skip duplicate side effects |
| Hook → Run create | **Same key** as hook `dedup_key` → run `idempotency_key` | Return existing run |
| Step invoke (from hook) | `{run_id}:{step_id}:{dedup_key}` | Return memoized outcome |

**Propagation rule:** one redelivered CloudEvent must not produce duplicate hook effects **and** a duplicate Run. The hook-layer dedup key flows to run creation unchanged.

### 4.6 Executor poll API (`queue_poll` — external workers only)

Murrmure **does not** embed a Temporal-like queue runtime in v2. Hub journals task offers; space-owned workers poll.

```http
GET  /v1/executor/tasks?executor_id=…          # long-poll; Bearer or worker grant
POST /v1/executor/tasks/{task_id}/complete
POST /v1/executor/tasks/{task_id}/fail
```

In-process poll adapter permitted for **dev/tests only**. Production `queue_poll` = external worker contract.

---

## 5. Flow and hooks

### 5.1 Terminology disambiguation

| Concept | Question | Where | v2 draft name |
|---------|----------|-------|---------------|
| **Flow start conditions** | *How may this flow be started?* | `flow.manifest.yaml` | Flow triggers |
| **Hook / event handler** | *When does this space react?* | `.mrmr/space/handlers.yaml` | Space triggers |

Avoids two systems both called "trigger."

### 5.2 Flow manifest

```yaml
# .mrmr/flows/preview-review/flow.manifest.yaml
apiVersion: murrmure.flow/v1
name: preview-review
description: Spec intake → write → build (review loop) → archive → commit

triggers:
  manual: true

steps:
  - id: intake
    description: Human attaches spec markdown.
    branches:
      continue:
        schema:
          type: object
          required: [spec_filename, reviewer]
        artifact_slots:
          spec:
            description: Attached spec markdown file
        route: { step: write_spec }
      cancel:
        schema: { type: object }
        route: { run: failed }

  - id: write_spec
    description: Agent writes spec to repo.

  - id: build
    description: Coordinate build and review children until validated.
    branches:
      completed:
        schema:
          type: object
          required: [preview_url]
        route: { step: archive }
      failed:
        schema: { type: object }
        route: { run: failed }
    steps:
      - id: build-loop
        description: Implement site; resolve when preview URL ready.
        branches:
          completed:
            schema:
              type: object
              required: [preview_url]
            resume: build
          failed:
            schema: { type: object }
            resume: build
      - id: review
        description: Human validates preview — wait; do not resolve yourself.
        branches:
          validated:
            schema: { type: object }
            resume: build
          changes_required:
            schema: { type: object }
            resume: build
          cancel:
            schema: { type: object }
            route: { run: failed }

  - id: archive
    description: Archive the built site.

  - id: commit
    description: Commit the archived result.
```

**Execution binding:** Space handlers bind via `on::key` such as `preview-review.write_spec`, `preview-review.build.build-loop` — see [bridges/handlers.md](../bridges/handlers.md). Flow manifest carries **no** `invoke:` blocks.

**Nested call/return:** A parent opens first. Its assigned resolver activates one
direct declared child with `murrmure_open_child_step`, which atomically changes
the parent to `yielded`, revokes the old assignment, and opens the child. Child
`resume` returns canonical result context to a fresh parent assignment; it does
not resolve or reopen the parent. Only that resumed parent chooses the next
child or resolves its own branch. Nested `route.step` is rejected.

**No `scope: local|global`.** Visibility = grants. File living in catalog space + `flow:run` grant to team = "global" behavior.

### 5.2.1 Matrix parallel expansion (closed 2026-06-30)

When the flow engine **enters** a `parallel.matrix` step and the matrix value is **resolved** (typically from run `input` at start):

1. Create all sibling Runs in **one transaction** (GHA-style eager expansion at step entry).
2. Idempotency key per lane: `{parent_run_id}:{step_id}:{matrix_index}`.
3. Flowchart shows fork/join immediately; sibling runs share Session, distinct `run_id`.

**Deferred:** matrix values resolved from a *prior step’s output* mid-run — same rule applies when that step completes and matrix is known.

Dynamic matrix from live step output is not required for slice E v1.

### 5.3 Event handlers

Event-driven space reactions live in the same **`handlers.yaml`** namespace as step handlers (one id namespace; journal prefix `handler:{id}`):

```yaml
# .mrmr/space/handlers.yaml
version: 1
handlers:
  - id: on-spec-published
    contract_keys: []              # event-only
    on:
      event:
        type: mrmr.spec.published
        source: "/spaces/spc_backend"
    type: shell_spawn
    complete: explicit
    prompt: |
      Start downstream review for {{event.data.artifact_ref}}
    command: cursor agent -p --force {{prompt}}
```

**Handler delivery invariant:** Every hub-delivered event handler **must**:

1. Create or attach to a **Session**
2. Create a **Run** (even single-step — shows as one-node graph or journal replay)
3. Journal `mrmr.handler.delivered` (alias `mrmr.hook.delivered` during migration) with handler id, event ref, session_id, run_id

No "when possible" language — **mandatory**.

### 5.4 Flow index (hub)

Hub indexes from all linked spaces on `mrmr space apply`:

```typescript
interface FlowIndexEntry {
  flow_id: string;           // flw_* stable or content-derived
  origin_space_id: string;   // space that hosts manifest files
  digest: string;            // manifest hash
  name: string;
  triggers: FlowStartConditions; // the only start-condition field; `start` is rejected
  step_spaces: string[];     // spaces with handlers bound to this flow's on::key aliases
  grants_required: string[]; // hints for expand preview
  step_contract_catalog: StepContractCatalog; // compiled per flow at apply time
}
```

**View binding (clean cutover):** flow manifests and the flow index carry no View identity. Views bind to steps through the **space** (`handlers.yaml` + `.mrmr/views/`), not the portable flow; the shell reads the authorized inline projection on `open_steps[]` at run time. There is **no hub View registry** and no flow-level form fallback.

No per-space "install" UX — index refresh only.

### 5.5 Flows calling flows (shipped)

**Status:** ✅ implemented — `start_flow` step, cycle detection, ACL inheritance, `flow_call` start condition.

- Step type `start_flow` with explicit `flow_id` + input mapping
- Cycle detection + max depth (default 8)
- ACL inheritance: child run checks `flow:run` on target flow
- Child advertisement: `triggers.flow_call: true` (GHA `workflow_call` semantics) — surfaces the flow as callable to independent surfaces. Authorized `start_flow` from a parent run remains valid for **every** flow (invoke-only `triggers: {}` included), gated by `flow:run` + ACL inheritance — not by this flag.

See [bridges/flow-engine.md](../bridges/flow-engine.md) and `packages/hub-core/src/flow-engine/start-flow.ts`.

### 5.6 Gate steps in flow manifests (partial — see §21)

**Manifest + IR:** `gate` steps compile and appear in flow IR and flowchart UI.

**Runtime (gap):** The flow advance path dispatches **`invoke`** and **`start_flow`** steps only. Declarative `gate` steps do **not** yet open pending gates or pause advance — use imperative gate API / orchestration attach until [plan/01-flow-engine-gate-steps.md](../../plans/product/plan/01-flow-engine-gate-steps.md) ships.

**Step output chaining (gap):** `{{steps.id.output.field}}` templates are implemented in `templates.ts` but `exec_context.steps` is not populated on action completion — see [plan/02-flow-engine-step-outputs.md](../../plans/product/plan/02-flow-engine-step-outputs.md).

---

## 6. Gates

### 6.1 Protocol model

- Gate attaches to **Run** in lifecycle `input-required`
- Maps A2A `input-required`, Temporal signal wait, Windmill approval step

```typescript
interface Gate {
  gate_id: string;
  run_id: string;
  session_id: string;
  step_id: string;
  status: "pending" | "approved" | "rejected" | "expired";
  assignees?: string[];       // actor ids; empty = any user with flow:run on run
  resolve_mode: "any_one";    // v2 only; defer quorum
  expires_at?: string;
  form?: GateFormSchema;      // default UX
  payload_ref?: string;       // artifact or inline summary for approver
}
```

### 6.2 Custom view at gates (primary UX)

Human gates are served by the bound View — resolved from the space's `handlers.yaml` + `.mrmr/views/` at run time (no flow-level `requires_view`; Views bind through the space, not the portable flow). The shell loads the author's view package in **ViewCanvasHost** (full main-area sandboxed iframe via `@murrmure/view-sdk`). Shell = observer chrome; domain UI = 100% the view bundle.

```yaml
steps:
  - id: review
    gate:
      assignees: ["{{input.reviewer}}"]
```

View binding lives in the space, not the portable flow (see §5.4).

**Unbound steps:** if no view is bound to the step at run time, the shell stays **observability-only** — it must not synthesize a built-in gate form or fallback resolve control. The step remains open and externally resolvable by an authorized protocol client.

**Not acceptable:** a narrow side drawer or any built-in fallback form as the default human gate or review surface.

### 6.3 Agent orchestration push gate

When agent MCP-pushes proposed graph:

1. Create gate type `orchestration.validate`
2. Shell **must** render read-only flowchart preview of proposed steps before approve
3. Each step shows: target space, action name, param **shape** (not values), expected response schema
4. On approve → bind graph to Session; spawn Runs per execution policy (§5.2.1)
5. On reject → journal only; no bind

**Attach payload (closed 2026-06-30)** — same schema as file-backed flow; no separate DSL:

```json
{
  "kind": "murrmure.flow.attach/v1",
  "manifest": {
    "apiVersion": "murrmure.flow/v1",
    "name": "agent-proposed",
    "triggers": { "manual": true },
    "steps": [ … ]
  }
}
```

Validated with the same Zod as `flow.manifest.yaml`. MCP attach and CLI `mrmr space apply` share one validator.

### 6.4 Hidden space + gate (open #3 — closed)

| Scenario | Behavior |
|----------|----------|
| Gate from hidden space; user not assignee | **Suppress** notification |
| Gate from hidden space; user **is** assignee | Show gate with **sanitized context**: action name visible, space shown as "Private space", no navigation link to space |
| Session list | Show session title; redact steps in spaces user cannot `space:read` |
| Approve/reject | Allowed if assignee or `flow:run` grant on run |

Pattern: GitHub private repo issue assignment.

---

## 7. Artifacts

### 7.1 Two-tier model (unchanged intent)

| Tier | Limit | Where |
|------|-------|-------|
| **Inline** | ≤ **64 KiB** | Event `data`, invoke response body |
| **Artifact** | Unlimited (TTL-bound) | Exchange protocol |

### 7.2 Surfaces

| Surface | Role |
|---------|------|
| `{space}/.mrmr.temp/inbox/` | Received files (gitignored) |
| `{space}/.mrmr.temp/outbox/` | Pending send |
| `~/.murrmure/exchanges/{transfer_id}/` | Global staging + recovery |

### 7.3 Wire shape

```json
{
  "artifact": {
    "kind": "mrmr.artifact/v1",
    "transfer_id": "xfr_01J…",
    "digest": "sha256:…",
    "name": "openapi.diff",
    "size_bytes": 48291,
    "local_path": ".mrmr.temp/inbox/xfr_01J…/openapi.diff",
    "authorized_readers": ["spc_frontend", "actor:alice"]
  }
}
```

### 7.4 GC (closed 2026-06-30)

- **Now:** 64 KiB inline cap; default artifact TTL 7 days (configurable per hub)
- **Sweeper:** daemon scheduled tick (default daily) invokes hub-core `ArtifactGcCommand`; exchange store deletes eligible bytes; journal `mrmr.artifact.expired`
- **Cross-hub (slice I):** each hub GCs its own materialized copy by local TTL; canonical `transfer_id` unchanged
- **Legal hold:** `hold: true` on manifest skips GC — **shipped** (artifact GC sweeper respects hold)

---

## 8. Journal and CloudEvents envelope

### 8.1 Required attributes

Every journal entry MUST be CloudEvents-compatible:

```typescript
interface JournalEntry {
  specversion: "1.0";
  id: string;              // unique; dedup with source
  source: string;          // "/spaces/spc_backend" | "/hubs/hub_local"
  type: string;            // "mrmr.invoke.completed", "mrmr.gate.pending", …
  subject?: string;        // "sessions/ses_abc/runs/run_xyz" — correlation path
  time: string;            // ISO8601
  datacontenttype?: "application/json";
  data?: Record<string, unknown>;
  dataref?: {              // artifact pointer when data too large
    transfer_id: string;
    digest: string;
  };
  // Murrmure extensions
  seq: number;             // global hub sequence
  space_id: string;
  session_id?: string;
  run_id?: string;
  dedup_key?: string;
  actor_id?: string;
}
```

**Correlation (closed 2026-06-30):** When a journal entry relates to a session or run, **both** MUST be set:

1. Murrmure extensions `session_id` and/or `run_id` (canonical for queries and MCP)
2. CloudEvents `subject` path derived as `sessions/{session_id}/runs/{run_id}` (or `sessions/{session_id}` when run-agnostic)

Hub journal builder derives `subject` from ids — authors must not supply conflicting paths.

### 8.2 Event types (normative starter set)

| type | When |
|------|------|
| `mrmr.session.created` | Session created |
| `mrmr.run.started` | Run entered `working` |
| `mrmr.run.completed` | Run terminal success |
| `mrmr.run.failed` | Run terminal failure |
| `mrmr.action.dispatched` | Invoke sent to executor |
| `mrmr.action.completed` | Executor reported success |
| `mrmr.action.timed_out` | Timeout |
| `mrmr.action.executor_unavailable` | Preflight or delivery failure |
| `mrmr.gate.pending` | Gate opened |
| `mrmr.gate.resolved` | Gate closed |
| `mrmr.artifact.transferred` | Bytes materialized |
| `mrmr.hook.delivered` | Hook ran |
| `mrmr.flow.attached` | Graph bound to session |

### 8.3 Run step memo (projection table)

Hub maintains **derived** table (rebuildable from journal):

```typescript
interface RunStepMemo {
  run_id: string;
  step_id: string;
  status: "pending" | "working" | "completed" | "failed" | "skipped";
  idempotency_key?: string;
  result_hash?: string;    // Inngest-style — skip re-execution on replay
  started_at?: string;
  completed_at?: string;
  error_code?: string;
}
```

Flowchart = flow manifest graph **overlaid** with RunStepMemo — not reconstructed ad hoc from raw events on every read.

---

## 9. Grants and ACL (unified)

### 9.1 Single capability model (replaces dual ladder)

Capabilities are strings granted to `(actor_id, resource)`:

| Capability | Resource | Allows |
|------------|----------|--------|
| `space:read` | space | See space in sidebar, space home, non-redacted session steps |
| `space:write` | space | Push hooks, actions, flows via CLI apply |
| `space:enter` | space | MCP control plane attach (executor) |
| `flow:read` | flow | Read authorized applied/live/historical graph contracts and safe resolver identity |
| `flow:run` | flow | Start manual / receive hook start_flow; resolve orchestration gates and cancel runs |
| `step:resolve` | run | Resolve flow steps (`murrmure_resolve_step`) |
| `event:emit` | space | Emit platform events (`murrmure_emit_event`) |
| `journal:read` | space or session | Logs access |
| `executor:poll` | executor | External worker poll API §4.6, §10.5 |
| `hub:admin` | hub | Breakglass: federation keys, global config |

**Visibility:** No `hidden` enum. Space absent from sidebar when actor lacks `space:read`. Session visibility uses redaction rules (§6.4).

### 9.2 Global flow expand (open #4 — closed)

| Action | Required capability |
|--------|---------------------|
| See flow in "Available to run" | `flow:run` |
| Expand preview (graph, spaces touched) | `flow:read` (sanitized — no secret param defaults) |
| Push/edit flow files | `space:write` on origin space |

### 9.3 Admin (open #5 — closed)

- **Default:** per-space admin via `space:write` + grant management on that space
- **Breakglass:** `hub:admin` for federation, hub rotation, emergency revoke — minimal holders

---

## 10. Wire API (rev-1 sketch)

### 10.1 Sessions and runs

```http
POST   /v1/sessions
GET    /v1/sessions/{session_id}
GET    /v1/sessions?status=active&space_id=spc_…
GET    /v1/sessions/{session_id}/runs

POST   /v1/sessions/{session_id}/runs          # start run from flow or headless
GET    /v1/runs/{run_id}
GET    /v1/runs/{run_id}/graph                 # manifest overlay + step memo
POST   /v1/runs/{run_id}/cancel

POST   /v1/sessions/{session_id}/orchestration/attach   # MCP; gate if agent-origin
POST   /v1/sessions/{session_id}/cancel                 # cascade §3.6

PATCH  /v1/me                                           # landing_space_id, prefs
GET    /v1/me
```

**Session create body:**

```json
{
  "title": "Feature Y delivery",
  "subject": "feature-Y",
  "idempotency_key": "optional"
}
```

**Run create body:**

```json
{
  "flow_id": "flw_feature_delivery",
  "input": { "topic": "…", "worktrees": […] },
  "reference_run_ids": [],
  "idempotency_key": "optional"
}
```

### 10.2 Gates

```http
GET    /v1/runs/{run_id}/gates
POST   /v1/gates/{gate_id}/resolve
```

### 10.3 Journal

```http
GET    /v1/journal?subject=sessions/ses_…/*&type=mrmr.action.*
GET    /v1/journal/subscribe                    # SSE — global or filtered
```

**SSE auth (closed 2026-06-30):**

| Client | Mechanism |
|--------|-----------|
| Desktop bundled | Same-origin HttpOnly session cookie from bootstrap |
| Web hosted | HttpOnly session cookie **or** short-lived SSE ticket `GET /v1/journal/subscribe?ticket=tkt_*` (≈60s, subscribe scope only) |
| CLI / MCP | Bearer token (unchanged) |

Do not rely on `Authorization` header on browser `EventSource` for hosted web.

### 10.4 Space index

```http
POST   /v1/spaces/{space_id}/apply             # re-index .mrmr/ files
GET    /v1/spaces/{space_id}/actions
GET    /v1/spaces/{space_id}/flows
GET    /v1/flows/{flow_id}
```

### 10.5 Executor poll (see §4.6)

```http
GET  /v1/executor/tasks?executor_id=…
POST /v1/executor/tasks/{task_id}/complete
POST /v1/executor/tasks/{task_id}/fail
```

### 10.6 User preferences

```http
PATCH /v1/me
{ "landing_space_id": "spc_…" }
```

First successful `space link` by a user → **suggest** “Use as landing?” (banner/toast); **never auto-set**. Per-user only — never hub-wide default.

### 10.7 Describe document (Temporal-inspired)

`GET /v1/runs/{run_id}` returns rich state:

```json
{
  "run_id": "run_…",
  "session_id": "ses_…",
  "lifecycle": "input-required",
  "flow_id": "flw_…",
  "flow_digest": "sha256:…",
  "exec_context": { "worktree": "…", "preview_url": "…" },
  "steps": [ … RunStepMemo … ],
  "pending_gates": [ … ],
  "participating_spaces": ["spc_…"],
  "artifacts": ["xfr_…"],
  "started_by": { "type": "hook", "hook_id": "on-spec-published" }
}
```

### 10.8 v1 migration aliases (historical, non-normative)

> **Removed (Task 15 Lane C).** The v1→rev-1 migration aliases and
> dual-emission shims below are a historical record only — the cutover is
> complete and none of these remain active. Read paths use `run_id` /
> `session_id` directly; `POST …/instances` and the `correlation_id` header are
> gone (404); `mcp_wake` + `wake_label` is a retired wire (404), not an
> action-invoke shim — the clean protocol uses event handlers +
> `murrmure_emit_event` + flow triggers; `checkpoint.*` journal types and dual
> emission are removed in favor of `step:resolve` (`murrmure_resolve_step`) and
> `mrmr.gate.*` / `mrmr.run.*` only.

| v1 (removed) | rev-1 clean protocol | Status |
|----|-------|------------|
| `instance_id` | `run_id` | Removed — read paths use `run_id` only |
| `POST …/instances` | `POST …/runs` | Removed — 404 (adapter gone) |
| `correlation_id` | `session_id` | Removed — deprecated header gone |
| `mcp_wake` + `wake_label` | event handlers + `murrmure_emit_event` + flow triggers | Removed — 404 retired wire |
| `checkpoint.*` journal types | `mrmr.gate.*` / `mrmr.run.*` + `step:resolve` | Removed — no dual emit |

### 10.9 MCP platform tools (normative)

Participants connect via `murrmure-mcp`. One persistent local **connection**
represents one machine/trust boundary and may be installed into several
integration contexts. It is not an agent entity.

Local MCP config contains only the stable per-user launcher plus `--hub` and
`--connection` IDs. Tokens live only in the OS credential store keyed by Hub +
connection ID. Local startup fails closed and never consumes environment
fallback. Explicit headless CI mode may consume `MURRMURE_HUB_TOKEN` only as
provider-injected process-runtime secret.

The default `tutorial-builder/v1` connection profile contains exactly
`space:read`, `flow:read`, `flow:run`, and `step:resolve`. It is space-wide for
current and future flows. Advanced restricted creation accepts only canonical
flow IDs already applied to that space.

Catalog = connection-filtered platform tools. Runtime onboarding flow:
`mrmr connection create` (auto-activate) → adapter install → reload →
`murrmure_space_status`.

| Tool | Required capability | HTTP / behavior |
|------|---------------------|-----------------|
| `murrmure_apply_space` | `space:write` | `POST /v1/spaces/{id}/apply` |
| `murrmure_space_status` | `space:read` | `GET /v1/spaces/{id}/index/status` |
| `murrmure_create_session` | `flow:run` | `POST /v1/sessions` |
| `murrmure_list_sessions` | `space:read` or `journal:read` | `GET /v1/sessions` |
| `murrmure_get_session` | `space:read` | `GET /v1/sessions/{id}` |
| `murrmure_create_run` | `flow:run` | `POST /v1/sessions/{id}/runs` |
| `murrmure_get_run` | `space:read` | `GET /v1/runs/{id}` |
| `murrmure_list_step_contracts` | `space:read` | `GET /v1/runs/{id}/step-contracts` |
| `murrmure_cancel_run` | `flow:run` | `POST /v1/runs/{id}/cancel` |
| `murrmure_resolve_step` | `step:resolve` | `POST /v1/runs/{id}/steps/{step_id}/resolve` |
| `murrmure_wait_for_run` | `space:read` | long-poll run status |
| `murrmure_journal_query` | `journal:read` | `GET /v1/journal?…` |
| `murrmure_attach_orchestration` | `flow:run` | `POST /v1/sessions/{id}/orchestration/attach` |
| `murrmure_get_run_graph` | `flow:read` | `GET /v1/runs/{id}/graph` |

Removed MCP tools (`murrmure_complete_action`, `murrmure_invoke_action`,
`murrmure_wait_for_gate`, `murrmure_resolve_gate`,
`murrmure_grant_mint`) stay absent; use handlers +
`murrmure_resolve_step` and manage authorization through connection lifecycle.

Catalog refresh remains required after grant changes or `mrmr space apply`.

---

## 11. Space directory scaffold

```text
my-space/
  agent.md                      # USER — never read for config
  skills/                       # USER
  .cursor/ | mcp.json           # USER harness
  src/ | docs/
  .mrmr/
    space/
      space.yaml                # slug, tags, link block (space_id + host)
      handlers.yaml             # canonical — step + event handlers (only indexed file)
    flows/
      preview-review/           # example — only when scaffolded with --with-examples
        flow.manifest.yaml      # protocol only
        schemas/                # optional branch payload shapes
    views/                      # optional client packages — not hub registry
    dev/                        # local runtime outputs (gitignored)
  .mrmr.temp/
    inbox/
    outbox/
```

**Migration note:** The handlers-only cutover is complete (Task 15) — only `.mrmr/` indexes, and `mrmr space apply` reads `.mrmr/space/handlers.yaml` alone. Legacy `murrmure/` layout and `triggers.yaml` / `hooks.yaml` / `actions.yaml` / `executors.yaml` are removed (historical record only). `.murrmure/link.json` is deprecated — use `space.yaml` `link:` block.

---

## 12. Shell UX (rev-1)

### 12.1 Personas

| Persona | Needs | Shell emphasis |
|---------|-------|----------------|
| **Orchestrator** | Build flows, debug runs, CLI-native | Flows as front door; sessions via runs |
| **Approver** | Notification → context → one click | Gates only; never requires understanding flows |

Session is **transparent at entry**: "Run" on flow creates session + run; URL `/sessions/:id` but header shows flow title.

### 12.2 Navigation (revised from v2 draft)

**Remove:** persistent Sessions subsection in sidebar (context confusion).

```text
Top: [🏠 Landing]  [Needs you (n) ▾]  [Logs]  [⌘K]  [Profile]

Left sidebar — Spaces only:
  ● landing-space
  ○ frontend (2)          ← badge from gate queue filtered to space
  ○ api-space
  [ + ]  → CLI instructions

Sessions reached via:
  1. Notification click → /sessions/:id
  2. /sessions global list
  3. Space home → Active / Recent
  4. Command palette
```

### 12.3 Space home (revised sections)

```text
Space: frontend
├── Needs your attention     ← gates/failures for this space
├── Active runs
├── Flows                    ← one row per {origin_space_id, flow_id}
├── Receiving from           ← flows whose steps bind handlers in this space
└── Recent completed         ← at most 20, fixed-height; links to full history
```

The Hub deduplicates and sorts the authorized Flows projection. Each row carries
its current applied digest plus server-computed `can_preview`, `can_run`,
`manual`, and `authored_here`; clients do not join or infer these fields.

### 12.4 Shared flow page (applied / live / history)

```text
Flow: Feature Y delivery
┌─ Flowchart (declared graph + live step state) ─────────────┐
│  [research ✓] → [spec ●] → [lane A ◐] [lane B ◑] → [finish] │
├──────────────────────────────────────────────────────────────┤
│ Right panel tabs: [Gate*] [Step detail] [Session logs]       │
├──────────────────────────────────────────────────────────────┤
│ ▸ Link to /logs?session=ses_…                                │
└──────────────────────────────────────────────────────────────┘
```

- Applied preview, live Session/Run, and terminal history use one page,
  flowchart, selection model, and metadata panel. The header exposes **Run**
  only when the Hub returns `manual && can_run`.
- Logical flow identity is `{origin_space_id, flow_id}`. Applied preview uses
  the latest digest; a run and its historical graph use the flow/catalog and
  sanitized resolver identity pinned when that run was admitted.
- The Hub projects normalized branch schemas, routes, artifact constraints and
  safe resolver identity (`handler_id`, type, optional View id, config digest).
  Commands, prompts, host paths, parameters, environment and secrets never
  enter graph payloads. Clients do not compile defaults or match handlers.
- Steps remain rectangular and resolver-modality neutral. A decision diamond is
  added only for custom/multi-outcome branching. Plain `completed` / `failed`
  uses direct edges, and all run-failure routes share one subdued failure
  terminal.
- Selecting a step keeps the graph visible and opens its metadata in the right
  panel; narrow screens use an equivalent closeable drawer.
- **Gate tab** auto-focus on arrival from notification
- **Parallel lanes** = sibling runs as **fork/join nodes in one flowchart** (primary); lane click opens run detail in right panel — not separate top-level tabs per lane
- **Flowchart library:** `@xyflow/react` (React Flow), **lazy-loaded** on session/run routes
- **No declared graph:** journal replay waterfall (Inngest-style) — **not blank**

```text
Journal replay (fallback)
  [✓] 10:01 hook delivered — on-spec-published
  [✓] 10:01 action dispatched — wake_review @ spc_frontend
  [●] 10:02 action working — wake_review
```

### 12.5 First-run

No v1 seven-step wizard. Empty sidebar → instruction page:

- Copy-to-clipboard CLI blocks
- Live "Waiting for space…" SSE indicator
- Sidebar populates when `mrmr space link` completes — no reload
- Fresh storage has zero spaces, persisted contracts, package-catalog entries, or demo flows
- `mrmr setup` confirms one folder-derived display name and editable slug, then uses that slug consistently in Hub creation and `.mrmr/`
- `mrmr space init` is offline and creates no Hub record or credential

Optional: `mrmr dev` opens shell + shows test invoke button for first action.

### 12.6 Notifications

| Requirement | Detail |
|-------------|--------|
| Persistence | Survive refresh; stored in hub until dismissed/resolved |
| Routing | Gate assignees; fallback to `flow:run` holders |
| Expiry | Show countdown when `expires_at` set |
| Out-of-shell | Defer email/desktop push — when built: **`mrmr.gate.pending`** (assignees) and **`mrmr.run.failed`** (watchers / `flow:run` holders) only |
| Failure | Typed error + **Retry** (new Run, same Session — §3.6) when run failed |

### 12.7 Routes

| Route | Purpose |
|-------|---------|
| `/spaces/new` | CLI instructions |
| `/spaces/:id` | Space home |
| `/spaces/:id/flows/:flowId` | Flow preview |
| `/sessions` | Global session list |
| `/sessions/:id` | Session aggregate view |
| `/runs/:id` | Run detail (deep link to gate/step) |
| `/notifications` | Actionable inbox |
| `/logs` | Journal explorer |

**Remove v1 anti-pattern:** Runtime / Configure mode toggle.

---

## 13. Worked scenarios (rev-1)

### 13.1 Morning brief

```text
1. User clicks Run on flow "morning-brief" → Session ses_… + Run run_…
2. Flow steps invoke actions in general, task, email, research spaces
3. Each invoke creates step memo on run_…
4. Gate step aggregate → gate pending → Needs you (1)
5. Approver opens gate tab → approve
6. Final invokes draft email + calendar
7. Run completed → Session completed
```

### 13.2 Cursor dev → review (headless start)

```text
1. Dev runs agent in space — no shell action
2. Agent MCP creates Session + Run with exec_context.worktree
3. Agent or flow step opens gate → notification
4. Flowchart shows run at "user review" step
5. Approve → journal → agent continues
```

### 13.3 Backend → frontend hook chain

```text
1. Backend emits mrmr.spec.published
2. Hook on-spec-published fires → Session auto-created + Run run_…
3. Invoke wake_review in frontend space (preflight executor)
4. Artifact xfr_… materialized to .mrmr.temp/inbox/
5. Journal replay visible even without flow graph bound
6. Optional: start_flow attaches graph mid-session
```

### 13.4 Parallel worktrees with partial failure

```text
1. Flow parallel_dev matrix creates Run run_A, Run run_B under Session ses_…
2. run_A completes; run_B fails at review gate rejected
3. Session status → partial_failure
4. Shell shows lane A green, lane B red
5. User clicks **Retry** on run_B → new Run with `reference_run_ids: [run_B]` (§3.6)
```

### 13.5 Move flow to shared catalog

```text
1. Flow files live in project space `.mrmr/flows/preview-review/`
2. Team moves directory to team-catalog space (git mv)
3. mrmr space apply
4. Grants: flow:run to team actors on flw_feature_delivery
5. Other spaces see under Available to run — no reinstall per space
```

---

## 14. Architectural pitfalls (explicit guardrails)

| Pitfall | Guardrail in rev-1 |
|---------|-------------------|
| Session overload | Session + Run split |
| Invoke into void | Executor preflight + typed errors |
| Dual ACL confusion | Single capability model |
| Flowchart lies | Run step memo + pinned flow_digest |
| Silent headless runs | Mandatory session + run on hook delivery |
| Blank session view | Journal replay fallback |
| Hidden space leak | Sanitized gate context (§6.4) |
| Retry double-execution | Step idempotency keys + memo hash |
| Orchestration drift | Terminal run immutability; new run for refinement |
| Fat flow | PR checklist + schema rejects inline script steps |

---

## 15. Anti-patterns (extended)

| Anti-pattern | Why |
|--------------|-----|
| Hub stores view registry | Views are clients, not protocol state |
| `scope: global` on flow file | Duplicates grants |
| Path-as-session-id | Breaks security, federation, rename |
| Default `mcp.wake_pending` queue (removed) | Hides executor gaps |
| "Attach session when possible" | Not implementable — mandatory |
| Timeline as primary live UX | Use flowchart + journal replay |
| Gate approve without graph preview (agent push) | Rubber stamp — meaningless oversight |
| 4-level ACL + scopes | Two vocabularies — silent denials |
| Hub runs LLM loop | Out of scope |
| Flow implements business logic | Second agent platform |

---

## 16. Open questions — resolution table

| # | Question | rev-1 resolution |
|---|----------|------------------|
| 1 | Space path binding | Stable `spc_*` + `bindings[]` `{ host, path, primary }`; path never id |
| 2 | Session id encoding | **Closed** — opaque + `subject` (§3.5) |
| 3 | Hidden space in shared session | **Closed** — sanitized gate (§6.4) |
| 4 | Global flow expand auth | **Closed** — `flow:read` vs `flow:run` (§9.2) |
| 5 | hub.admin | **Closed** — breakglass + per-space write (§9.3) |
| 6 | Failure UX | Failed row + badge + typed error + retry-from-step |
| 7 | Flows triggering flows | **Shipped** — `start_flow` step (§5.5) |
| 8 | Inline threshold / GC | **64 KiB** now; TTL 7d; daemon sweeper → core GC command (§7.4) |
| 9 | Remote space no local path | Virtual binding `type: remote_hub`; remote executor required; preflight + 3× retry with backoff (§16b F3) |

### 16b. Architecture resolutions (2026-06-30)

Resolved from [architecture.md](./architecture.md) §3. Normative detail in sections cited.

| ID | Question | Resolution |
|----|----------|------------|
| P1 | Matrix expansion timing | **Eager at parallel step entry** — all sibling Runs in one TX when matrix resolved (§5.2.1) |
| P2 | Headless `step_id` | **`hook:{hook_id}`** / **`handler:{id}`** / **`orchestration:proposed`** (§3.6); `action:{action_name}` removed — superseded by `handler:{id}` (Task 15) |
| P3 | Session cancel cascade | Graceful drain + **`ExecutorPort.cancel`** + hub **30s** cap (§3.6) |
| P4 | `queue_poll` ownership | **External worker contract only** — poll API §4.6; no in-hub queue runtime |
| P5 | Hook vs run idempotency | **Propagate** hook `dedup_key` → run `idempotency_key` (§4.5) |
| P6 | Retry-from-step | **New Run**, same Session, `reference_run_ids` (§3.6) |
| U1 | `requires_view` resolution | **Removed** — flow-level `requires_view` is rejected; Views bind through the space (`handlers.yaml`) and run detail exposes `open_steps[]` |
| U2 | Agent orchestration push schema | **`murrmure.flow.attach/v1`** = same manifest as files (§6.3) |
| U3 | Landing space API | **`PATCH /v1/me`**; suggest on first link, never auto-set (§10.6) |
| U4 | Hosted web SSE auth | Cookie or short-lived **SSE ticket** — not Bearer on EventSource (§10.3) |
| U5 | React Flow bundle | **Accept**, lazy-load on session/run routes (§12.4) |
| U6 | Parallel lane layout | **Fork/join in one flowchart**; right-panel drill-down (§12.4) |
| O1 | Artifact GC sweeper | **Daemon cron** → hub-core **`ArtifactGcCommand`** (§7.4) |
| O2 | Executor registration | Per-type defaults in docs; handler `type` binds executor (§4.2) — action-invoke executor pick removed (Task 15) |
| O3 | Out-of-shell notifications | **Shipped** — gate pending + run failed (§12.6) |
| F1 | Session federation | **Hub-local** `session_id`; optional shared `subject` as soft link only (slice I) |
| F2 | Cross-hub artifact GC | Each hub GCs local copy; legal hold via `hold: true` (§7.4) |
| F3 | Remote space binding | Virtual binding; preflight remote health; **3 retries**, exponential backoff, then `EXECUTOR_UNAVAILABLE` (slice I) |

---

## 17. Migration slices (resequenced)

| Slice | Scope | Depends on |
|-------|-------|------------|
| **A** — Docs & types | philosophy update, Zod: Session, Run, Gate, Action, Journal CE shape, artifact v1 | — |
| **B** — Space directory index | `mrmr space init/link/apply`; index handlers, flows, views | A |
| **D** — Handlers + artifacts | handler dispatch + `step:resolve` completion, `.mrmr.temp/`, exchange store (action-invoke spine removed — Task 15) | B |
| **C** — Session + Run protocol | CRUD, journal linkage, step memo, journal replay view | D |
| **H** — Notifications + logs | Needs you, `/notifications`, `/logs` filters, SSE | C |
| **E** — Flow index + start conditions | space apply, manual/event/schedule, space home sections | C |
| **G** — MCP orchestration attach + gate | Agent push → validate gate → bind | E |
| **F** — Custom view packages | Optional; shell defaults sufficient first | H |
| **I** — Federation + remote executors | XS1+, optional A2A executor | D, C |

**Rationale:** Handlers + `step:resolve` are the execution spine — the `invoke` action spine is removed/historical (Task 15). Sessions without resolvable steps are metadata. Views are optimization. Federation last.

### v1 compatibility shims (historical, non-normative — removed)

> **Removed (Task 15 Lane C).** These migration shims are gone; the clean
> protocol is the only one. `POST /v1/spaces/{id}/instances` returns 404 (use
> `POST …/runs`); `mcp_wake` is a retired wire (404), not an action-invoke
> shim — use event handlers + `murrmure_emit_event` + flow triggers; the
> review-loop is an example flow + view client, not a product center; and the
> Configure UI routes are deprecated/redirected to CLI instruction pages.

- `POST /v1/spaces/{id}/instances` → removed (404); create Session+Run via `POST …/runs`; `instance_id` is gone
- `mcp_wake` → removed (404 retired wire); routes to no shim — use `on: event:` handlers + `murrmure_emit_event` + flow triggers
- Review-loop capability → example flow + view client, not product center
- Configure UI routes deprecated; redirect to CLI instruction pages

---

## 18. Success criteria (rev-1)

- [ ] PR checklist: "protocol / flow / view rule / space implementation?"
- [ ] `mrmr space link` + `mrmr space apply` — shell lists space and flow without wizard
- [ ] Hook delivery always creates session + run visible in shell within 2s SSE
- [ ] Invoke to space with no executor → `EXECUTOR_UNAVAILABLE` within timeout; visible on run graph
- [ ] Session spans two spaces; two sibling runs; partial_failure renders correctly
- [ ] Agent MCP attach blocked until gate approve with graph preview
- [ ] Journal entries validate CloudEvents required attributes
- [ ] Inline payload > 64 KiB rejected with artifact hint
- [ ] Hidden space gate shows sanitized context to assignee
- [ ] No API stores model name, skill content, or system prompt
- [ ] v1 J01 fixtures green via shim layer or explicit migration PR

---

## 19. Reference repo borrow/reject (summary)

| Repo | Borrow | Reject |
|------|--------|--------|
| **A2A** | contextId/Task → Session/Run; task immutability; parallel tasks | Agent Cards; SendMessage-primary |
| **Temporal** | Workflow/Activity → Flow/Action; worker poll → Executor; event history; signals → gates | Workflow code in hub; deterministic replay of code |
| **Inngest** | Step memoization; every run visible; journal replay waterfall | Full step runtime in hub |
| **CloudEvents** | Envelope + `subject` for correlation; source+id dedup | — |
| **Windmill** | Split-pane run view; Gantt lanes; restart-from-step; scripts vs flows | In-platform editor as product center |
| **GHA** | Start conditions; matrix parallel; required reviewers; workflow_call reserved | — |

---

## 20. Related artifacts

| Artifact | Relevance |
|----------|-----------|
| [philosophy.md](./philosophy.md) | Normative intent |
| [architecture.md](./architecture.md) | v2 layer model, package graph, anti-patterns |
| [hub/architecture.md](../hub/architecture.md) | Journal kernel ADRs |
| [flow-runtime/spec.md](../flow-runtime/spec.md) | v1 mount — migrate to index |
| [cross-space/spec.md](../cross-space/spec.md) | XS0 queries; federation bridge |
| [desktop/spec.md](../desktop/spec.md) | Shell host |
| [plan/index.md](../../plans/product/plan/index.md) | v2 implementation plan (phases 01–10, **complete** rev-5) |
| [deferred.md](./deferred.md) | Intentionally deferred scope |
| [archives/plans/product/](../../archives/plans/product/) | Full rev-1 draft text (historical) |

---

## 21. Implementation plan status (phases 01–10)

Sourced from [plan/index.md](../../plans/product/plan/index.md) rev-5 (2026-07-03). **All phases shipped** in `@murrmure/cli@1.0.0` release.

**Post-1.0 normative amendment:** Handlers + contract keys + `.mrmr/` layout (2026-07-09) — see [bridges/handlers.md](../bridges/handlers.md) and §4 above.

**Known gaps B1–B10:** closed — see [known-gaps.md](../../../apps/docs/guide/known-gaps.md) and [acceptance.md](../acceptance.md).

| Phase | Topic | Status | Plan |
|------:|-------|--------|------|
| 01 | Apply validation + cross-ref lint | ✅ | [01-apply-validation](../../plans/product/plan/01-apply-validation.md) |
| 02 | View SDK (`@murrmure/view-sdk/app`, `mrmr view dev`) | ✅ | [02-view-sdk](../../plans/product/plan/02-view-sdk.md) |
| 03 | Engine completion (checkpoint dispatch, `on_resolve`, step outputs) | ✅ | [03-engine-completion](../../plans/product/plan/03-engine-completion.md) |
| 04 | Space flow scaffold (`mrmr space flow init`) | ✅ | [04-space-flow-scaffold](../../plans/product/plan/04-space-flow-scaffold.md) |
| 05 | ViewCanvasHost (full primary-region checkpoint UI) | ✅ | [05-view-canvas-checkpoints](../../plans/product/plan/05-view-canvas-checkpoints.md) |
| 06 | Reference workflow (`preview-review-v2`, R1–R6) | ✅ | [06-reference-workflow-preview-review](../../plans/product/plan/06-reference-workflow-preview-review.md) |
| 07 | Unified **`murrmure`** agent skill | ✅ | [07-unified-murrmure-skill](../../plans/product/plan/07-unified-murrmure-skill.md) |
| 08 | CLI setup wizards (`mrmr setup`; `space onboard` retired — see Task 15 Lane A) | ✅ | [08-cli-setup-wizards](../../plans/product/plan/08-cli-setup-wizards.md) |
| 09 | Retired worker stack deletion | ✅ | historical release record |
| 10 | Human docs rewrite + acceptance proof | ✅ | [10-docs-and-proof](../../plans/product/plan/10-docs-and-proof.md) |

Living checklist: [00-doc-skill-mcp-tracker.md](../../plans/product/plan/00-doc-skill-mcp-tracker.md).
Historical worker-stack inventories and review synthesis live under
`studio-specs/archives/`.

**Manual release checklist (not CI-gated):** 10-T1/10-T1b Desktop walkthrough, 10-U2 TTFRun ≤10 min — see phase 10 DoD.

---

## 22. Promotion checklist (historical — completed 2026-06-30)

1. Merge entity changes into [philosophy.md](../../current/product/philosophy.md) (Session + Run, hooks rename, mandatory observability).
2. Replace [product/spec.md](../../current/product/spec.md) review-loop center with rev-1 wire routes.
3. Add Zod schemas: `Session`, `Run`, `RunStepMemo`, `Gate`, `Action`, `JournalEntry`, `mrmr.artifact/v1`.
4. Deprecate `InstanceSchema` → alias `RunSchema`.
5. Update [flow-runtime/spec.md](../../current/flow-runtime/spec.md) for index model.
6. Mark [space-flow-protocol-v2.md](./space-flow-protocol-v2.md) as archived reference.
7. CI: add spec-lint for CloudEvents required fields on journal fixtures.

---

*End of rev-1.*
