# Improvement request: Expand `mrmr space doctor` diagnostics

## Topic

cli_doctor

## Summary

`mrmr space doctor` and `mrmr doctor` pass on partially onboarded space repos even when common tutorial blockers are present. Three gaps surfaced during Tutorial 1 (local preview review) on `/spaces/spc_my_space`:

1. **Skill folder/name drift** — legacy `.cursor/skills/murrmure-flow/` (`name: murrmure-flow`) is not flagged; current CLI installs `.cursor/skills/murrmure/` (`name: murrmure`). Users who skip `mrmr skill install` on an existing repo get no warning.
2. **View SDK scaffold version mismatch** — `mrmr space view init` scaffolds `@murrmure/view-sdk@^0.1.0`, but npm only publishes `0.2.x`. `npm install` fails with `ETARGET` / `notarget`; doctor does not compare scaffold pins to the published registry.
3. **MCP catalog probe is file-scan only** — doctor checks `.cursor/mcp.json` / grant config but does not verify that the **live** MCP tool catalog (as seen from a Cursor session after auth) includes grant-scoped hub tools. A repo can have valid MCP config while Cursor still exposes only `mcp_auth`.

Together, doctor reports OK while agents hit stale skills, broken view installs, and invisible Murrmure MCP tools.

## Suggestion

Extend `mrmr space doctor` with three new check categories and wire fixes into the onboard path:

| Check code | What to detect | Suggested fix |
|------------|----------------|---------------|
| `SKILL_DRIFT` | Legacy `murrmure-flow/` dir, missing `murrmure/SKILL.md`, or outdated skill `VERSION` / frontmatter `name` vs bundled CLI skill | `mrmr skill install` or `mrmr skill update` |
| `VIEW_SDK_VERSION` | Scaffolded view `package.json` pins `@murrmure/view-sdk` to a range unsatisfiable on npm (e.g. `^0.1.0` when only `0.2.x` exists) | Re-scaffold, bump pin in template, or print explicit version fix |
| `MCP_CATALOG_LIVE` | Hub `/v1/mcp/catalog` (or stdio `tools/list` via `murrmure mcp`) does not include expected grant tools (e.g. `murrmure_space_status`, `murrmure_emit_event`) even when `mcp.json` looks correct | Re-mint grant, re-auth MCP bridge, or document post-auth catalog refresh |

**Onboard path:** when `mrmr space onboard` runs, auto-run or prompt `mrmr skill install` when `SKILL_DRIFT` issues are detected (mirror install's removal of legacy `murrmure-flow/`).

**Fix plan:** include skill install and MCP catalog re-probe in `buildSpaceDoctorFixPlan` when matching issues are present.

**Tests:** docs-proof or unit fixtures for legacy skill dir only, stale view-sdk pin, and catalog mismatch vs valid `mcp.json`.

## Context

- **Repo / space:** `/spaces/spc_my_space`
- **Workflow:** Tutorial 1 — Local preview review (Parts 2, 6, and MCP connectivity checks)
- **Commands run without surfacing issues:** `mrmr space doctor`, `mrmr doctor`
- **Related failures already reported:**
  - Skill drift: `feedbacks/2026-07-07-failure-integration-skill-name-path-drift.md`
  - View SDK pin: `feedbacks/2026-07-07-failure-dependency-mismatch-view-sdk-scaffold.md`
  - MCP catalog in Cursor: `feedbacks/2026-07-07-improvement-mcp-discovery.md`
- **Current doctor scope:** `packages/cli/src/lib/space-doctor.ts` (legacy Studio v1 artifacts, MCP config file scan via `space-doctor-mcp.ts`); `packages/cli/src/lib/doctor.ts` (hub auth, token scopes, executor reachability) — neither validates skill install state, view-sdk publishability, nor live MCP tool catalog.

## Source

- Event: `murrmure.feedback.requestImprovement`
- Emitter: `/spaces/spc_my_space`
- Session: `ses_01KWYC34KJX1871M3ZHQBSA57J`
- Run: `run_01KWYC34KKC5FBMQ4RTWG1GJ3J`
