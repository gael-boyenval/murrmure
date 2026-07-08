# Failure: legacy `murrmure-flow` skill undetected by doctor; tutorial Part 2 step skipped on existing repo

## Summary

An existing space repo (`/spaces/spc_my_space`) still had the pre–phase-07 platform skill at `.cursor/skills/murrmure-flow/` (`name: murrmure-flow`). Current CLI installs the unified skill to `.cursor/skills/murrmure/` (`name: murrmure`). When manually applying Tutorial 1 Part 2 to that repo, **`mrmr skill install` was skipped** because `murrmure/` and MCP were already configured. Neither **`mrmr space doctor`** nor **`mrmr doctor`** reported the skill name/path drift, so the agent continued using stale FDK-era guidance until the mismatch was noticed manually.

## Context

- **Repo / space:** `/spaces/spc_my_space` (tutorial test env)
- **Failure type:** `integration_failure`
- **Workflow:** Tutorial 1 — Local preview review, [Part 2 — Setup wizard](../../apps/docs/guide/tutorials/01-local-preview-review/02-setup-wizard.md)
- **Scenario:** Existing repo partially onboarded before the unified skill rename (phase 07); user followed tutorial steps manually instead of running the full `mrmr setup` wizard
- **Skipped step:** `mrmr skill install` (documented in the wizard table and under "Already onboarded?")
- **Expected skill location:** `.cursor/skills/murrmure/SKILL.md` with frontmatter `name: murrmure`
- **Actual skill location:** `.cursor/skills/murrmure-flow/SKILL.md` with frontmatter `name: murrmure-flow`
- **Doctor commands run:** `mrmr space doctor`, `mrmr doctor` — both reported OK / no skill-related issues

## Evidence

**Payload summary:**

> Repo had `.cursor/skills/murrmure-flow` (name murrmure-flow) but `mrmr skill install` writes `.cursor/skills/murrmure` (name murrmure). `mrmr space doctor` and `mrmr doctor` did NOT flag skill name/path drift. Tutorial Part 2 requires `mrmr skill install` — skipped when manually applying tutorial to existing repo.

**Tutorial Part 2 requires platform skill install:**

| Step | What it does |
|------|--------------|
| **Skill** | `mrmr skill install` — platform skill for Murrmure MCP tools, gates, runs |

Source: `apps/docs/guide/tutorials/01-local-preview-review/02-setup-wizard.md`

**"Already onboarded?" escape hatch still lists skill install:**

```bash
mrmr space onboard
mrmr skill install
mrmr grant mint --space spc_… --capabilities … --label cursor
```

**CLI install behavior (current):**

- Target: `.cursor/skills/murrmure/` (`SKILL_DIR_NAME = "murrmure"`)
- Legacy dir removed on install: `.cursor/skills/murrmure-flow/` (`LEGACY_SKILL_DIR_NAME`)
- Source: `packages/cli/src/skill/install.ts`

**Verification command documented but not enforced by doctor:**

```bash
grep -q '^name: murrmure' .cursor/skills/murrmure/SKILL.md
```

Source: `apps/docs/guide/agent-skill.md`

**Doctor gap:** `runSpaceDoctor` scans legacy Studio v1 artifacts (`capability.manifest.json`, `@studio/capability-*`, FDK flow files) and MCP config, but has **no check** for `.cursor/skills/murrmure-flow/` or missing/outdated `.cursor/skills/murrmure/`. `runDoctor` only validates hub auth, token scopes, and executor reachability — also **no skill checks**.

Source: `packages/cli/src/lib/space-doctor.ts`, `packages/cli/src/lib/doctor.ts`

**Product status mismatch:** `known-gaps.md` lists B7 ("Skill fragmented (`murrmure-flow`)") as **Closed (phase 07)**, but repos that never re-ran `mrmr skill install` can still carry the old skill silently.

**Repro (existing repo path):**

1. Start with a repo that has `.cursor/skills/murrmure-flow/` from an older CLI or early tutorial run.
2. Complete Tutorial Part 2 manually: link, apply, MCP grant — **skip** `mrmr skill install`.
3. Run `mrmr space doctor` and `mrmr doctor`.
4. Observe: no warning about legacy skill path or missing unified skill.
5. Cursor agent loads `murrmure-flow` skill (stale name, outdated reference tree) instead of `murrmure`.

## Murrmure improvement

1. **Add skill drift checks to `mrmr space doctor`** — emit issues when:
   - `.cursor/skills/murrmure-flow/` exists (code e.g. `LEGACY_SKILL_DIR`, fix: `mrmr skill install`)
   - `.cursor/skills/murrmure/SKILL.md` is missing (code e.g. `SKILL_MISSING`, fix: `mrmr skill install`)
   - Installed skill `VERSION` or frontmatter `name` does not match bundled CLI skill (`SKILL_OUTDATED`, fix: `mrmr skill update`)
2. **Include `mrmr skill install` in `buildSpaceDoctorFixPlan`** when any of the above issues are present (mirror MCP fix-plan behavior).
3. **Tutorial Part 2 "Already onboarded?"** — add an explicit checkpoint: run the `grep` verify line from `agent-skill.md` and treat failure as blocking before Part 3.
4. **Optional: `mrmr space onboard`** — prompt or auto-run skill install when legacy `murrmure-flow` is detected (same as install's `rmSync` of legacy dir).
5. **Docs-proof test** — fixture repo with only `murrmure-flow/`; assert `runSpaceDoctor` surfaces `LEGACY_SKILL_DIR`.

## Source

- Event: `murrmure.feedback.failure`
- Emitter: `/spaces/spc_my_space`
- Session: `ses_01KWYC1BQBH253XQ6DD7G57QTG`
- Run: `run_01KWYC1BQCRR0YVARK68F3G2FF`
- Docs: `apps/docs/guide/tutorials/01-local-preview-review/02-setup-wizard.md`, `apps/docs/guide/agent-skill.md`
