# BC15 — Agent skill package (`@studio/skill`)

**Status:** normative (2026-06-23)  
**Package:** `packages/studio-skill`  
**Aligns with:** [02-sdk.md](./02-sdk.md) (CLI), [07-mcp-tool-model-and-catalog-rebuild.md](./07-mcp-tool-model-and-catalog-rebuild.md), hub ADR-24 (skills ≠ law)

---

## Purpose

Ship a **versioned, installable Cursor skill** that teaches coding agents the Studio capability workflow: semver bumps, evolution pipeline, MCP grants, and CDK authoring rules.

Skills are **guidance for agents**, not protocol. Live behavior remains defined by hub contracts, MCP catalog, and bundle manifests.

---

## Package surface

| Artifact | Role |
|----------|------|
| `skill/SKILL.md` | Thin index: platform model, mandatory checklist, links |
| `skill/reference/*.md` | Progressive disclosure (CLI, MCP, authoring, evolution) |
| `VERSION` | Skill package semver (copied with install; used in CLI output) |
| `src/install.ts` | `installStudioSkill(targetRoot)` |
| `src/cli.ts` | `runSkillCli(argv)` |
| `bin/studio-skill` | Standalone entry |

**npm name:** `@studio/skill`  
**Skill id (Cursor):** `studio-capability` (directory name under `.cursor/skills/`)

---

## Install layout

On `studio skill install` (or `init --with-skill`):

```
{targetRoot}/.cursor/skills/studio-capability/
├── SKILL.md
└── reference/
    ├── cli.md
    ├── mcp.md
    ├── capability-authoring.md
    └── evolution-pipeline.md
```

| Rule | Requirement |
|------|-------------|
| Target default | `process.cwd()` |
| Overwrite | `update` replaces entire tree (idempotent copy) |
| Monorepo | Run from git / project root so all agents in repo see the skill |
| Not in bundle | Skill is **not** part of capability push payload |

---

## CLI commands

Routed via `studio skill …` (same `studio` binary as capability SDK).

| Command | Action | JSON output |
|---------|--------|-------------|
| `studio skill install [--dir path] [--json]` | Copy skill tree to `.cursor/skills/studio-capability/` | `{ ok, path, version, message }` |
| `studio skill update [--dir path] [--json]` | Same as install (refresh) | same |
| `studio skill version [--dir path] [--json]` | Read package `VERSION` + default install path | `{ ok, version, install_path }` |

Errors: missing source → throw; unknown command → exit 1 with `UNKNOWN_COMMAND`.

---

## Init integration

`studio capability init <id> [--with-skill]` MUST call `installStudioSkill(process.cwd())` after scaffold succeeds (both default scaffold and `--from-example`).

`--with-skill` is optional; default **false** for backward compatibility.

---

## SKILL.md content requirements

The index MUST include:

1. **Platform model** — hub, capability, shell, MCP bridge (≤1 screen)
2. **Mandatory checklist** — version bump + validate/build/push + hub validate/test/promote/apply
3. **Agent rules** — `ctx.contractRefId`, `studio_url` before wait, grant ACL, promote ≠ apply
4. **Links** — one level deep to `reference/*.md` only

Reference files MUST NOT duplicate the full hub spec; they summarize agent-actionable steps.

---

## Versioning

| Field | Meaning |
|-------|---------|
| `packages/studio-skill/VERSION` | Skill **package** release (install messaging) |
| Capability `capability.manifest.json` version | Unrelated — user capability semver |

Bumping `@studio/skill` does not change hub behavior. Users run `studio skill update` after upgrading the npm package.

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
| 21 | `studio skill install --dir /tmp/x` | Tree copied; `SKILL.md` + 4 reference files |
| 22 | `studio capability init foo --with-skill` | `.cursor/skills/studio-capability/` exists in cwd |
| 23 | `studio skill update` after VERSION bump | Overwrites without duplicate nesting |
| 24 | Vitest `install.test.ts` | Package regression guard |

---

## Non-goals (v1)

- Publishing skill to Cursor marketplace/global registry
- Per-capability generated skills (only the platform `studio-capability` skill)
- Embedding skill in hub MCP resources (future: contract snippets via MCP resources per ADR-24)

---

## Related

- [02-sdk.md](./02-sdk.md) — capability CLI
- [acceptance.md](./acceptance.md) — BC15 rows
- User guide: [`apps/docs/guide/agent-skill.md`](../../../apps/docs/guide/agent-skill.md)
