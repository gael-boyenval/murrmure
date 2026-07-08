# Part 9 — Troubleshooting

## Intake

| Symptom | Fix |
|---------|-----|
| File picker empty after select | Browser blocked read; try smaller file |
| Run starts without spec | Intake must call `submit` with non-empty `spec_markdown` |

## Write spec

| Symptom | Fix |
|---------|-----|
| No `specs/current/` after step | Check `feature_write_spec` prompt params; agent must follow `agent.md` |
| Wrong file content | Re-attach correct file at intake |

## Build

| Symptom | Fix |
|---------|-----|
| Agent idle | `cursor agent` on PATH? MCP connected with `action:invoke`? |
| Flow stuck before review | Agent must call **`murrmure_complete_action`** with `step_id: "build"` |
| New subprocess each feedback round | Wrong pattern — build skill should **`wait_for_gate`** in same session, not exit |
| `complete_action` 409 | Step not in `working` — check run step memo in journal |

## Review

| Symptom | Fix |
|---------|-----|
| Blank iframe | Agent must call `complete_action` with a working URL in `result`; check dev server |
| Shell form instead of view | Rebuild view `dist/`; `mrmr space apply --strict` |
| Feedback ignored | Review submit must include `comments` array; agent reads via `wait_for_gate` payload |

## Archive / commit

| Symptom | Fix |
|---------|-----|
| Spec still in `current/` after run | Archive step failed — check journal for `feature_archive` |
| No commit JSON | Update `agent.md` commit section |
| Duplicate in archive | Append timestamp on collision — update `agent.md` |

## MCP / apply

| Symptom | Fix |
|---------|-----|
| `TOOL_NOT_AUTHORIZED` | Re-mint grant with `action:invoke` + `space:read`; reload MCP |
| `murrmure_complete_action` missing | Grant lacks `action:invoke`; reload MCP after mint |
| Apply strict fails | Build both views; check four action names match manifest |
| Flow missing on Desktop | Wrong space linked |

See also [Troubleshooting](../../troubleshooting), [Review workflow](../../review-workflow), [MCP tools reference](../../../reference/mcp-tools).

## Back to overview

[Tutorial 1 overview](./)
