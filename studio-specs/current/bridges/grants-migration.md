# Grants migration — v1 scopes → rev-1 capabilities

Murrmure v2 replaces the v1 **PLATFORM_SCOPES** ladder with a single **capability** model (rev-1 §9.1). During the shim period (phases 05–15), hub accepts both v1 scope tokens and v2 capability grants.

## Mapping table

| v1 scope | v2 capabilities |
|----------|-----------------|
| `space:read` | `space:read` |
| `space:enter` | `space:enter` |
| `space:admin` | `hub:admin`, `space:read`, `space:write`, `space:enter` |
| `state:transition` | `flow:run`, `action:invoke` |
| `event:read` | `journal:read` |
| `event:emit` | `action:invoke` |
| `flow:install` | `space:write`, `flow:read` |
| `trigger:register` | `space:write` |
| `blob:read` | `space:read` |
| `blob:write` | `space:write` |

Native v2 capabilities: `space:read`, `space:write`, `space:enter`, `flow:read`, `flow:run`, `action:invoke`, `step:resolve`, `gate:resolve`, `journal:read`, `executor:poll`, `hub:admin`.

## MCP tool ↔ capability

| MCP tool | Required capability / v1 scope |
|----------|-------------------------------|
| `murrmure_resolve_step` | `step:resolve` |
| `murrmure_emit_event` | v1 `event:emit` scope (maps to `action:invoke`) |
| `murrmure_invoke_action` | `action:invoke` |
| `murrmure_create_run` | `flow:run` |

## API

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/grants` | Mint grant with `capabilities[]` (or legacy `scopes[]`) |
| `GET /v1/grants?space_id=` | List grants with resolved capabilities |
| `DELETE /v1/grants/{id}?space_id=` | Revoke grant |

Space-scoped routes remain: `POST /v1/spaces/{id}/grants` (phase 02).

## Conformance rules

- Grant without `flow:run` **cannot** start a flow run.
- Grant without `step:resolve` **cannot** resolve flow steps (`murrmure_resolve_step`, `mrmr step resolve`).
- Grant without `gate:resolve` **cannot** resolve gates or cancel runs.
- v1 `event:emit` scope satisfies `murrmure_emit_event` catalog visibility (effective `action:invoke`).
- `flow_acl` (package ids) still restricts MCP tool catalog for installed flows.

## CLI

```bash
mrmr grant mint --space spc_… --label agent --capabilities flow:run,action:invoke,step:resolve,journal:read
```

Implementation: `packages/hub-core/src/grants/migrate.ts`.
