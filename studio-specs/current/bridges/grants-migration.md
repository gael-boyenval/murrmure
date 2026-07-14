# Connection authorization bridge — internal grants → public connections

Hub persistence and wire compatibility may retain grant rows, but the public
local lifecycle is **connection**. A connection is authorization for one
machine/trust boundary, not an agent entity.

The default profile `tutorial-builder/v1` is fixed to `space:read`,
`flow:read`, `flow:run`, and `step:resolve`. `action:invoke`, `gate:resolve`,
and `journal:read` are not defaults. Legacy action/gate MCP paths are absent.

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

## Public CLI and local storage

```bash
mrmr connection create --space spc_…
mrmr connection activate con_… --space spc_…
```

Creation auto-activates. `grant mint`, `grant use`, `agent connect`,
`agent activate`, and `space onboard` have no aliases. Local credentials exist
only in the OS store keyed by Hub + connection ID. Generated descriptors,
activation state, files, logs, arguments, and normal environment guidance carry
IDs only.

Setup connections are space-wide. Advanced `--flow-acl` accepts only canonical
flow identities already applied to the target space; unknown/future aliases are
rejected.

Implementation: `packages/hub-core/src/grants/migrate.ts`.
