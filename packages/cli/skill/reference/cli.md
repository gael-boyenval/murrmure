# Murrmure CLI

## `mrmr flow` (FDK)

Run from the flow package directory unless noted.

| Command | Purpose |
|---------|---------|
| `init <id> [--dir path] [--from-example name] [--with-skill]` | Scaffold new package |
| `validate .` | Local manifest/contract/MCP checks |
| `build .` | Stage bundle + compile server/UI |
| `push --space <spc>` | Upload to hub → `draft` |
| `status .` | Read `.murrmure/.../.flow-push-state.json` |
| `list --space <spc>` | Installs in space |
| `validate --space <spc> --install <ins>` | Hub Lens A |
| `test --space <spc> --install <ins>` | Contract tests |
| `promote --space <spc> --install <ins>` | Approve for space |
| `apply --space <spc> --install <ins>` | Mount worker + MCP catalog |
| `rollback --space <spc> --install <ins>` | Roll back live mount |
| `dev . --space <spc> [--auto-apply]` | Watch loop |
| `dev . --sim [--port N]` | Offline simulator |
| `doctor` | Hub URL + token smoke check (**deprecated** — use `mrmr doctor`) |

Add `--json` for machine-readable output. **Default stdout is human-readable** (breaking change in CLI DX v1); scripts should pass `--json`.

### Environment

| Variable | Used for |
|----------|----------|
| `MURRMURE_HUB_URL` | Hub base (default `http://127.0.0.1:8787`) |
| `MURRMURE_TOKEN` / `MURRMURE_HUB_TOKEN` | Bearer token |
| `MURRMURE_SPACE_ID` | Default space in MCP/snippets |

### Push output (save these)

```json
{
  "install_id": "ins_…",
  "bundle_digest": "sha256:…",
  "next_steps": ["validate", "test", "promote", "apply"]
}
```

## `mrmr skill`

Install or refresh the agent skill in the current repo:

```bash
mrmr skill install          # → .cursor/skills/murrmure-flow/
mrmr skill update           # same, overwrite with latest package copy
mrmr skill version --json
mrmr skill install --dir /path/to/repo
```

Run from the **git root** (or flow monorepo root) so all agents in the project pick up the skill.

## Platform CLI (`@murrmure/cli`)

Auth, diagnostics, and operator helpers — prefer **MCP** for interactive agent loops.

### Auth

| Command | Purpose |
|---------|---------|
| `login [--open] [--hub-url <url>]` | Save hub URL + token to `~/.murrmure/credentials` |
| `logout [--yes]` | Remove saved credentials |
| `whoami [--json]` | Show actor, token, and per-space scopes |

Resolution order: flags → env → credentials file → `~/.murrmure/hubs/shared.json`.

### Doctor

| Command | Purpose |
|---------|---------|
| `doctor [--json]` | Hub health, auth source, scope capability summary, dev-kit skew |

`mrmr flow doctor` is a **deprecated alias** — prints stderr hint and delegates to `mrmr doctor`.

### Runtime

## Hub daemon

```bash
pnpm --filter @murrmure/hub-daemon dev    # :8787
pnpm --filter @murrmure/shell-web dev     # shell UI
```
