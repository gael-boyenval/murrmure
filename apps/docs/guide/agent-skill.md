# Agent skill for flow development

Murrmure ships **`@murrmure/skill`** — a Cursor agent skill that teaches coding agents how to author flows without skipping version bumps or the evolution pipeline.

::: tip Why this exists
Agents often edit flow code but forget to bump semver, run `validate`/`test`, or `apply` live. The skill encodes the mandatory checklist and points to reference docs for CLI, MCP, and FDK layout.
:::

Skills are **guidance**, not protocol. Live behavior comes from the hub, grants, and your bundle manifest.

---

## Install

From your flow repo root (or monorepo root):

```bash
npm install -D @murrmure/cli   # includes mrmr skill routing
mrmr skill install
```

This writes:

```text
.cursor/skills/murrmure-flow/
├── SKILL.md
└── reference/
    ├── evolution-pipeline.md
    ├── flow-authoring.md
    ├── cli.md
    └── mcp.md
```

Reload Cursor (or restart the agent session) so the skill is discovered.

### On scaffold

```bash
mrmr flow init my-flow --dir ./workflows/my-flow --with-skill
```

Installs the skill into the **current working directory** when you scaffold.

### Refresh after upgrade

```bash
npm update @murrmure/skill   # when published; monorepo: pull latest
mrmr skill update
```

---

## What agents learn

The skill index (`SKILL.md`) covers:

| Topic | Summary |
|-------|---------|
| Platform model | Hub daemon, FDK flow, shell iframe, MCP catalog |
| Change checklist | Bump version → validate → build → push → hub validate/test/promote/apply |
| Agent rules | Use `ctx.contractRefId`, share `murrmure_url` before wait tools, grant ACL |
| Deep dives | Linked reference files (one level deep) |

---

## When to use it

Enable for any project where agents:

- Scaffold or modify `flow.manifest.json`, `contract/`, `server/`, or `ui/`
- Run `mrmr flow push` or evolution commands
- Debug missing MCP tools or review canvas links

Pair with **[Connect your agent](./agents-mcp)** for token and MCP config.

---

## Monorepo vs flow-only repo

| Layout | Run `mrmr skill install` from |
|--------|----------------------------------|
| Single flow repo | Git root |
| Monorepo with `workflows/my-flow/` | Monorepo root (so all packages share the skill) |

Use `--dir` to override:

```bash
mrmr skill install --dir /path/to/repo
```

---

## Verify

```bash
mrmr skill version --json
ls .cursor/skills/murrmure-flow/SKILL.md
```

In Cursor, ask the agent to follow the flow change checklist before pushing — it should cite version bumps and the full evolution pipeline.

---

## Related

- [Flow evolution](./flow-evolution) — state machine and browser/CLI steps
- [Flows tutorial](./flows-tutorial) — full FDK walkthrough
- [Connect your agent (MCP)](./agents-mcp)
- [Agent skill reference](../reference/agent-skill) — package API and spec pointers
