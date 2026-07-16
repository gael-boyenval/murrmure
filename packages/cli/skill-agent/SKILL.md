---
name: murrmure-agent
description: >-
  Runtime MCP operating skill for Murrmure agents. Use when handling
  run/session/step lifecycle, resolving steps, or inspecting run context.
version: 1.3.0
---

# Murrmure Agent Skill

**Runtime skill** — operate runs, resolve steps, wait for humans. For authoring `.mrmr/` spaces, flows, views, and handlers, use **`murrmure-developer`** instead.

Murrmure is an **event-based coordination kernel**: sessions, journal events, authorization, gates, artifacts, and audit. It is **not** a programming language or agent framework. Spaces own execution; flows own orchestration shape; views own human presentation; agents participate through connection-filtered MCP tools.

## Platform model (30 seconds)

| Layer | Role |
|-------|------|
| **Space directory** | `.mrmr/space/` — `handlers.yaml`, optional `bindings.yaml`, `events.yaml`; `.mrmr/flows/`, `.mrmr/views/` |
| **Handler** | Space-owned execution bound via `on::key` (`on: step.opened::{flow_name}.{step_id}`) — dispatches shell/MCP; `contract_keys` is prompt-scope only |
| **Hub index** | Compiled flow IR + handler digests after `mrmr space apply` |
| **Session / Run** | Correlation + immutable execution; runs pin `flow_digest` |
| **Step contract** | Active step slice — `id`, `description`, `branches` (`schema`, `route`/`resume`); resolver-agnostic; resolve via `murrmure_resolve_step` |
| **ViewCanvasHost** | Full primary canvas for custom views bound to steps by the space (handlers + Views) |
| **MCP** | Connection-filtered tools for participants |

## Connection context

| Variable | Where | Purpose |
|----------|-------|---------|
| `--hub` + `--connection` | Local MCP descriptor | Hub/connection IDs; bridge resolves the credential from the OS store |
| hub bearer token | Handler assignment or explicit headless CI | Ephemeral/runtime secret injection; never local config, files, args, prompts, or logs |
| `MURRMURE_RUN_ID` | Handler child env | Current run (shell_spawn dispatch) |
| `MURRMURE_STEP_ID` | Handler child env | Active step id |
| `MURRMURE_ASSIGNMENT_SCOPE` | Handler child env | Non-secret run/step/handler assignment marker used by the bundled bridge |
| `MURRMURE_SESSION_ID` | Handler child env | Session correlation |
| `MURRMURE_INPUT` | Handler child env | Step input JSON |
| `MURRMURE_STEP_CONTRACT` | Handler child env | Active step contract JSON |
| `MURRMURE_ACTIVE_STEP_CONTRACT_PATH` | Long shell sessions | Path to `active-step-contract.json` — re-read after transitions |

Handler dispatch injects run-scoped credentials and context. Do not reuse a
persistent local connection inside shell commands.

### Assignment prompt protocol

Every generated handler contract begins exactly
`Protocol: murrmure.agent/v1`. Treat the authored Task as what to build and the
generated Contracts as the only source for branches, schemas, IDs, artifacts,
and resolve calls. Each branch includes a complete Draft 2020-12 payload schema,
separate artifact requirements, and a full `murrmure_resolve_step` call with
live IDs and valid example values. Do not guess or replace those IDs.

A single-key assignment has no Discovery section. Multi-key subgraph owners
receive Discovery and may refresh full contracts after a transition. Branch
names are neutral: use the rendered `Then` effect rather than inferring behavior
from names such as `failed`, `cancel`, or a custom label.

The installed local MCP descriptor automatically uses the ephemeral assignment
token when `MURRMURE_ASSIGNMENT_SCOPE` is present; it does not read the
persistent local connection in that child. Cross-run/cross-step writes and
expired or revoked assignment writes are denied.

## Bootstrap (before operating a run)

1. **`murrmure_space_health`** — index counts, handler coverage, apply warnings.
2. **`murrmure_list_handlers`** — confirm handlers exist for expected `on::key` aliases.
3. **`murrmure_list_emittable_events`** — when you may emit cross-space events (`event:emit` grant).
4. Reload MCP after connection installation or `mrmr space apply`.

Example — list handlers:

```json
{ "name": "murrmure_list_handlers", "arguments": {} }
```

```json
{
  "space_id": "spc_ui_sandbox",
  "handlers": [
    {
      "id": "feature_write_spec",
      "on": "step.opened::preview-review.write_spec",
      "contract_keys": ["preview-review.write_spec"],
      "type": "shell_spawn"
    }
  ]
}
```

## Runtime loop

1. **Inspect context** — `murrmure_get_run`, `murrmure_get_run_context`.
2. **Read active contract** — `murrmure_list_step_contracts` → branches, schemas, nested step ids.
3. **Execute work** — from handler-injected prompt or your task brief.
4. **Resolve** — `murrmure_resolve_step` with valid `branch` and `payload` matching branch schema.
5. **Wait** — `murrmure_wait_for_run` when a human or downstream handler must act.

### Handler-dispatched vs headless

| Path | When | Your job |
|------|------|----------|
| **Handler-dispatched** | Space has handler for active `contract_key`; you were spawned by `shell_spawn` | Follow injected prompt; call `murrmure_resolve_step` with explicit branch when `complete: explicit` |
| **Headless MCP** | You created run via MCP or were asked to advance without shell dispatch | Read contract, do work, resolve; never assume an action invoke completes a flow step |

**Never** use legacy gate tools: `murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate`.

### Nested steps

Parent resolvers with declared `steps:` activate one direct child at a time, yield, and resume on return.

- **`murrmure_open_child_step`** (`{ run_id, parent_step_id, child_step_id, idempotency_key }`) atomically yields your assignment, revokes its mutation credential, and opens one declared child. Only declared children open, one active child per parent, arbitrary input is rejected, and idempotency is parent-scoped.
- A child branch with neither `route` nor `resume` returns to its immediate parent by default (including `failed`). `resume: <ancestor_step>` returns to an already-open ancestor; self, unknown, non-ancestor, or closed targets are rejected. Immediate run failure needs explicit `route: { run: failed }`. Return never opens, resolves, or re-validates the parent.
- Child return emits distinct yielded/resolved/resumed events and creates one fresh parent assignment (reason `resumed`) carrying canonical `returned_child` identity, branch, iteration, payload, and promoted artifact references.
- On resume, re-read `active-step-contract.json` and decide: iterate (open the next declared child) or resolve your own contract. Parent completion routing and explicit goto routing no longer exist.

Preview-review pattern: the build resolver opens `review` via `murrmure_open_child_step` and yields; on `changes_required` it iterates (open review again), and on `validated` it resolves `build` as `completed`.

### `murrmure_wait_for_run` vs `murrmure_get_run`

| Tool | Use when |
|------|----------|
| **`murrmure_wait_for_run`** | Block until run advances, human resolves, or terminal state — preferred after your resolve when downstream work is async |
| **`murrmure_get_run`** | One-shot inspect — step memo, outputs, status; use in polling loops only when wait is unavailable |

Prefer wait over tight poll loops.

### Cross-space events

When granted `event:emit`:

1. `murrmure_list_emittable_events` — allowed `type` + required payload fields.
2. `murrmure_emit_event` — `{ "type": "mrmr.spec.published", "source": "/spaces/spc_spec", "data": { … } }`.

### Artifacts

Each selected branch carries its own `artifact_slots`, `payload_required`, and
`artifact_required`. A required name matching a same-branch slot is a file
requirement, not a payload field. Before resolving, create every required output
inside `MURRMURE_STEP_WORKDIR`, then pass a relative
`artifacts_out: [{ "slot": "spec", "path": "spec.md" }]`. The local bridge
verifies the path stays inside that workdir, derives bounded metadata, and the
Hub applies the same slot, quota, promotion, and idempotency rules as a View.
Remote agents cannot submit machine-local paths; use the authorized upload
reference shown in the generated call. Read prior step artifact
paths from contract context (`{{murrmure.step.*}}` in handler params).

**Collections and the local/remote boundary.** A slot with `max_files > 1` is a
bounded, ordered collection. A local handler consumes it as one verified
directory via the `.directory` token
(`{{murrmure.step.{producer}.artifact.{slot}.directory}}`), materialized under
`.mrmr/dev/runs/{run_id}/steps/{consumer}/inputs/{slot}/` with digest-verified,
normalized, ordered files. A singleton slot uses `.path`. The two tokens are not
interchangeable — a `.path` on a collection or `.directory` on a singleton is
rejected before spawn. As a remote/federated consumer you never receive a
producer path; you receive ordered immutable references (`transfer_id`,
`digest`, `size_bytes`) and materialize them in your own space. The journaled
audit carries opaque references only — never echo a `.mrmr/dev/runs` path into a
resolve payload or event.

**Retention.** Local run bytes are retained for 7 days after a run terminates
(`ended_at + 7 days`) and then garbage-collected; active run directories are
never collected. Global artifact references survive local byte deletion, so a
federated reference stays resolvable after the producer's run tree is reclaimed.
Do not cache a local run-scratch path across runs — re-read it from contract
context each assignment.

### Federation reads

`query_ask` with `space:read` — typed cross-space query (e.g. `spec_summary@1`). Target space must allow inbound queries.

## Connection profile

| Capability | Need for |
|------------|----------|
| `space:read` | get run, list contracts, wait, list handlers |
| `step:resolve` | `murrmure_resolve_step` |
| `flow:run` | create session/run, attach orchestration |
| `flow:read` | inspect the current run graph |

The default `tutorial-builder/v1` profile is exactly `space:read`, `flow:read`,
`flow:run`, and `step:resolve`. Create it with
`mrmr connection create --space spc_…`, then reload MCP. Raw journal and event
emission permissions are advanced and are not default.

## Error recovery

| Symptom | Action |
|---------|--------|
| `EXECUTOR_UNAVAILABLE` / handler timeout | Check handler command, `cwd`, timeout_ms; verify apply indexed handlers |
| Resolve rejected (schema) | Re-read `murrmure_list_step_contracts`; match branch + payload to schema |
| `CONTRACT_VALIDATION_FAILED` | Match each `{ source, path, rule }`; required artifacts belong in `artifacts_out`, not payload |
| `ARTIFACT_QUOTA_EXCEEDED` | Reduce output to the branch limit and fixed file/step/run/space ceilings; retry with the same idempotency key only for the same metadata |
| Missing handler for step | Author space needs handler + `on::key` binding — switch to developer skill / human |
| Stale contract in long shell | Re-read `MURRMURE_ACTIVE_STEP_CONTRACT_PATH` or call `murrmure_list_step_contracts` |
| `FLOW_CONCURRENCY_LIMIT` (start/run rejected) | The flow already has `max_concurrent_runs` non-terminal runs in this space. **Do not queue or retry in a tight loop.** Wait for an active run to terminate (the denial lists `active_run_ids`) or cancel one via the run lifecycle, then start again — the retry runs a fresh admission check. Trigger-denied starts are journaled as `mrmr.flow.start_denied`. |
| `SPACE_HAS_ACTIVE_RUNS` (apply rejected) | An apply cannot swap handlers/Views while a non-terminal run depends on them. Wait for all runs to terminate (or cancel them), then re-apply; the prior index is preserved. This is **not** a capacity denial — it protects the whole space. |

### Run capacity & apply quiescence

- A space may cap a flow's concurrent **non-terminal** runs via `run_policies`
  in `handlers.yaml` (`flow` = applied flow name, `max_concurrent_runs` ≥ 1).
  No policy means unlimited — unrelated flows still run concurrently.
- Every start path (manual, trigger, MCP `create_run`, hook, federated) uses one
  atomic admission check, so a limit of one never admits two. Overflow returns
  `409 FLOW_CONCURRENCY_LIMIT` with the active blocking run IDs — there is no
  queue and no partial run. A headless invoke (`flow_id` null) skips capacity.
- An apply succeeds only when the **whole space** has no non-terminal runs; it
  returns `409 SPACE_HAS_ACTIVE_RUNS` (with `active_run_ids`) otherwise and keeps
  the prior index. No force apply / auto-abort exists.
- Runs and journal events pin the applied `flow_digest` admitted at start, so
  live and historical run metadata reflects the configuration actually used.


## Core MCP tools

- `murrmure_get_run` / `murrmure_get_run_context`
- `murrmure_list_step_contracts`
- `murrmure_get_run_graph`
- **`murrmure_resolve_step`**
- **`murrmure_wait_for_run`**
- `murrmure_space_health`
- `murrmure_list_handlers`
- `murrmure_list_emittable_events` / `murrmure_emit_event`
- `murrmure_journal_query`
- `query_ask`

Full catalog: [reference/mcp.md](reference/mcp.md). Known product gaps: [reference/known-gaps.md](reference/known-gaps.md).

## Install

```bash
mrmr skill install              # agent only (worker spaces)
mrmr skill install --variant all   # agent + developer (authoring repos)
```
