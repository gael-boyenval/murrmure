# Part 9 — Troubleshooting

Common issues when running Tutorial 1 with **handlers**, **contract keys**, and
resolver-agnostic step contracts.

## Setup & apply

| Symptom | Fix |
|---------|-----|
| `LEGACY_STEP_KIND` on apply | Manifest still uses `invoke:` / `checkpoint:` — migrate to resolver-agnostic steps and bind execution in the space |
| Strict apply fails on `executor.action` | Remove all `executor: { action: … }` blocks from flow manifests; wire execution in `.mrmr/space/handlers.yaml` |
| Step has no resolver | Bind one qualified `step.opened::{flow}.{step}` handler, or leave it intentionally open for an authorized external client |
| Missing prompt context | Add the required `contract_keys`; these scope the prompt but do not dispatch |
| `HANDLER_RESOLVER_CONFLICT` | Two handlers bind the same qualified opened step — keep one resolver |
| Strict apply fails on unknown token | Fix `&#123;&#123;murrmure.*&#125;&#125;` typo; see [step-contract bridge](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/bridges/step-contract.md) |
| View not in index | Build view (`npm run build` in view dir) then `mrmr space apply --strict` |
| `HANDLER_LEGACY_ACTIONS` | Delete or ignore `actions.yaml` prompt triggers; use `handlers.yaml` only |

## Handler dispatch

| Symptom | Fix |
|---------|-----|
| Agent step opens but nothing runs | Check its exact `on: step.opened::{flow}.{qualified_step}` binding |
| Handler runs but step never completes | `complete: explicit` requires `murrmure_resolve_step` or `mrmr step resolve` |
| `HANDLER_COMPLETE_CLI_NO_RESOLVE` | Handler uses `complete: cli` but `command` chain omits `mrmr step resolve` |

## Build loop

| Symptom | Fix |
|---------|-----|
| Flow stuck before review | Check that parent resumed after build-loop, then called **`murrmure_open_child_step`** for **`build.review`** |
| New subprocess each feedback round | Expected — every parent resume and child open is a fresh exclusive assignment |
| `resolve_step` 409 | Step not active or run terminal — check step memo + `active-step-contract.json` |
| Yielded parent keeps mutating | Stop that process; its assignment was revoked when the child opened |

## Review view

| Symptom | Fix |
|---------|-----|
| Blank iframe | Agent must resolve **`build.build-loop`** with a working URL in `payload`; check dev server |
| `token_denied` in iframe | Re-link space; ensure view assets use relative paths |
| Feedback ignored | Review submit must include `comments` array; agent reads via **`murrmure_get_run`** |

## Timeouts

The parent process does not remain alive during human review. The parent is
`yielded`; only the review View assignment is active.

## MCP & skills

| Symptom | Fix |
|---------|-----|
| Tool missing from catalog | Grant needs matching capability (`step:resolve`, `action:invoke`, `space:read`) |
| Stale contract in long session | Re-read `.mrmr/dev/runs/{run_id}/active-step-contract.json` |
| `SKILL_AGENT_MISSING` | `mrmr skill install --variant agent` |
| `SKILL_DEVELOPER_MISSING` | `mrmr skill install --variant developer` |
| Legacy monolith skill | `mrmr skill install --variant all` |

## Reference

Re-run `mrmr space doctor` and `mrmr space apply --strict` — both should pass when your tree matches the tutorial parts.

## Next

Back to [Tutorial overview](./index.md)
