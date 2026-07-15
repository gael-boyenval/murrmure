# Part 5 — Troubleshooting

Use this page when pending states do not resolve as expected.

## Fast diagnostics matrix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `team-brief` not in status | Apply failed strict lint | Run `mrmr space doctor --strict`; fix manifest/handlers |
| **open** stuck pending | No handler for `team-brief.open` | Add step.opened handler; re-apply |
| **publish** never resolves | Human token missing scope | Grant human operator access; resolve via Desktop |
| `brief.published` not in journal | Publish branch not taken | Confirm human resolved with `published` branch |
| Handler delivery failed | Dev session offline or handler lint error | `murrmure_list_handlers`; check journal for `handler:brief-published-wake` |
| Handler never appears | Event type mismatch | Handler `on.event.type` must be exact `brief.published` |
| `query_ask` returns denied | Missing orchestrator inbound allowlist | Add dev space + query type under orchestrator policy |
| Dev got wake but no summary | Wrong `query_type` or missing params | Use documented cross-space query type and brief key |

## Pending/failed/resolved recovery order

When a run stalls, use this order:

1. Resolve brief state first (**publish** → `published` branch).
2. Resolve handler delivery second (journal shows handler terminal state).
3. Resolve cross-space fetch third (`query_ask` success).
4. Run local dev write last.

## Safe rerun strategy

If the run partially failed:

1. Keep the same brief instance when possible.
2. Fix root cause (policy/session/handler mapping).
3. Republish (or recreate brief if needed).
4. Confirm one successful handler delivery in journal.

## Related

- [Tutorial index](./index)
- [Run workflow](./04-run-workflow)
- [Handlers bridge spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/bridges/handlers.md)
- [MCP tools reference](/reference/mcp-tools)
