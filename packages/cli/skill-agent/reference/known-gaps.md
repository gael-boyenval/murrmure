# Known gaps (agents)

Read this before assuming declarative flows fully work. Normative backlog: [studio-specs/plans/product/plan/index.md](../../../../studio-specs/plans/product/plan/index.md).

**Note:** B1–B10 here are **user-facing symptoms**. Backlog **phases** in [index.md](../../../../studio-specs/plans/product/plan/index.md) are the normative spec.

## Human docs

[apps/docs/guide/known-gaps.md](../../../../apps/docs/guide/known-gaps.md) — must stay in sync (phase **10** CI gate).

---

Murrmure v3 core (`.mrmr/` space directory, session/run, **handlers + `on::key` binding**, resolver-agnostic step contracts, `triggers`-only start, `open_steps[]` lifecycle, step outputs, flow scaffold, **ViewCanvasHost** at open steps) is **shipped**. Remaining items are **user-visible symptoms** — not the same numbering as backlog phases 01–08.

## What works today

| Feature | Command / surface |
|---------|-------------------|
| Index flows + handlers | `mrmr space apply` (lint warnings; `--strict`) |
| Scaffold flows | `mrmr space flow init <id> --template hello-gate\|hello-invoke` |
| Scaffold views | `mrmr space view init <id>` |
| Run flows (step contracts) | Shell **Run**, `mrmr flow run` |
| Open steps | Resolver-agnostic steps + **`murrmure_resolve_step`** (no bound handler ⇒ `resolver: null`, external resolve) |
| Custom view canvas | **ViewCanvasHost** at `open_steps[]` (Views bound by the space, not the portable flow) |
| View dev loop | `mrmr view dev <id>` → Desktop dev route + fixture tabs |
| Step output templates | `steps.*` template syntax in handler params |
| `shell_spawn` env | `MURRMURE_INPUT`, `MURRMURE_PROMPT`, `MURRMURE_STEP_CONTRACT`, run/session/step ids |
| Step contract injection | `active-step-contract.json`, `{{murrmure.agentStepContract}}` |
| Handler dispatch | `.mrmr/space/handlers.yaml` + `on::key` binding |
| Shell step resolve | `mrmr step resolve` (`complete: cli`) |
| Orchestration gates | Gate API for attach approval (operator mode) |
| Event handlers | `on: event:` in `handlers.yaml` + `murrmure_emit_event` |
| First-run wizard | `mrmr setup`; granular `space init/link/apply`; `mrmr connection create` |
| Named-space first-run | `mrmr setup --yes --json` (creates no agent credential) |
| Agent MCP | `murrmure_resolve_step`, `murrmure_wait_for_run`, `murrmure_list_handlers` |
| Split skills | `mrmr skill install --variant agent\|developer\|all` |
| Personas | `.mrmr/space/personas.yaml` ads; `murrmure_list_personas` |
| Meeting step | `meeting:` facet; close resolves the step |
| Meeting Transcript | `/sessions/:id` Transcript (shell, not a View) |
| Meeting start (shell) | Header **Meetings** + **+** — list / convene (`POST /v1/meetings`) |
| Meeting resume | Closed room **Resume** → `POST /v1/sessions/{id}/meeting/resume` (same `ses_*` + `ptc_*`) |
| Meeting seat continuity | Persistent `shell_spawn` PTY starts once on convene; later turns write into that PTY after idle; close ends the process; resume starts a replacement process for that seat |
| Human-chair talk | Transcript composer to selected/all seats; Hub stamps `{ human: true }` |
| Meeting timing | Message timestamps, Hub delivery latency, and reply latency |
| Meeting MCP | `murrmure_list_invitable_spaces`, `murrmure_list_personas`, `murrmure_start_meeting`, `murrmure_meeting_transcript` |
| Headless convene | `mrmr meeting start` / `murrmure_start_meeting` |
| Directive MCP | `murrmure_list_directive_eligible`, `murrmure_start_directive` (`hub:admin`) |

See [Creating flows](./creating-flows) and [Quick start](./quick-start).
