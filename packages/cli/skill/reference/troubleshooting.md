# Troubleshooting

Symptom → likely cause → fix. Read [known-gaps.md](known-gaps.md) before assuming a feature is broken vs not shipped.

## Index & apply

| Symptom | Cause | Fix |
|---------|-------|-----|
| Flow not in space status | Not applied | `mrmr space apply --strict` |
| `UNSUPPORTED_STEP_KIND` | Step kind not in engine dispatch | Use step contracts (`branches` + `executor` / `presentation`) |
| `LEGACY_STEP_KIND` | `invoke:` / `checkpoint:` in manifest | Migrate to step contracts v2.2 |
| `CHECKPOINT_VIEW_DIST_MISSING` | View not built | `npm run build` in view package, re-apply |
| Apply succeeds but run fails | Stale digest | Re-apply; confirm digest in `mrmr space status` |

## Runs & checkpoints

| Symptom | Cause | Fix |
|---------|-------|-----|
| Run stuck `input-required` | Pending human step | Human resolves in view or agent uses `murrmure_resolve_step` |
| View blank / fallback panel | Missing dist or wrong view_ref | Build view; check apply warnings |
| Wrong routing after resolve | `on_resolve` mismatch | Match `when`/`values` to view `submit()` shape |
| Template unresolved | Referenced step not complete | Ensure step id exists and completed before consumer |

## MCP & grants

| Symptom | Cause | Fix |
|---------|-------|-----|
| `TOOL_NOT_AUTHORIZED` | Missing scope or wrong space | Mint grant with required capabilities |
| Tool missing after apply | Stale MCP session | Reload IDE / reconnect MCP |
| 401/403 | Revoked token | `mrmr grant mint` with new token |
| Works in Desktop, fails in agent | Desktop bootstrap ≠ MCP grant | Use minted `tok_…` in MCP env |

## Executors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `EXECUTOR_UNAVAILABLE` | MCP not connected or shell path wrong | Check executor preflight; verify space link |
| Script missing env | Not using injected vars | Read `MURRMURE_*` from [actions-executors.md](actions-executors.md) |

## Orchestration attach

| Symptom | Cause | Fix |
|---------|-------|-----|
| Attach rejected | Invalid manifest schema | Same schema as `flow.manifest.yaml` |
| No bind after approve | Human rejected validate gate | Re-attach or use durable `mrmr space apply` |

## CLI smoke

```bash
mrmr doctor --json
mrmr space status --space spc_… --json
mrmr skill version --json
```

See [cli.md](cli.md), [grants.md](grants.md), [mcp.md](mcp.md).
