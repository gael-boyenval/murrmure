# VS-0 manual acceptance — Bootstrap murrmuretuto

**Date:** 2026-07-08  
**Branch:** main (harness only — no kernel slice branch)  
**Tester:** orchestrator agent  
**RESULT:** PASS

## Environment

| Item | Value |
|------|-------|
| agentStudio path | /Users/gaelboyenval/web/GBworkspace/agentStudio |
| murrmuretuto path | /Users/gaelboyenval/web/GBworkspace/murrmuretuto |
| Hub URL | http://127.0.0.1:8787 |
| Space id | spc_murrmuretuto |
| Link binding | macbook-pro-44.home:/Users/gaelboyenval/web/GBworkspace/murrmuretuto |

## Checklist

| # | Step | Expected | Actual | Pass |
|---|------|----------|--------|------|
| 1 | Bootstrap repo (index.html, package.json, murrmure/, agent.md, skills) | Files present | Created from preview-review-v2 example + tutorial Part 1 | ✅ |
| 2 | `mrmr space onboard --yes` | Linked space | spc_murrmuretuto created + applied | ✅ |
| 3 | Build views (`npm install` + `npm run build` both views) | dist/ exists | Built with `@murrmure/view-sdk` ^0.2.1 | ✅ |
| 4 | `mrmr space apply --strict` | Index flow | Indexed with LEGACY_STEP_KIND warnings (expected on current shipped manifest) | ✅ |
| 5 | `mrmr space status` | 4 actions, 1 flow | Matches | ✅ |
| 6 | View asset GET with cookie auth | 200 HTML | `preview-review-intake` doctype HTML | ✅ |
| 7 | `~/Documents/hero-section.md` | Fixture exists | Created | ✅ |
| 8 | Acceptance README template | Exists | studio-specs/plans/acceptance/README.md | ✅ |

## Evidence

- View HTTP: **200**
- View snippet: `<!doctype html>…<title>preview-review-intake</title>`
- Onboard JSON: `desktop_handoff.space_id = spc_murrmuretuto`
- Git commit in murrmuretuto: `chore: bootstrap tutorial 1 space`

## Blockers

None for VS-0 scope. Full Part 8 run deferred until hub stack includes Phase A cookie auth in running binary (orchestrator will use committed Phase A branch for manual slices VS-2+).

## Notes

- murrmuretuto uses **legacy** preview-review manifest (correct baseline before VS-7).
- VS-1 strict linter warns on legacy kinds; `--strict` currently indexes with warnings — manual VS-1 will validate strict **fail** behavior on isolated VS-1 branch.
