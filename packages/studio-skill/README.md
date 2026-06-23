# @studio/skill

Cursor agent skill for **Agent Studio capability development** — evolution pipeline, CDK authoring, CLI, and MCP.

## Install in a repo

```bash
studio skill install
# or
pnpm exec studio-skill install
```

Writes `.cursor/skills/studio-capability/` (SKILL.md + reference/).

Refresh after upgrading `@studio/skill`:

```bash
studio skill update
```

## With capability init

```bash
studio capability init my-flow --dir ./workflows/my-flow --with-skill
```

## Layout

```text
skill/
├── SKILL.md                      # thin index + checklist
└── reference/
    ├── evolution-pipeline.md
    ├── capability-authoring.md
    ├── cli.md
    └── mcp.md
```

## Docs

- User guide: [`apps/docs/guide/agent-skill.md`](../../apps/docs/guide/agent-skill.md)
- Reference: [`apps/docs/reference/agent-skill.md`](../../apps/docs/reference/agent-skill.md)
- Normative spec: [`studio-specs/current/build-capability/15-agent-skill-package.md`](../../studio-specs/current/build-capability/15-agent-skill-package.md)
