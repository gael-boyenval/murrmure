# DEV-NOTES — VS-1 StepContractCatalog compile

**Slice:** VS-1  
**Branch:** `feat/step-contracts-vs-1-catalog`  
**Date:** 2026-07-08
**Commit:** `7bf9f32`

## Summary

Introduced unified step contract types, apply-time `StepContractCatalog` compilation, strict linter for v2.2 manifests, and catalog digest surfacing in CLI/hub. **No resolve handler, runner merge, or tool deletion** (VS-2+).

## Files touched

### contracts
- `packages/contracts/src/entities/step-contract.ts` — types + Zod (`StepStatus`, catalog, slice)
- `packages/contracts/src/entities/resolve-step.ts` — `ResolveStepBodySchema` (types only; handler VS-2)
- `packages/contracts/src/grants/capability.ts` — added `step:resolve`
- `packages/contracts/src/journal/event-types.ts` — `mrmr.step.opened`, `mrmr.step.resolved`
- `packages/contracts/src/entities/flow-index.ts` — `step_contract_catalog` on index entry
- `packages/contracts/src/flow/manifest.ts` — step contract authoring fields on `FlowStep`
- `packages/contracts/src/flow/ir.ts` — `step_contract` IR kind
- `packages/contracts/src/index.ts` — exports

### hub-core
- `packages/hub-core/src/flow-engine/step-contract-compile.ts` — catalog compile + strict linter
- `packages/hub-core/src/flow-engine/compile.ts` — flatten nested steps to IR
- `packages/hub-core/src/flow-engine/engine-capabilities.ts` — wire step-contract lint into apply bundle lint
- `packages/hub-core/src/index/apply-index.ts` — persist catalog; status digests
- `packages/hub-core/src/index/parse-flow-manifest.ts` — `detectLegacyStepKinds`; executor space collection
- `packages/hub-core/src/flow-engine/index.ts` — export step-contract-compile

### cli
- `packages/cli/src/commands/space/apply.ts` — catalog digest in success output
- `packages/cli/src/commands/space/status.ts` — catalog digest per flow
- `packages/cli/src/lint/flow-manifest.ts` — CLI lint re-exports

### hub-daemon
- `packages/hub-daemon/src/routes/spaces/index.ts` — unchanged handler; catalog persisted via `applyIndexDiff` + `buildIndexStatus`

### specs / docs / skills
- `studio-specs/current/bridges/step-contract.md` — normative authoring bridge
- `studio-specs/plans/2026-07-07-step-contracts-unified-state-machine.md` — status → In progress (VS-1)
- `apps/docs/guide/creating-flows.md` — Step contracts (v2.2) section
- `apps/docs/guide/tutorials/01-local-preview-review/05-flow-manifest.md` — VS-7 migration callout
- `packages/cli/skill/reference/flows.md` — target manifest shape

### tests
- `packages/hub-core/test/unit/flow-engine/step-contract-compile.test.ts` — new
- `packages/hub-daemon/test/http/spaces/apply.test.ts` — catalog persist + legacy warnings
- `packages/cli/test/docs-proof.test.ts` — bridge exists + v2 strict pass
- `packages/cli/test/preview-review-v2-example.test.ts` — legacy strict expectation
- `packages/cli/test/space-flow-init.test.ts` — legacy strict expectation

## Commands run

```bash
git checkout -b feat/step-contracts-vs-1-catalog

pnpm --filter @murrmure/contracts build
pnpm exec vitest run --project @murrmure/hub-core test/unit/flow-engine/step-contract-compile.test.ts
pnpm exec vitest run --project @murrmure/hub-daemon test/http/spaces/apply.test.ts
pnpm exec vitest run --project @murrmure/cli test/docs-proof.test.ts test/preview-review-v2-example.test.ts test/space-flow-init.test.ts
```

All targeted tests **pass**.

## Strict apply behavior (document for manual tester)

| Manifest | `mrmr space apply` | `mrmr space apply --strict` |
|----------|-------------------|----------------------------|
| Legacy `invoke:` / `checkpoint:` (e.g. `preview-review`) | ✅ indexes; `LEGACY_STEP_KIND` warnings | ❌ fails strict |
| v2.2 `branches` shape (parallel test flow) | ✅ indexes; catalog compiled | ✅ passes if linter clean |
| Unknown `{{murrmure.bad_token}}` | warning | ❌ fails strict (`UNKNOWN_MURRMURE_TOKEN`) |

**Dual manifest:** Hub indexes **all** flows in the bundle. Legacy `preview-review` and a parallel v2 test flow can coexist; only the v2 flow gets `step_contract_catalog`.

## Manual test protocol (murrmuretuto)

1. Add `murrmure/flows/preview-review-v2/flow.manifest.yaml` using bridge shape (do not replace default flow yet).
2. `mrmr space apply` on repo with legacy `preview-review` → expect `LEGACY_STEP_KIND` warnings; non-strict succeeds.
3. `mrmr space apply --strict` on legacy-only → **must fail** with migration message pointing to `step-contract.md`.
4. Apply bundle with **only** v2 test flow (or dual where strict is run on v2-only tree) → catalog digest in CLI output.
5. `mrmr space status` → `step_contract_catalog_digest` + step count per flow.
6. Add typo `{{murrmure.unknown_token}}` in v2 manifest → strict apply fails with token error.

## Known gaps (VS-2+)

- No `POST /v1/runs/.../steps/.../resolve` handler
- No `murrmure_resolve_step` MCP tool
- `step_contract` IR kind not dispatched by advance runner
- Journal `mrmr.step.opened` / `mrmr.step.resolved` not emitted
- `active-step-contract.json` not written
- Tutorial 1 still teaches legacy manifest until VS-7/VS-8
- `pnpm --filter @murrmure/hub-core build` passes after VS-1 scope cleanup (no `complete-dispatched` shim on this branch)

## Example v2 manifest snippet (for manual parallel flow)

See full shape in `studio-specs/current/bridges/step-contract.md`.
