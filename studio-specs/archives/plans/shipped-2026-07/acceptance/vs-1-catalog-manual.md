# VS-1 manual acceptance — StepContractCatalog compile

**Date:** 2026-07-08  
**Branch:** feat/step-contracts-vs-1-catalog @ 450638c  
**Tester:** orchestrator  
**RESULT:** PASS

## Environment

| Item | Value |
|------|-------|
| agentStudio | feat/step-contracts-vs-1-catalog |
| murrmuretuto | spc_murrmuretuto |
| Hub | http://127.0.0.1:8787 |

## Checklist

| # | Step | Expected | Actual | Pass |
|---|------|----------|--------|------|
| 1 | Add v2 test manifest `preview-review-v2/flow.manifest.yaml` | Valid branches shape | Created | ✅ |
| 2 | `mrmr space apply` (non-strict) | LEGACY_STEP_KIND warnings + index | 6 legacy warnings; 2 flows indexed | ✅ |
| 3 | v2 flow catalog digest | Printed on apply | `catalog flw_flows_preview_review_v2: f83a56108999… (2 steps)` | ✅ |
| 4 | `mrmr space apply --strict` with legacy flow | Fail | `ERROR ✗ 6 apply lint warning(s) under --strict` | ✅ |
| 5 | Unit tests `step-contract-compile.test.ts` | 7/7 pass | pass | ✅ |

## Notes

- Strict failure is driven by legacy `preview-review` manifest (expected until VS-8 cutover).
- v2 parallel test flow compiles catalog independently of legacy warnings on non-strict apply.
