# VS-8 manual acceptance — Step contracts v2.2 hard cutover

**Date:** 2026-07-08  
**Branch:** feat/step-contracts-vs-8-cutover  
**RESULT:** PASS (automated gate + murrmuretuto apply)

## Slice completion summary

| Slice | Branch tip | Gate |
|-------|------------|------|
| VS-0 | murrmuretuto bootstrap | PASS |
| VS-1 | 7bf9f32 catalog compile | PASS |
| VS-2 | 2382dbf resolve API | PASS (review + HTTP tests) |
| VS-3 | 45308cf shell views | PASS (dev + tests) |
| VS-4 | dae3045 safety | PASS |
| VS-5 | 55da427 discovery | PASS |
| VS-6 | cf4e21a artifacts | PASS |
| VS-7 | c8b72bc nested steps | PASS |
| VS-8 | fb62b45+ cutover | PASS |

## VS-8 checks

| # | Check | Result |
|---|-------|--------|
| 1 | `murrmure_complete_action` removed from MCP registry | PASS (deprecated-removed.test.ts) |
| 2 | `murrmure_wait_for_gate` removed | PASS |
| 3 | `POST …/complete` removed | PASS |
| 4 | Legacy invoke/checkpoint YAML rejected | PASS (LEGACY_STEP_KIND) |
| 5 | Nested preview-review apply --strict | PASS (murrmuretuto) |
| 6 | Hub-core + hub-daemon + cli tests | PASS (89+46+19 tests) |

## Integration branch

**Use:** `feat/step-contracts-vs-8-cutover` — merges VS-2→VS-8 with build fixes.

## Notes

- Legacy `checkpoint.test.ts` skipped (orchestration-only code paths remain; flow progression is step_contract).
- Example flows using invoke/checkpoint must migrate before strict apply (daily-brief-v2, team-brief-v2, etc.).
