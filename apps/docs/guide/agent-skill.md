# Agent skill for capability development

Studio ships **`@studio/skill`** — a Cursor agent skill that teaches coding agents how to author capabilities without skipping version bumps or the evolution pipeline.

::: tip Why this exists
Agents often edit capability code but forget to bump semver, run `validate`/`test`, or `apply` live. The skill encodes the mandatory checklist and points to reference docs for CLI, MCP, and CDK layout.
:::

Skills are **guidance**, not protocol. Live behavior comes from the hub, grants, and your bundle manifest.

---

## Install

From your capability repo root (or monorepo root):

```bash
npm install -D @studio/capability-sdk   # includes studio skill routing
studio skill install
```

This writes:

```text
.cursor/skills/studio-capability/
├── SKILL.md
└── reference/
    ├── evolution-pipeline.md
    ├── capability-authoring.md
    ├── cli.md
    └── mcp.md
```

Reload Cursor (or restart the agent session) so the skill is discovered.

### On scaffold

```bash
studio capability init my-flow --dir ./workflows/my-flow --with-skill
```

Installs the skill into the **current working directory** when you scaffold.

### Refresh after upgrade

```bash
npm update @studio/skill   # when published; monorepo: pull latest
studio skill update
```

---

## What agents learn

The skill index (`SKILL.md`) covers:

| Topic | Summary |
|-------|---------|
| Platform model | Hub daemon, CDK capability, shell iframe, MCP catalog |
| Change checklist | Bump version → validate → build → push → hub validate/test/promote/apply |
| Agent rules | Use `ctx.contractRefId`, share `studio_url` before wait tools, grant ACL |
| Deep dives | Linked reference files (one level deep) |

---

## When to use it

Enable for any project where agents:

- Scaffold or modify `capability.manifest.json`, `contract/`, `server/`, or `ui/`
- Run `studio capability push` or evolution commands
- Debug missing MCP tools or review canvas links

Pair with **[Connect your agent](./agents-mcp)** for token and MCP config.

---

## Monorepo vs capability-only repo

| Layout | Run `studio skill install` from |
|--------|----------------------------------|
| Single capability repo | Git root |
| Monorepo with `workflows/my-flow/` | Monorepo root (so all packages share the skill) |

Use `--dir` to override:

```bash
studio skill install --dir /path/to/repo
```

---

## Verify

```bash
studio skill version --json
ls .cursor/skills/studio-capability/SKILL.md
```

In Cursor, ask the agent to follow the capability change checklist before pushing — it should cite version bumps and the full evolution pipeline.

---

## Related

- [Capability evolution](./capability-evolution) — state machine and browser/CLI steps
- [Capabilities tutorial](./capabilities-tutorial) — full CDK walkthrough
- [Connect your agent (MCP)](./agents-mcp)
- [Agent skill reference](../reference/agent-skill) — package API and spec pointers
