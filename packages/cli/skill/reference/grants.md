# Grants & capabilities (rev-1 §9.1)

Murrmure v2 uses a **single capability model**. Grants are minted via CLI (Configure UI retired in phase 06).

## Mint a grant

```bash
mrmr grant mint \
  --space spc_ui_sandbox \
  --label "cursor-agent" \
  --capabilities space:read,flow:run,action:invoke \
  --json
```

Alias: `mrmr space grant mint` (same flags). `--capabilities` is an alias for `--scopes`.

## Common capabilities

| Capability | Allows |
|------------|--------|
| `space:read` | Sidebar, space home, session visibility |
| `space:write` | `mrmr space apply`, link bindings |
| `space:enter` | MCP executor attach |
| `flow:read` | Sanitized flow expand preview |
| `flow:run` | Start runs / hook `start_flow` |
| `action:invoke` | Direct action invoke |
| `gate:resolve` | Approve/reject gates |
| `journal:read` | Logs / journal query |
| `executor:poll` | External worker poll API (`--harness` = executor id) |
| `hub:admin` | Breakglass hub operations |

## List & revoke

```bash
mrmr grant list --space spc_ui_sandbox
mrmr grant revoke grt_… --space spc_ui_sandbox
```

Requires `space:admin` on the target space.

## MCP stubs

During v2 migration, hub exposes stub tools: `murrmure_grant_mint`, `murrmure_space_status`, `murrmure_apply_space`. Prefer CLI for grant mint in automation scripts.
