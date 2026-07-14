---
name: murrmure-agent
description: >-
  Runtime MCP operating skill for Murrmure agents. Use when handling
  run/session/step lifecycle, resolving steps, or inspecting run context.
version: 1.1.0
---

# Murrmure Agent Skill

**Runtime skill** — operate runs, resolve steps, wait for humans. For authoring `.mrmr/` spaces, flows, views, and handlers, use **`murrmure-developer`** instead.

Murrmure is an **event-based coordination kernel**: sessions, journal events, authorization, gates, artifacts, and audit. It is **not** a programming language or agent framework. Spaces own execution; flows own orchestration shape; views own human presentation; agents participate via grant-filtered MCP tools.

## Platform model (30 seconds)

| Layer | Role |
|-------|------|
| **Space directory** | `.mrmr/space/` — `handlers.yaml`, optional `bindings.yaml`, `events.yaml`; `.mrmr/flows/`, `.mrmr/views/` |
| **Handler** | Space-owned execution bound to `contract_keys` (`{flow_ref}.{step_id}`) — dispatches shell/MCP on `step.opened` |
| **Hub index** | Compiled flow IR + handler digests after `mrmr space apply` |
| **Session / Run** | Correlation + immutable execution; runs pin `flow_digest` |
| **Step contract** | Active step slice — `id`, `description`, `branches` (`schema`, `route`/`resume`); resolver-agnostic; resolve via `murrmure_resolve_step` |
| **ViewCanvasHost** | Full primary canvas for custom views bound to steps by the space (handlers + Views) |
| **MCP** | Grant-filtered tools for agents |

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `MURRMURE_HUB_TOKEN` | MCP client config | Grant token for hub API / MCP bridge |
| `MURRMURE_HUB_URL` | CLI + optional MCP | Hub base URL (CLI default) |
| `MURRMURE_SPACE_ID` | CLI default space | Optional; MCP uses grant-bound space |
| `MURRMURE_RUN_ID` | Handler child env | Current run (shell_spawn dispatch) |
| `MURRMURE_STEP_ID` | Handler child env | Active step id |
| `MURRMURE_SESSION_ID` | Handler child env | Session correlation |
| `MURRMURE_INPUT` | Handler child env | Step input JSON |
| `MURRMURE_STEP_CONTRACT` | Handler child env | Active step contract JSON |
| `MURRMURE_ACTIVE_STEP_CONTRACT_PATH` | Long shell sessions | Path to `active-step-contract.json` — re-read after transitions |

Handler dispatch injects run-scoped tokens and context. Do not reuse long-lived grant tokens inside shell commands.

## Bootstrap (before operating a run)

1. **`murrmure_space_health`** — index counts, handler coverage, apply warnings.
2. **`murrmure_list_handlers`** — confirm handlers exist for expected `contract_keys`.
3. **`murrmure_list_emittable_events`** — when you may emit cross-space events (`event:emit` grant).
4. Reload MCP after grant mint or `mrmr space apply`.

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

Parent steps with `orchestration: engine-routed` and nested `steps:` expose qualified ids (`build.build-loop`, `build.review`).

- Resolve **your** nested step with the qualified `step_id`.
- Nested steps with no bound handler (e.g. a human review step) — **`murrmure_wait_for_run`**; do not resolve them yourself.
- A nested step's `resume: <parent>` branch yields control back to the open parent when validated.

Preview-review pattern: agent owns `build.build-loop` (resolve with `preview_url`); human owns `build.review`; on `changes_required`, fix and resolve `build.build-loop` again.

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

When branch schema defines `artifact_slots`, pass `artifacts_out` on resolve with transfer refs. Read prior step artifact paths from contract context (`{{murrmure.step.*}}` in handler params).

### Federation reads

`query_ask` with `space:read` — typed cross-space query (e.g. `spec_summary@1`). Target space must allow inbound queries.

## Grant checklist

| Capability | Need for |
|------------|----------|
| `space:read` | get run, list contracts, wait, list handlers |
| `step:resolve` | `murrmure_resolve_step` |
| `flow:run` | create session/run, attach orchestration |
| `journal:read` | `murrmure_journal_query` |
| `event:emit` | `murrmure_emit_event` |

Mint: `mrmr grant mint --capabilities space:read,flow:run,step:resolve`. Reload MCP after mint.

## Error recovery

| Symptom | Action |
|---------|--------|
| `EXECUTOR_UNAVAILABLE` / handler timeout | Check handler command, `cwd`, timeout_ms; verify apply indexed handlers |
| Resolve rejected (schema) | Re-read `murrmure_list_step_contracts`; match branch + payload to schema |
| Missing handler for step | Author space needs handler + `contract_keys` — switch to developer skill / human |
| Stale contract in long shell | Re-read `MURRMURE_ACTIVE_STEP_CONTRACT_PATH` or call `murrmure_list_step_contracts` |

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
