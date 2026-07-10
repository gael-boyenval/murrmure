# Known gaps (Murrmure v2)

**Last updated:** 2026-07-09

Murrmure v2 core (`.mrmr/` space directory, session/run, **handlers + contract_keys**, unified step contracts v2.2, step outputs, flow scaffold, **ViewCanvasHost** at human steps) is **shipped**. This page records **backlog symptom status** (B1–B10) and **what works today**.

---

## Backlog symptoms (B1–B10)

All phase 01–10 backlog symptoms are **closed** in the current build. There are no open B-items.

| ID | Symptom | Status |
|----|---------|--------|
| B1 | Checkpoint/gate steps don't run | Closed (phase 03; superseded by step contracts VS-8) |
| B2 | Step outputs empty (`steps.*` templates) | Closed (phase 03) |
| B3 | `MURRMURE_INPUT` missing on shell_spawn | Closed (phase 03) |
| B4 | No full canvas at checkpoints | Closed (phase 05) |
| B5 | Apply doesn't lint capabilities | Closed (phase 01) |
| B6 | No `space flow init` | Closed (phase 04) |
| B7 | Skill fragmented (`murrmure-flow`) | Closed (phase 07; split `murrmure-agent` + `murrmure-developer`) |
| B8 | No setup wizard | Closed (phase 08) |
| B9 | No view author SDK (stub HTML only) | Closed (phase 02) |
| B10 | No multi-round review loop in v2 | Closed (phases 03 + 06 + VS-7 nested) |

Intentionally deferred product scope (not bugs) lives in the plan [deferred spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/product/deferred.md).

---

## What works today

| Feature | Command / surface |
|---------|-------------------|
| Index flows + handlers | `mrmr space apply` (lint warnings; `--strict`) |
| Scaffold flows | `mrmr space flow init <id> --template hello-gate\|hello-invoke` |
| Scaffold views | `mrmr space view init <id>` |
| Run flows (step contracts) | Shell **Run**, `mrmr flow run` |
| Human steps | `presentation:` + **`murrmure_resolve_step`** via ViewCanvasHost |
| Custom view canvas | **ViewCanvasHost** at `awaiting_human` steps |
| View dev loop | `mrmr view dev <id>` → Desktop dev route + fixture tabs |
| Step output templates | `steps.*` template syntax in handler params |
| `shell_spawn` env | `MURRMURE_INPUT`, `MURRMURE_PROMPT`, `MURRMURE_STEP_CONTRACT`, run/session/step ids |
| Step contract injection | `active-step-contract.json`, `&#123;&#123;murrmure.agentStepContract&#125;&#125;` |
| Handler dispatch | `.mrmr/space/handlers.yaml` + `contract_keys` |
| Shell step resolve | `mrmr step resolve` (`complete: cli`) |
| Orchestration gates | Gate API for attach approval (operator mode) |
| Event handlers | `on: event:` in `handlers.yaml` + `murrmure_emit_event` |
| First-run wizard | `mrmr setup`, `mrmr space onboard` |
| Agent onboarding | `mrmr setup --yes --json` |
| Agent MCP | `murrmure_resolve_step`, `murrmure_wait_for_run`, `murrmure_list_handlers` |
| Split skills | `mrmr skill install --variant agent\|developer\|all` |

See [Creating flows](./creating-flows) and [Quick start](./quick-start).
