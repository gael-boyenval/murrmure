# Part 5 — Troubleshooting

Use this page when pending states do not resolve as expected.

## Fast diagnostics matrix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `open_brief` / `patch_section` missing in orchestrator | `team-brief` not live, or ACL missing | Re-open `Configure -> Orchestrator -> Capabilities`, run `Validate/Test/Promote/Apply live`, verify orchestrator grant ACL includes `team-brief`, reload MCP |
| Brief stuck in `gathering` | Orchestrator never sent `transition` event `context_ready` | Ask orchestrator to call `transition` with `event: "context_ready"` |
| Publish button disabled | Brief not in `pending_publish` | Ask orchestrator to `transition` with `event: "request_publish"` |
| `wait_for_publish` stays pending forever | Human publish step not completed | Open Runtime brief page and click Publish |
| `brief.published` not in audit | Publish transition rejected by gate/role | Check publisher role on human token and `required_publisher_role` config |
| Trigger delivery row is `failed` | Dev session offline, harness mismatch, or policy failure | Open dev Cursor session, reload MCP, verify trigger target space is `spc_dev`, republish or test-fire trigger |
| Trigger never appears in delivery log | Wrong trigger source/event filter | Trigger source must be `spc_orchestrator` and event must be exact `brief.published` |
| `query_ask` returns `QUERY_POLICY_DENIED` | Missing orchestrator inbound allowlist rule | Add `spc_dev` + `brief_summary@1` under orchestrator `query_policy.inbound_allowlist` |
| Dev got wake but no summary | Wrong `query_type` or missing `brief_key` in params | Use `query_type: "brief_summary@1"` and pass wake `brief_key` |

## Pending/failed/resolved recovery order

When a run stalls, use this order:

1. Resolve brief state first (`pending_publish` -> `published`).
2. Resolve trigger delivery second (`pending`/`failed` -> `resolved`).
3. Resolve cross-space fetch third (`query_ask` success).
4. Run local dev write last (outside Studio).

## Safe rerun strategy

If the run partially failed:

1. Keep the same brief instance.
2. Fix root cause (policy/session/trigger mapping).
3. Republish new version (or recreate brief if needed).
4. Confirm one successful `mcp_wake` delivery row.

## Related

- [Tutorial index](./index)
- [Run workflow](./04-run-workflow)
- [Legacy bundled guide](/guide/multi-agent-feature-spec)
- [MCP tools reference](/reference/mcp-tools)
