# Agent skill

Murrmure ships **split Cursor agent skills** bundled in `@murrmure/cli`. **Agents should follow the installed skill** — it is the normative source for commands, manifests, and protocol behavior.

## Variants

| Variant | Install path | Audience |
|---------|--------------|----------|
| **agent** | `.cursor/skills/murrmure-agent/` | Runtime agents — resolve steps, wait for humans, MCP tools |
| **developer** | `.cursor/skills/murrmure-developer/` | Flow/view authors — manifests, handlers, apply, scaffold |

Default install picks **`all`** when `.mrmr/flows/` or `.mrmr/views/` exist; otherwise **`agent`** only.

## Install

```bash
npm install -D @murrmure/cli
mrmr skill install                    # archetype-based default
mrmr skill install --variant agent    # worker / runtime only
mrmr skill install --variant developer  # authoring only
mrmr skill install --variant all      # both skills
```

Reload Cursor after install or upgrade.

```bash
mrmr skill update --variant all       # refresh after CLI upgrade
mrmr skill version --variant agent --json
```

Use `--dir` for monorepo roots. `mrmr space init --with-skill` installs during space scaffold.

Legacy monolithic `.cursor/skills/murrmure/` is removed on install.

## Verify

```bash
grep -q '^name: murrmure-agent' .cursor/skills/murrmure-agent/SKILL.md
grep -q '^name: murrmure-developer' .cursor/skills/murrmure-developer/SKILL.md
```

## Related

- [Connect your agent (MCP)](./agents-mcp) — hub token and MCP config
- [Quick start](./quick-start) — human onboarding
- [Known gaps](./known-gaps) — shipped vs backlog
- [Reference: agent skill](../reference/agent-skill)
