# Manual acceptance artifacts (step contracts v2.2)

Each vertical slice in [2026-07-08-step-contracts-vertical-slices.md](../2026-07-08-step-contracts-vertical-slices.md) requires a **manual test agent** to write a findings file here before the slice gate passes.

## Naming

```text
vs-{N}-{slug}-manual.md
```

Examples:

- `vs-0-bootstrap-manual.md`
- `vs-7-nested-manual.md`

## Required sections

```markdown
# VS-{N} manual acceptance — {title}

**Date:** YYYY-MM-DD
**Branch:** feat/step-contracts-vs-{N}-*
**Tester:** (agent id or human)
**RESULT:** PASS | FAIL

## Environment

| Item | Value |
|------|-------|
| agentStudio path | /Users/gaelboyenval/web/GBworkspace/agentStudio |
| murrmuretuto path | /Users/gaelboyenval/web/GBworkspace/murrmuretuto |
| Hub URL | http://127.0.0.1:8787 |
| Shell URL | http://127.0.0.1:5174 |
| Space id | spc_… |

## Checklist

| # | Step | Expected | Actual | Pass |
|---|------|----------|--------|------|
| 1 | … | … | … | ✅ / ❌ |

## Evidence

- Run id: `run_…`
- Session id: `ses_…`
- Screenshots: (paths)
- Commands run: (code block)

## Blockers

(none | list)

## Notes

(optional — deviations, follow-ups for next slice)
```

## Orchestrator rule

Do **not** start slice **N+1** until the prior slice file exists and contains `RESULT: PASS`.
