# BC15 — Agent skill package (`@murrmure/skill`)

**Status:** normative (2026-06-23)  
**Package:** `packages/skill` (private — bundled into `@murrmure/cli`, not published to npm)  
**Aligns with:** [02-sdk.md](./02-sdk.md) (CLI), [07-mcp-tool-model-and-catalog-rebuild.md](./07-mcp-tool-model-and-catalog-rebuild.md), hub ADR-24 (skills ≠ law)

---

## Purpose

Ship a **versioned, installable Cursor skill** that teaches coding agents the Murrmure flow workflow: semver bumps, evolution pipeline, MCP grants, and FDK authoring rules.

Skills are **guidance for agents**, not protocol. Live behavior remains defined by hub contracts, MCP catalog, and bundle manifests.

---

## Package surface

| Artifact | Role |
|----------|------|
| `skill/SKILL.md` | Thin index: platform model, mandatory checklist, links |
| `skill/reference/*.md` | Progressive disclosure (CLI, MCP, authoring, evolution) |
| `VERSION` | Skill package semver (copied with install; used in CLI output) |
| `src/install.ts` | `installMurrmureSkill(targetRoot)` |
| `src/cli.ts` | `runSkillCli(argv)` |

**npm name:** `@murrmure/skill` (private, CLI bundle only)  
**Skill id (Cursor):** `murrmure-flow` (directory name under `.cursor/skills/`)

---

## Install layout

On `mrmr skill install` (or `mrmr flow init --with-skill`):

```
{targetRoot}/.cursor/skills/murrmure-flow/
├── SKILL.md
└── reference/
    ├── cli.md
    ├── mcp.md
    ├── flow-authoring.md
    └── evolution-pipeline.md
```

| Rule | Requirement |
|------|-------------|
| Target default | `process.cwd()` |
| Overwrite | `update` replaces entire tree (idempotent copy) |
| Monorepo | Run from git / project root so all agents in repo see the skill |
| Not in bundle | Skill is **not** part of flow push payload |

---

## CLI commands

Routed via `mrmr skill …` (same `murrmure` / `mrmr` binary as flow commands).

| Command | Action | JSON output |
|---------|--------|-------------|
| `mrmr skill install [--dir path] [--json]` | Copy skill tree to `.cursor/skills/murrmure-flow/` | `{ ok, path, version, message }` |
| `mrmr skill update [--dir path] [--json]` | Same as install (refresh) | same |
| `mrmr skill version [--dir path] [--json]` | Read package `VERSION` + default install path | `{ ok, version, install_path }` |

Errors: missing source → throw; unknown command → exit 1 with `UNKNOWN_COMMAND`.

---

## Init integration

`mrmr flow init <id> [--with-skill]` MUST call `installMurrmureSkill(process.cwd())` after scaffold succeeds (both default scaffold and `--from-example`).

`--with-skill` is optional; default **false** for backward compatibility.

---

## SKILL.md content requirements

The index MUST include:

1. **Platform model** — hub, flow, shell, MCP bridge (≤1 screen)
2. **Mandatory checklist** — version bump + validate/build/push + hub validate/test/promote/apply
3. **Agent rules** — `ctx.contractRefId`, `murrmure_url` before wait, grant ACL, promote ≠ apply
4. **Links** — one level deep to `reference/*.md` only

Reference files MUST NOT duplicate the full hub spec; they summarize agent-actionable steps.

---

## Versioning

| Field | Meaning |
|-------|---------|
| `packages/skill/VERSION` | Skill **package** release (install messaging) |
| Flow `flow.manifest.json` version | Unrelated — user flow semver |

Bumping `@murrmure/skill` (via CLI release) does not change hub behavior. Users run `mrmr skill update` after upgrading `@murrmure/cli`.

---

## Relationship to MCP and contracts

| Source of truth | Agent skill |
|-----------------|-------------|
| Live MCP catalog (`/v1/mcp/catalog`) | Points agents to reload MCP after apply |
| `contract/mcp-tools.json` in bundle | Authoring reference only |
| Hub evolution HTTP | Checklist mandates CLI parity |

Agents MUST NOT treat skill text as overriding denials, grant ACL, or install policy.

---

## Acceptance (BC15)

| # | Scenario | Proves |
|---|----------|--------|
| 21 | `mrmr skill install --dir /tmp/x` | Tree copied; `SKILL.md` + 4 reference files |
| 22 | `mrmr flow init foo --with-skill` | `.cursor/skills/murrmure-flow/` exists in cwd |
| 23 | `mrmr skill update` after VERSION bump | Overwrites without duplicate nesting |
| 24 | Vitest `install.test.ts` | Package regression guard |

---

## Non-goals (v1)

- Publishing skill to Cursor marketplace/global registry
- Per-flow generated skills (only the platform `murrmure-flow` skill)
- Embedding skill in hub MCP resources (future: contract snippets via MCP resources per ADR-24)

---

## Related

- [02-sdk.md](./02-sdk.md) — flow CLI + FDK
- [acceptance.md](./acceptance.md) — BC15 rows
- User guide: [`apps/docs/guide/agent-skill.md`](../../../apps/docs/guide/agent-skill.md)
