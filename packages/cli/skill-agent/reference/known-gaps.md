# Known gaps (agents)

Read this before assuming declarative flows fully work. Normative backlog: [studio-specs/plans/product/plan/index.md](../../../../studio-specs/plans/product/plan/index.md).

**Note:** B1–B10 here are **user-facing symptoms**. Backlog **phases** in [index.md](../../../../studio-specs/plans/product/plan/index.md) are the normative spec.

## Human docs

[apps/docs/guide/known-gaps.md](../../../../apps/docs/guide/known-gaps.md) — must stay in sync (phase **10** CI gate).

---

Murrmure v2 core (`.mrmr/` space directory, session/run, **handlers + contract_keys**, unified step contracts v2.2, step outputs, flow scaffold, **ViewCanvasHost** at human steps) is **shipped**. Remaining items are **user-visible symptoms** — not the same numbering as backlog phases 01–08.

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
| Step contract injection | `active-step-contract.json`, `{{murrmure.agentStepContract}}` |
| Handler dispatch | `.mrmr/space/handlers.yaml` + `contract_keys` |
| Shell step resolve | `mrmr step resolve` (`complete: cli`) |
| Orchestration gates | Gate API for attach approval (operator mode) |
| Event handlers | `on: event:` in `handlers.yaml` + `murrmure_emit_event` |
| First-run wizard | `mrmr setup`, `mrmr space onboard` |
| Named-space onboarding | `mrmr setup --yes --json` (creates no agent credential) |
| Agent MCP | `murrmure_resolve_step`, `murrmure_wait_for_run`, `murrmure_list_handlers` |
| Split skills | `mrmr skill install --variant agent\|developer\|all` |

See [Creating flows](./creating-flows) and [Quick start](./quick-start).
