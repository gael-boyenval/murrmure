# Agent skill package (`@murrmure/skill`)

Reference for the distributable Cursor skill used by flow-building agents.

Guide: [Agent skill](../guide/agent-skill).

Normative spec: [BC15 — Agent skill package](https://github.com/studio/agentStudio/blob/main/studio-specs/current/build-flow/15-agent-skill-package.md) (`studio-specs/current/build-flow/15-agent-skill-package.md`).

---

## Package

| Field | Value |
|-------|-------|
| npm name | `@murrmure/skill` |
| Monorepo path | `packages/cli/skill` |
| Cursor skill id | `murrmure-flow` |
| Binaries | `mrmr skill`; also `mrmr skill` via `@murrmure/cli` |

---

## Commands

| Command | Description |
|---------|-------------|
| `mrmr skill install [--dir path] [--json]` | Copy skill to `{dir}/.cursor/skills/murrmure-flow/` |
| `mrmr skill update [--dir path] [--json]` | Refresh (overwrite) installed skill |
| `mrmr skill version [--dir path] [--json]` | Print package VERSION and default install path |

`mrmr flow init <id> [--with-skill]` calls `install` after scaffold.

---

## Programmatic API

```typescript
import {
  installMurrmureSkill,
  defaultInstallPath,
  readSkillVersion,
  skillSourceDir,
} from "@murrmure/skill";
```

| Export | Returns |
|--------|---------|
| `installMurrmureSkill(targetRoot?)` | `{ ok: true, path, version }` |
| `defaultInstallPath(targetRoot)` | Absolute path to installed skill dir |
| `readSkillVersion()` | Contents of package `VERSION` file |
| `skillSourceDir()` | Path to bundled `skill/` source tree |

CLI routing:

```typescript
import { runSkillCli } from "@murrmure/skill/cli";
await runSkillCli(["install", "--dir", "/path/to/repo"]);
```

---

## Source tree (package)

```text
packages/cli/skill/
├── VERSION
├── skill/
│   ├── SKILL.md
│   └── reference/
│       ├── evolution-pipeline.md
│       ├── flow-authoring.md
│       ├── cli.md
│       └── mcp.md
├── src/
│   ├── install.ts
│   ├── cli.ts
│   └── index.ts
└── via `mrmr skill`
```

Installed copy mirrors `skill/` under `.cursor/skills/murrmure-flow/`.

---

## Install JSON response

```json
{
  "ok": true,
  "path": "/path/to/repo/.cursor/skills/murrmure-flow",
  "version": "0.1.0",
  "command": "install",
  "message": "Installed murrmure-flow skill to …"
}
```

---

## Skill content contract

`SKILL.md` MUST include:

- Platform model table (hub / flow / shell / MCP)
- Copy-paste evolution checklist
- Links to four reference files (no deeper nesting)

Reference files summarize agent-actionable steps; they do not replace [Flow Dev Kit](./flow-dev-kit) or [MCP tools](./mcp-tools) reference.

---

## Tests

```bash
pnpm --filter @murrmure/skill test
```

Covers `installMurrmureSkill` file copy and `SKILL.md` presence.

---

## Related

- [Flow Dev Kit CLI](./flow-dev-kit)
- [MCP tools](./mcp-tools)
- [Agent skill guide](../guide/agent-skill)
