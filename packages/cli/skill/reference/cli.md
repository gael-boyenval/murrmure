# Murrmure CLI

Prefer **MCP** for interactive agent loops. Use CLI for scaffold, apply, grants, and automation.

## Setup wizards

| Command | Purpose |
|---------|---------|
| `setup [--yes] [--json]` | First-run: connect → spaces → init → link → apply → skill → grant + MCP |
| `space onboard [--yes] [--json]` | Existing `murrmure/`: link → apply → status |
| `space setup` | Hub admin subset (connect, create spaces, init/link/apply, grant) |

`--json` alone prints the step plan for agents. `--json --yes` runs non-interactively and emits JSON results.

## Space directory

| Command | Purpose |
|---------|---------|
| `space init [--with-skill]` | Scaffold `murrmure/` templates |
| `space flow init <id> [--template hello-gate\|hello-invoke]` | Scaffold flow + actions + views |
| `space view init <id>` | Scaffold Vite+React view |
| `view dev <id>` | View dev loop with fixtures |
| `space link --path . --space spc_…` | Register host path binding |
| `space link --path . --create` | Create space from slug + link |
| `space apply [--strict]` | Index local files to hub |
| `space status` | Indexed counts and digests |
| `flow run flw_<name> --input '{}'` | Start indexed flow |

## Grants & auth

| Command | Purpose |
|---------|---------|
| `grant mint --capabilities …` | Mint agent token (rev-1 capabilities) |
| `grant list` / `grant revoke` | Manage grants |
| `login` / `logout` / `whoami` | Hub credentials |
| `doctor` / `space doctor` | Hub health + murrmure/ drift + MCP hints |

## Skill

```bash
mrmr skill install          # → .cursor/skills/murrmure/
mrmr skill update
mrmr skill version --json
mrmr skill install --dir /path/to/repo
```

Run from **git root** so all agents in the project pick up the skill.

## Federation

```bash
mrmr federation peer add --id hub_company --url http://peer.example:8787 --token tok_…
mrmr federation status
```

## Environment

| Variable | Used for |
|----------|----------|
| `MURRMURE_HUB_URL` | Hub base (default `http://127.0.0.1:8787`) |
| `MURRMURE_TOKEN` / `MURRMURE_HUB_TOKEN` | Bearer token |
| `MURRMURE_SPACE_ID` | Default space in MCP/snippets |

Add `--json` for machine-readable output in scripts.

## Hub daemon (contributors)

```bash
pnpm --filter @murrmure/hub-daemon dev    # :8787
pnpm --filter @murrmure/shell-web dev     # shell UI
```

See [space-directory.md](space-directory.md), [wizards.md](wizards.md).
