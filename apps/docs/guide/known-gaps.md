# Known gaps (Murrmure v2)

**Last updated:** 2026-07-03

Murrmure v2 core (space directory, session/run, invoke, gates API, flow invoke + checkpoint dispatch, step outputs, flow scaffold, **ViewCanvasHost** at checkpoint steps) is **shipped**. This page records **backlog symptom status** (B1–B10) and **what works today** — symptom IDs are not the same as backlog **phases** 01–10 in the [plan index](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/plans/product/plan/index.md).

---

## Backlog symptoms (B1–B10)

All phase 01–10 backlog symptoms are **closed** in the current build. There are no open B-items.

| ID | Symptom | Status |
|----|---------|--------|
| B1 | Checkpoint/gate steps don't run | Closed (phase 03) |
| B2 | Step outputs empty (`steps.*` templates) | Closed (phase 03) |
| B3 | `MURRMURE_INPUT` missing on shell_spawn | Closed (phase 03) |
| B4 | No full canvas at checkpoints | Closed (phase 05) |
| B5 | Apply doesn't lint capabilities | Closed (phase 01) |
| B6 | No `space flow init` | Closed (phase 04) |
| B7 | Skill fragmented (`murrmure-flow`) | Closed (phase 07) |
| B8 | No setup wizard | Closed (phase 08) |
| B9 | No view author SDK (stub HTML only) | Closed (phase 02) |
| B10 | No multi-round review loop in v2 | Closed (phases 03 + 06) |

Intentionally deferred product scope (not bugs) lives in the plan [deferred spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/product/deferred.md).

---

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

See [Creating flows](./creating-flows) and [Quick start](./quick-start).
