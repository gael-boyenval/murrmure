# Known gaps (agents)

Read this before assuming declarative flows fully work. Normative backlog: [studio-specs/plans/product/plan/index.md](../../../../studio-specs/plans/product/plan/index.md).

**Note:** B1–B10 here are **user-facing symptoms**. Backlog **phases** in [index.md](../../../../studio-specs/plans/product/plan/index.md) are the normative spec.

## Human docs

[apps/docs/guide/known-gaps.md](../../../../apps/docs/guide/known-gaps.md) — must stay in sync (phase **10** CI gate).

---

Murrmure v2 core (space directory, session/run, invoke, gates API, flow invoke + checkpoint dispatch, step outputs, flow scaffold, **ViewCanvasHost** at checkpoint steps) is **shipped**. Remaining items are **user-visible symptoms** — not the same numbering as backlog phases 01–08.

## What works today

| Feature | Command / surface |
|---------|-------------------|
| Index flows | `mrmr space apply` (lint warnings; `--strict`) |
| Scaffold flows | `mrmr space flow init <id> --template hello-gate\|hello-invoke` |
| Scaffold views | `mrmr space view init <id>` |
| Run flows (invoke + checkpoint steps) | Shell **Run**, `mrmr flow run` |
| Declarative checkpoints | `checkpoint:` steps pause run (`input-required`), resolve via `disposition` + `output` JSON |
| Custom view canvas | **ViewCanvasHost** at pending checkpoint with `view_ref` |
| View dev loop | `mrmr view dev <id>` → Desktop dev route + fixture tabs |
| Step output templates | `steps.*` template syntax in invoke params after action completes |
| `shell_spawn` env | `MURRMURE_INPUT`, `MURRMURE_INVOKE_PARAMS`, run/session/step ids |
| Gates (imperative) | Gate API, orchestration attach, shell resolve panel (fallback) |
| Hooks | `murrmure/hooks.yaml` + apply |
| First-run wizard | `mrmr setup`, `mrmr space onboard` |
| Agent onboarding | `mrmr setup --yes --json` |
| Agent MCP | `murrmure_invoke_action`, wait/resolve gate/run |

See [flow-authoring.md](flow-authoring.md), [views.md](views.md), [gates.md](gates.md).