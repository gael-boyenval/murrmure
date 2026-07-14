# Part 9 — Troubleshooting

::: warning Retired v2 handler model
This page troubleshoots the **retired v2 handler model** (`contract_keys` dispatch, bare `on: step.opened`, `kill_on`). These are **rejected by current strict validation**. See **[Tutorial 1a (v3)](../01-local-preview-review-v3/)** and [Space handlers](../../space-handlers.md).
:::

Common issues when running Tutorial 1 with **handlers**, **contract keys**, and **v2.2 step contracts**.

## Setup & apply

| Symptom | Fix |
|---------|-----|
| `LEGACY_STEP_KIND` on apply | Manifest still uses `invoke:` / `checkpoint:` — migrate to `branches` + `role` / `presentation` |
| Strict apply fails on `executor.action` | Remove all `executor: { action: … }` blocks from flow manifests; wire execution in `.mrmr/space/handlers.yaml` |
| `HANDLER_MISSING` / `STEP_UNCOVERED` | Agent step has no handler — add `contract_keys` matching `.mrmr/dev/contracts/contract-keys.json` |
| Missing `contract_keys` on handler | Every `on: step.opened` handler needs at least one key; run `mrmr space doctor` |
| `HANDLER_KEY_CONFLICT` | Two handlers claim the same key — keep one handler per key |
| Strict apply fails on unknown token | Fix `&#123;&#123;murrmure.*&#125;&#125;` typo; see [step-contract bridge](../../../../studio-specs/current/bridges/step-contract.md) |
| View not in index | Build view (`npm run build` in view dir) then `mrmr space apply --strict` |
| `HANDLER_LEGACY_ACTIONS` | Delete or ignore `actions.yaml` prompt triggers; use `handlers.yaml` only |

## Handler dispatch

| Symptom | Fix |
|---------|-----|
| Agent step opens but nothing runs | Check handler `on: step.opened` and `contract_keys` match the step key |
| Handler runs but step never completes | `complete: explicit` requires `murrmure_resolve_step` or `mrmr step resolve` |
| `HANDLER_COMPLETE_CLI_NO_RESOLVE` | Handler uses `complete: cli` but `command` chain omits `mrmr step resolve` |

## Build loop

| Symptom | Fix |
|---------|-----|
| Flow stuck before review | Agent must **`murrmure_resolve_step`** on **`build.build-loop`** with `preview_url` |
| New subprocess each feedback round | Wrong pattern — build handler should **`wait_for_run`** in same session (`kill_on: step.resolved`), not exit |
| `resolve_step` 409 | Step not active or run terminal — check step memo + `active-step-contract.json` |
| Agent resolves review | Wrong — humans resolve **`build.review`** via view; agent only resolves **`build.build-loop`** |

## Review view

| Symptom | Fix |
|---------|-----|
| Blank iframe | Agent must resolve **`build.build-loop`** with a working URL in `payload`; check dev server |
| `token_denied` in iframe | Re-link space; ensure view assets use relative paths |
| Feedback ignored | Review submit must include `comments` array; agent reads via **`murrmure_get_run`** |

## Timeouts

Parent handler **`timeout_ms`** excludes human **`awaiting_human`** time — build should not fail while humans review.

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
