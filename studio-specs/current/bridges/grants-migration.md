# Connection authorization bridge — internal grants → public connections

Hub persistence and wire compatibility may retain grant rows, but the public
local lifecycle is **connection**. A connection is authorization for one
machine/trust boundary, not an agent entity.

The default profile `local-tools/v1` is fixed to `space:read`,
`flow:read`, `flow:run`, and `step:resolve`. `event:emit` and `journal:read`
are not defaults. The removed `action:invoke` / `gate:resolve` capabilities and
their MCP paths (removed public invoke MCP tool, gate tools) are absent — action
execution is internal dispatch only and gate approval uses `flow:run`.

## Mapping table

| v1 scope | v2 capabilities |
|----------|-----------------|
| `space:read` | `space:read` |
| `space:enter` | `space:enter` |
| `space:admin` | `hub:admin`, `space:read`, `space:write`, `space:enter` |
| `state:transition` | `flow:run` |
| `event:read` | `journal:read` |
| `event:emit` | `event:emit` |
| `flow:install` | `space:write`, `flow:read` |
| `trigger:register` | `space:write` |
| `blob:read` | `space:read` |
| `blob:write` | `space:write` |

Native v2 capabilities: `space:read`, `space:write`, `space:enter`, `flow:read`, `flow:run`, `step:resolve`, `event:emit`, `journal:read`, `blob:read`, `blob:write`, `memory:read`, `memory:write`, `executor:poll`, `hub:admin`.

`memory:read` / `memory:write` are grantable now. When the memory child is
connected, Hub merges bare tools `retain`, `recall`, `reflect`, `recent`,
`retire` into the agent catalog. `local-tools/v1` does not include the caps.

Legacy v1 `blob:*` scopes still map as above. New grants may mint `blob:write`
directly so a meeting seat can `murrmure_put_artifact` without `space:write`.

## MCP tool ↔ capability

| MCP tool | Required capability / v1 scope |
|----------|-------------------------------|
| `murrmure_resolve_step` | `step:resolve` |
| `murrmure_emit_event` | `event:emit` (v1 `event:emit` scope) |
| `murrmure_put_artifact` | `blob:write` (or `space:write`) |
| `murrmure_get_artifact` | `space:read` + artifact ACL |
| `murrmure_create_run` | `flow:run` |
| `murrmure_list_directive_eligible` | `hub:admin` |
| `murrmure_start_directive` | `hub:admin` |

## API

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/grants` | Mint grant with `capabilities[]` (or legacy `scopes[]`) |
| `GET /v1/grants?space_id=` | List grants with resolved capabilities |
| `DELETE /v1/grants/{id}?space_id=` | Revoke grant |

Space-scoped routes remain: `POST /v1/spaces/{id}/grants` (phase 02).

## Conformance rules

- Grant without `flow:run` **cannot** start a flow run, resolve orchestration gates, or cancel runs.
- Grant without `step:resolve` **cannot** resolve flow steps (`murrmure_resolve_step`, `mrmr step resolve`).
- v1 `event:emit` scope satisfies `murrmure_emit_event` catalog visibility (effective `event:emit`).
- `flow_acl` (package ids) still restricts MCP tool catalog for installed flows.

## Public CLI and local storage

```bash
mrmr connection create --space spc_…
mrmr connection grant --space spc_…   # checklist / --capabilities for event:emit etc.
mrmr connection activate con_… --space spc_…
```

Creation auto-activates. Legacy grant lifecycle commands, legacy agent pairing commands, and the dedicated onboard command have no aliases. Local credentials exist
only in the OS store keyed by Hub + connection ID. Generated descriptors,
activation state, files, logs, arguments, and normal environment guidance carry
IDs only.

`connection grant` mints with an explicit capability checklist (or
`--capabilities`). When the set differs from `local-tools/v1`, the request omits
`profile` so the Hub does not force the fixed least-privilege set.

Setup connections are space-wide. Advanced `--flow-acl` accepts only canonical
flow identities already applied to the target space; unknown/future aliases are
rejected.

Implementation: `packages/hub-core/src/grants/migrate.ts`.
