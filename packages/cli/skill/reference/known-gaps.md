# Known gaps (agents)

Read this before assuming declarative flows fully work. Normative backlog: [studio-specs/plans/product/plan/index.md](../../../../studio-specs/plans/product/plan/index.md).

**Note:** B1–B10 here are **user-facing symptoms**. Backlog **phases** in [index.md](../../../../studio-specs/plans/product/plan/index.md) are the normative spec.

## Human docs

[apps/docs/guide/known-gaps.md](../../../../apps/docs/guide/known-gaps.md) — must stay in sync (phase **10** CI gate).

---

Murrmure v2 core (space directory, session/run, invoke, **unified step contracts v2.2**, step outputs, flow scaffold, **ViewCanvasHost** at human steps) is **shipped**. Remaining items are **user-visible symptoms** — not the same numbering as backlog phases 01–08.

## What works today

| Feature | Command / surface |
|---------|-------------------|
| Index flows | `mrmr space apply` (lint warnings; `--strict`) |
| Scaffold flows | `mrmr space flow init <id> --template hello-gate\|hello-invoke` |
| Scaffold views | `mrmr space view init <id>` |
| Run flows (step contracts) | Shell **Run**, `mrmr flow run` |
| Human steps | `presentation:` + **`murrmure_resolve_step`** via ViewCanvasHost |
| Custom view canvas | **ViewCanvasHost** at `awaiting_human` steps |
| View dev loop | `mrmr view dev <id>` → Desktop dev route + fixture tabs |
| Step output templates | `steps.*` template syntax in executor params |
| `shell_spawn` env | `MURRMURE_INPUT`, `MURRMURE_STEP_CONTRACT`, run/session/step ids |
| Step contract injection | `active-step-contract.json`, `{{murrmure.agentStepContract}}` |
| Orchestration gates | Gate API for attach approval (operator mode) |
| Hooks | `murrmure/hooks.yaml` + apply |
| First-run wizard | `mrmr setup`, `mrmr space onboard` |
| Agent onboarding | `mrmr setup --yes --json` |
| Agent MCP | `murrmure_invoke_action`, `murrmure_resolve_step`, `murrmure_wait_for_run` |

See [Creating flows](./creating-flows) and [Quick start](./quick-start).
