# Agent skill

Murrmure ships a Cursor agent skill bundled in `@murrmure/cli`. **Agents should follow the installed skill** — it is the sole normative source for commands, manifests, and protocol behavior.

## Install

```bash
npm install -D @murrmure/cli
mrmr skill install
```

Installs to `.cursor/skills/murrmure/`. Reload Cursor after install or upgrade.

```bash
mrmr skill update          # refresh after CLI upgrade
mrmr skill version --json  # verify bundled version
```

Use `--dir` for monorepo roots. `mrmr space init --with-skill` installs during space scaffold.

## Verify

```bash
grep -q '^name: murrmure' .cursor/skills/murrmure/SKILL.md
```

## Related

- [Connect your agent (MCP)](./agents-mcp) — hub token and MCP config
- [Quick start](./quick-start) — human onboarding
- [Known gaps](./known-gaps) — shipped vs backlog (synced with skill `reference/known-gaps.md`)
