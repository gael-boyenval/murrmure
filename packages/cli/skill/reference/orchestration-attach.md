# MCP orchestration attach (phase 10)

When an agent proposes a **one-off graph** for a session (not durable in `murrmure/flows/`), use MCP attach instead of `mrmr space apply`.

## When to use which path

| Goal | Path |
|------|------|
| Durable flow in repo | Edit `murrmure/flows/*/flow.manifest.yaml` → `mrmr space apply` |
| Ephemeral agent plan for one session | `murrmure_attach_orchestration` with `murrmure.flow.attach/v1` |

Both paths share the **same manifest schema** (`FlowManifestSchema`).

## Cursor dev scenario (§13.2)

1. Agent creates session: `murrmure_create_session`
2. Agent pushes graph: `murrmure_attach_orchestration` with 3-step manifest
3. Human opens shell **Needs you** — read-only flowchart + param shapes (no secret values)
4. Human approves → hub journals `mrmr.flow.attached`, binds digest, dispatches first step
5. Reject → journal only; run cancelled; no bind

## MCP tools

| Tool | Scope | HTTP |
|------|-------|------|
| `murrmure_attach_orchestration` | `flow:run` | `POST /v1/sessions/{id}/orchestration/attach` |
| `murrmure_get_run_graph` | `flow:read` | `GET /v1/runs/{id}/graph` |

Gate type: `orchestration.validate` · step id before bind: `orchestration:proposed`.

Breakglass (skip gate): `hub:admin` + `breakglass: true` on attach body — not for normal agents.

## Payload

```json
{
  "kind": "murrmure.flow.attach/v1",
  "manifest": {
    "apiVersion": "murrmure.flow/v1",
    "name": "agent-proposed",
    "start": { "manual": true },
    "steps": [ … ]
  }
}
```
