# Review — murrmure-agent skill

**Date:** 2026-07-09  
**Scope:** `packages/cli/skill-agent/SKILL.md`, `packages/cli/skill-agent/VERSION`  
**Code baseline:** handlers cutover / `.mrmr/` layout (2026-07-09)  
**Verdict:** MIXED

## Executive summary

The shipped `murrmure-agent` skill correctly centers the v2 runtime loop (`murrmure_resolve_step`, `murrmure_list_step_contracts`, ban on legacy gate tools) and lists `murrmure_list_handlers`. It is too thin for production agent use: no platform model, no environment variables, no bootstrap/discovery loop, and no guidance on handler-dispatched steps vs headless invoke. The monolithic `packages/cli/skill/reference/platform-model.md` has the missing content but lives in the legacy package.

## Findings

| ID | Severity | Path | Issue | Recommended fix |
|----|----------|------|-------|-----------------|
| A-001 | blocking | `skill-agent/SKILL.md` | No platform model (space, handler, contract_key, run, session) | Import condensed table from `skill/reference/platform-model.md` — updated for handlers |
| A-002 | blocking | `skill-agent/SKILL.md` | No environment variables section | Add MCP (`MURRMURE_HUB_TOKEN`) + handler child env (`MURRMURE_RUN_ID`, `MURRMURE_STEP_ID`, …) |
| A-003 | blocking | `skill-agent/SKILL.md` | No bootstrap loop: apply status, handler coverage, emittable events | Add pre-flight: `murrmure_space_health`, `murrmure_list_handlers`, `murrmure_list_emittable_events` |
| A-004 | major | `skill-agent/SKILL.md` | Runtime loop omits `murrmure_emit_event` | Add when agent must signal cross-space events |
| A-005 | major | `skill-agent/SKILL.md` | No artifact transfer guidance | Link `bridges/artifacts.md` patterns for step outputs |
| A-006 | major | `skill-agent/SKILL.md` | No nested step guidance (`build.build-loop`, `complete: parent`) | Add preview-review nested resolve pattern |
| A-007 | minor | `skill-agent/SKILL.md` | Lists `murrmure_list_handlers` but no usage example | JSON example call + expected shape |
| A-008 | minor | `apps/docs/guide/agent-skill.md` | Still documents monolithic `murrmure` skill name | Point to `murrmure-agent` variant |

Severity: `blocking` | `major` | `minor` | `info`

## Delete candidates

- None in skill-agent — expand in place.

## Missing coverage

- Handler-dispatched step awareness: agent receives prompt from handler, must `resolve_step` with explicit branch
- `murrmure_wait_for_run` vs polling `murrmure_get_run` decision tree
- Grant capability checklist (`step:resolve`, `space:read`, `flow:run`, `journal:read`)
- Federation: `query_ask` for cross-space reads
- Error recovery: `EXECUTOR_UNAVAILABLE`, handler timeout

## Cross-links

- Related reviews: [09-skill-developer-legacy.md](./09-skill-developer-legacy.md), [08-skill-agent.md](./08-skill-agent.md), [04-docs-reference.md](./04-docs-reference.md)
