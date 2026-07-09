# Wizards — human vs agent paths

Interactive CLI wizards are the human front door. Agents use equivalent commands with `--json` (never Clack).

## Onboarding

| Human wizard | Agent equivalent |
|--------------|------------------|
| `mrmr setup` | `mrmr login` → `mrmr space init --with-skill` → `mrmr space link --create` → `mrmr space apply` → `mrmr grant mint --capabilities …` |
| `mrmr space onboard` | `mrmr space link --path . --space spc_…` → `mrmr space apply` → `mrmr space status --json` |
| `mrmr space setup` | Hub-focused subset of setup (connect, create spaces, init/link/apply, grant) |

**Non-interactive (CI):**

```bash
mrmr setup --yes --json
mrmr space onboard --yes --json
```

**Plan only (no execution):**

```bash
mrmr setup --json          # prints step plan, exits
mrmr space onboard --json  # prints step plan, exits
```

Grant capabilities minted by setup (rev-1):

`space:read,flow:run,flow:read,action:invoke,step:resolve,journal:read`

## Space scaffold

| Human | Agent |
|-------|-------|
| Desktop **New space** UI | `mrmr space link --path . --create` (requires `space:admin`) |
| `mrmr setup` skill step | `mrmr skill install` or `mrmr space init --with-skill` |

## Flow & view scaffold

| Human | Agent |
|-------|-------|
| Tutorial walkthrough | `mrmr space flow init <id> --template hello-gate` |
| View designer dev loop | `mrmr space view init <id>` → `mrmr view dev <id>` |

## Run & review

| Human | Agent |
|-------|-------|
| Shell **Run** button | `mrmr flow run flw_<name> --input '{}' --json` |
| ViewCanvasHost approve/reject | Human resolves via view `submit()` → `resolve_step` (agent uses `murrmure_wait_for_run`) |
| Gate inbox (operator) | HTTP `POST /v1/gates/{id}/resolve` for orchestration attach |

**North star:** onboarding ends at **Run** → **ViewCanvasHost** custom view at human steps.

## MCP connection

| Human | Agent |
|-------|-------|
| `mrmr setup` grant step | Paste snippet into `.cursor/mcp.json` |
| Desktop / CLI snippet | Use `command: "murrmure-mcp"` + `MURRMURE_HUB_TOKEN` env ref |
| Reload Desktop | Reload IDE after MCP config change |

Agents should **never** assume curl or raw HTTP for normal workflows — use MCP tools. Humans doing workflow work use **custom views**, not shell gate forms, when a checkpoint view is specified.

See [cli.md](cli.md), [mcp.md](mcp.md), [views.md](views.md).
