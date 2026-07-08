# Part 9 — Troubleshooting

Common issues when running Tutorial 1 with **step contracts v2.2**.

## Setup & apply

| Symptom | Fix |
|---------|-----|
| `LEGACY_STEP_KIND` on apply | Manifest still uses `invoke:` / `checkpoint:` — migrate to `branches` + `executor` / `presentation` |
| Strict apply fails on unknown token | Fix `{{murrmure.*}}` typo; see [step-contract bridge](../../../../studio-specs/current/bridges/step-contract.md) |
| View not in index | Build view (`npm run build` in view dir) then `mrmr space apply --strict` |

## Build loop

| Symptom | Fix |
|---------|-----|
| Flow stuck before review | Agent must **`murrmure_resolve_step`** on **`build.build-loop`** with `preview_url` |
| New subprocess each feedback round | Wrong pattern — build skill should **`wait_for_run`** in same session, not exit |
| `resolve_step` 409 | Step not active or run terminal — check step memo + `active-step-contract.json` |
| Agent resolves review | Wrong — humans resolve **`build.review`** via view; agent only resolves **`build.build-loop`** |

## Review view

| Symptom | Fix |
|---------|-----|
| Blank iframe | Agent must resolve **`build.build-loop`** with a working URL in `payload`; check dev server |
| `token_denied` in iframe | Re-link space; ensure view assets use relative paths |
| Feedback ignored | Review submit must include `comments` array; agent reads via **`murrmure_get_run`** |

## Timeouts

Parent executor **`timeout_ms`** excludes human **`awaiting_human`** time — build should not fail while humans review.

## MCP

| Symptom | Fix |
|---------|-----|
| Tool missing from catalog | Grant needs matching capability (`step:resolve`, `action:invoke`, `space:read`) |
| Stale contract in long session | Re-read `.mrmr.temp/runs/{run_id}/active-step-contract.json` |

## Next

Back to [Tutorial overview](./index.md)
