# Agent skill package (`@studio/skill`)

Reference for the distributable Cursor skill used by capability-building agents.

Guide: [Agent skill](../guide/agent-skill).

Normative spec: [BC15 — Agent skill package](https://github.com/studio/agentStudio/blob/main/studio-specs/current/build-capability/15-agent-skill-package.md) (`studio-specs/current/build-capability/15-agent-skill-package.md`).

---

## Package

| Field | Value |
|-------|-------|
| npm name | `@studio/skill` |
| Monorepo path | `packages/studio-skill` |
| Cursor skill id | `studio-capability` |
| Binaries | `studio-skill`; also `studio skill` via `@studio/capability-sdk` |

---

## Commands

| Command | Description |
|---------|-------------|
| `studio skill install [--dir path] [--json]` | Copy skill to `{dir}/.cursor/skills/studio-capability/` |
| `studio skill update [--dir path] [--json]` | Refresh (overwrite) installed skill |
| `studio skill version [--dir path] [--json]` | Print package VERSION and default install path |

`studio capability init <id> [--with-skill]` calls `install` after scaffold.

---

## Programmatic API

```typescript
import {
  installStudioSkill,
  defaultInstallPath,
  readSkillVersion,
  skillSourceDir,
} from "@studio/skill";
```

| Export | Returns |
|--------|---------|
| `installStudioSkill(targetRoot?)` | `{ ok: true, path, version }` |
| `defaultInstallPath(targetRoot)` | Absolute path to installed skill dir |
| `readSkillVersion()` | Contents of package `VERSION` file |
| `skillSourceDir()` | Path to bundled `skill/` source tree |

CLI routing:

```typescript
import { runSkillCli } from "@studio/skill/cli";
await runSkillCli(["install", "--dir", "/path/to/repo"]);
```

---

## Source tree (package)

```text
packages/studio-skill/
├── VERSION
├── skill/
│   ├── SKILL.md
│   └── reference/
│       ├── evolution-pipeline.md
│       ├── capability-authoring.md
│       ├── cli.md
│       └── mcp.md
├── src/
│   ├── install.ts
│   ├── cli.ts
│   └── index.ts
└── bin/studio-skill
```

Installed copy mirrors `skill/` under `.cursor/skills/studio-capability/`.

---

## Install JSON response

```json
{
  "ok": true,
  "path": "/path/to/repo/.cursor/skills/studio-capability",
  "version": "0.1.0",
  "command": "install",
  "message": "Installed studio-capability skill to …"
}
```

---

## Skill content contract

`SKILL.md` MUST include:

- Platform model table (hub / capability / shell / MCP)
- Copy-paste evolution checklist
- Links to four reference files (no deeper nesting)

Reference files summarize agent-actionable steps; they do not replace [Capability SDK](./capability-sdk) or [MCP tools](./mcp-tools) reference.

---

## Tests

```bash
pnpm --filter @studio/skill test
```

Covers `installStudioSkill` file copy and `SKILL.md` presence.

---

## Related

- [Capability SDK CLI](./capability-sdk)
- [MCP tools](./mcp-tools)
- [Agent skill guide](../guide/agent-skill)
