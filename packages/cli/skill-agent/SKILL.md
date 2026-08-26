---
name: murrmure-agent
description: >-
  Runtime skill for Murrmure handler assignments, meeting seats, and MCP step
  work. Prefer this when the prompt has Protocol murrmure.agent/v1 or
  murrmure.meeting/v1, or the human asks this space to join a meeting.
  For authoring flows/views use murrmure-developer.
version: 1.3.12
---

# Murrmure Agent Skill

**Default path is a handler assignment.** Most of the time you were spawned by
`shell_spawn` with a Task + `Protocol: murrmure.agent/v1` block. Do that work and
resolve. Do **not** treat this skill as a checklist to “set up” the session.

For authoring `.mrmr/` spaces, flows, views, and handlers, use
**`murrmure-developer`** instead.

---

## Which mode am I in?

| Signal | Mode | What to do |
|--------|------|------------|
| Prompt has `Protocol: murrmure.meeting/v1` | **Meeting seat** | You are **this seat**. On convene, pull `murrmure_meeting_transcript` and, when another roster seat exists, make one concise contribution to the goal. A one-seat room stays silent. On `trigger: resumed`, pull the transcript and continue the same `ses_*` / `ptc_*` — do not re-introduce. Later `said` resumes the same logical chat; then you may stay silent unless addressed or useful. Attach with `murrmure_put_artifact` then `said` `artifacts: [xfr_*]`. Materialize any needed `xfr_*` with `murrmure_get_artifact` and read its returned `local_path`. Target the relevant speaker and use `in_reply_to` when appropriate. Never repeat or acknowledge existing material. Do **not** `murrmure_resolve_step` the room. Do not paste the journal. Do not call `murrmure_get_pending_wake`. |
| Prompt has `Protocol: murrmure.agent/v1`, or env has `MURRMURE_ASSIGNMENT_SCOPE` / `MURRMURE_RUN_ID` + `MURRMURE_STEP_ID` | **Assignment** | Jump to [Assignment](#assignment-do-this-now). Skip everything else. |
| Human asks this space to join a meeting / add a seat | **Wire the seat** | [Join meetings](#this-space-should-join-meetings). Add `type: shell_spawn` — not `mcp_session`. |
| Interactive Cursor chat / local MCP with no assignment prompt | **Interactive** | [Interactive loop](#interactive-loop) only if the human asked you to operate a run. |
| Prompt says `run_feedback_agent` or is a Murrmure control wake | **Feedback wake** | Follow that prompt (write `feedbacks/…`). Not a flow assignment. |

`murrmure_get_pending_wake` is **only** for feedback/control wakes. Never call it
on an assignment. Never open this skill and then “check for a wake” before the
Task — the Task is already in your prompt.

---

## This space should join meetings

Skills do not make a seat. This repo needs a handler. **`type: shell_spawn`**
(required). `mcp_session` only pokes an open chat — do not use it.

1. Ensure `.mrmr/space/personas.yaml` has a persona id (e.g. `default`).
2. Append this to `.mrmr/space/handlers.yaml` (`participant` = that persona):

```yaml
  - id: meeting-default
    contract_keys: []
    on:
      event:
        type: mrmr.meeting.said
        participant: default
    type: shell_spawn
    complete: explicit
    prompt: |
      You are the default seat in this Murrmure meeting.
      On convene, pull the transcript and contribute once if another seat exists.
      On later turns you may stay silent unless addressed or useful.
    command: cursor agent --force --approve-mcps --trust {{prompt}}
    session:
      mode: persistent
      transport: pty
      shutdown_grace_ms: 5000
    cwd: "{{space_root}}"
```

3. `mrmr space apply --strict`
4. `mrmr connection grant --space spc_… --capabilities=space:read,flow:read,flow:run,step:resolve,event:emit,journal:read,blob:write,blob:read`

Then convene starts one interactive `cursor agent` process here. The first
prompt is a command argument. Later `said` writes the next turn into that PTY
until meeting close.
Prefer **`murrmure-developer`** if that skill is installed
(`reference/meeting-seat.md`).

---

## Assignment (do this now)

1. Read the **Task** in your prompt (between the task markers, or the authored
   instruction above the protocol block).
2. Do that work in the repo (read the files it names, implement the change).
3. Call **`murrmure_resolve_step`** using the **Contracts** section below the
   protocol line — copy live `run_id` / `step_id` / branch / example payload.
   Do not invent IDs.
4. Stop. Do not bootstrap (`space_health`, `list_handlers`), do not poll for
   wakes, do not re-read this whole skill for “platform model” first.

If `complete: explicit`, resolve is mandatory. If resolve fails on schema, fix
the payload against the Contracts block (or `murrmure_list_step_contracts` with
the live `run_id`) and retry.

### Protocol block

Generated contracts start with:

```text
Protocol: murrmure.agent/v1
```

Treat Task = what to build; Contracts = only source for branches, schemas, IDs,
artifacts, and resolve calls. Single-key assignments have no Discovery section.
Multi-key owners may call `murrmure_list_step_contracts` after a transition.
Branch names are neutral — use the rendered `Then` effect.

Assignment MCP uses the ephemeral token when `MURRMURE_ASSIGNMENT_SCOPE` is set;
do not reuse a persistent local connection inside the handler child.

---

## Interactive loop

Use only when a human asked you to operate a run **without** an assignment
prompt already in context:

1. `murrmure_get_run` / `murrmure_get_run_context` — inspect.
2. `murrmure_list_step_contracts` — active branches / schemas.
3. Do the work.
4. `murrmure_resolve_step` when you own the step.
5. `murrmure_wait_for_run` when waiting on humans or downstream handlers.

| Path | When | Your job |
|------|------|----------|
| **Handler-dispatched** | You were spawned by `shell_spawn` | [Assignment](#assignment-do-this-now) — ignore this table’s “inspect first” habit |
| **Headless MCP** | You created the run or were asked to advance without shell dispatch | Read contract, work, resolve; never assume an action invoke completes a step |

**Never** use legacy gate tools: `murrmure_complete_action`, `murrmure_wait_for_gate`,
`murrmure_resolve_gate`.

### Optional local pre-flight (interactive only)

Only when troubleshooting a space the human is authoring — **not** on assignment:

- `murrmure_space_health` / `murrmure_list_handlers` — coverage after apply
- `murrmure_list_emittable_events` — if you have `event:emit` and need to emit

---

## Nested steps

Parent resolvers with declared `steps:` activate one direct child at a time,
yield, and resume on return.

- **`murrmure_open_child_step`** (`{ run_id, parent_step_id, child_step_id, idempotency_key }`)
  yields your assignment and opens one declared child.
- A child branch with neither `route` nor `resume` returns to its immediate parent
  by default (including `failed`). `resume: <ancestor_step>` returns to an
  already-open ancestor. Immediate run failure needs `route: { run: failed }`.
- On resume, re-read `active-step-contract.json` (or
  `MURRMURE_ACTIVE_STEP_CONTRACT_PATH`); the trigger is `returned_child`.
  Iterate or resolve your own contract.

Preview-review: build opens `review` via `murrmure_open_child_step`; on
`changes_required` iterate; on `validated` resolve `build` as `completed`.

### `murrmure_wait_for_run` vs `murrmure_get_run`

| Tool | Use when |
|------|----------|
| **`murrmure_wait_for_run`** | Block until run advances or terminates — preferred after resolve when work continues async |
| **`murrmure_get_run`** | One-shot inspect; avoid tight poll loops |

### Cross-space events

When granted `event:emit`: `murrmure_list_emittable_events` then `murrmure_emit_event`.

### Artifacts

Each branch carries its own `artifact_slots`, `payload_required`, and
`artifact_required`. Create required outputs under `MURRMURE_STEP_WORKDIR`, then
`artifacts_out: [{ "slot": "spec", "path": "spec.md" }]`. Remote agents use the
authorized upload reference from the Contracts block — never invent machine paths.

Collections (`max_files > 1`) use `.directory` tokens; singletons use `.path`.
Do not cache `.mrmr/dev/runs/…` paths across runs.

### Federation reads

`query_ask` with `space:read` — typed cross-space query when the target allows it.

---

## Connection context (reference)

| Variable | Purpose |
|----------|---------|
| `murrmure-mcp` + `--connection <con_…>` | Local MCP — Hub from discovery; credential from OS store |
| hub bearer token | Assignment or headless CI only — never put tokens in prompts/logs |
| `MURRMURE_RUN_ID` / `MURRMURE_STEP_ID` / `MURRMURE_ASSIGNMENT_SCOPE` | Assignment markers |
| `MURRMURE_SESSION_ID` / `MURRMURE_INPUT` / `MURRMURE_STEP_CONTRACT` | Injected context |
| `MURRMURE_ACTIVE_STEP_CONTRACT_PATH` | Re-read after nested transitions |

Default grant profile `local-tools/v1`: `space:read`, `flow:read`, `flow:run`,
`step:resolve`.

---

## Platform model (30 seconds)

| Layer | Role |
|-------|------|
| **Space directory** | `.mrmr/space/` — handlers, optional bindings/events; flows + views |
| **Handler** | Bound via `on: step.opened::{flow}.{step}` — `contract_keys` is prompt-scope only |
| **Hub index** | Compiled after `mrmr space apply` |
| **Session / Run** | Correlation + immutable execution; runs pin `flow_digest` |
| **Step contract** | Active slice — resolve via `murrmure_resolve_step` |
| **MCP** | Connection-filtered tools |

Murrmure is a coordination kernel, not an agent framework. Spaces own execution.

---

## Error recovery

| Symptom | Action |
|---------|--------|
| Resolve rejected (schema) | Match Contracts / `murrmure_list_step_contracts` |
| `CONTRACT_VALIDATION_FAILED` | Artifacts go in `artifacts_out`, not payload |
| `ARTIFACT_QUOTA_EXCEEDED` | Shrink output; same idempotency key only for same metadata |
| `EXECUTOR_UNAVAILABLE` / timeout | Handler command / cwd / timeout — human/developer skill |
| Missing handler | Authoring problem — `murrmure-developer` / human |
| Stale contract in long shell | Re-read `MURRMURE_ACTIVE_STEP_CONTRACT_PATH` |
| `FLOW_CONCURRENCY_LIMIT` | Wait or cancel an active run — do not tight-retry |
| `SPACE_HAS_ACTIVE_RUNS` (apply) | Wait for runs to terminate, then apply |

---

## Core MCP tools

Assignment essentials: **`murrmure_resolve_step`**, optionally
`murrmure_list_step_contracts`, `murrmure_get_run`, `murrmure_wait_for_run`,
`murrmure_open_child_step`.

Interactive / advanced: `murrmure_get_run_context`, `murrmure_get_run_graph`,
`murrmure_space_health`, `murrmure_list_handlers`, `murrmure_list_emittable_events` /
`murrmure_emit_event`, `murrmure_meeting_transcript`, `murrmure_put_artifact`,
`murrmure_get_artifact`,
`murrmure_journal_query`,
`query_ask`. Meeting seats pull the transcript — they do not `journal_query` the room.

Full catalog: [reference/mcp.md](reference/mcp.md). Gaps:
[reference/known-gaps.md](reference/known-gaps.md).

## Install

```bash
mrmr skill install              # agent only (worker spaces)
mrmr skill install --variant all   # agent + developer (authoring repos)
```
