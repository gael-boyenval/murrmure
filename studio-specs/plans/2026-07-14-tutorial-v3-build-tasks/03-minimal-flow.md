# 03 — Author, apply, start, and externally resolve a minimal flow

**Status:** Ready  
**Build order:** 03  
**Depends on:** 00  
**Source work packages:** T02, linear subset of T03

## Goal

Make the exact Tutorial Part 2 manifest a complete vertical capability: it strict-applies, appears as manually runnable, starts, exposes generic open-step state, and can be resolved by an authorized protocol client without role, presentation, View identity, or built-in resolver assumptions.

## User stories

- As a flow author, I can copy the tutorial YAML and apply it without hidden or legacy fields.
- As an author, a linear step needs only `id` and `description`.
- As an operator, CLI and Desktop agree on whether a flow may start manually.
- As an authorized client, I can resolve an open unbound step.
- As a flow author, I can create an invoke-only flow that is unavailable to independent start surfaces.

## Contracts

- `triggers` is required and is the only start-condition field; manifests containing `start`, including dual `start` + `triggers`, fail strict validation.
- `triggers: {}` means invoke-only: no independent CLI/Desktop/schedule/external-event start, but authorized orchestration invocation remains valid.
- Remove `start` and flow-level `requires_view`; strict schemas reject them as unknown fields.
- Authored `branches` is optional. Omission injects exact `completed` and `failed` branches before filtering/IR/catalog/graph processing.
- Explicit `branches: {}` is invalid. Explicit non-empty maps are exact and receive no implicit missing branches.
- Branch authoring is flat: `schema`, `artifact_slots`, and optional `route`/`resume` are sibling fields. Wrapper shapes such as `payload:` or `outcome:` are rejected.
- Last top-level default `completed` compiles to canonical terminal success; no `next: null`.
- Top-level default `failed` routes to run failure. Explicit branch maps are exact; custom branches require explicit routes.
- Step contracts contain no `role`, `presentation`, `deriveRole`, wait kind, or resolver modality.
- Generic lifecycle is `open` → `resolved`; run detail exposes `open_steps[]`.
- A step with no configured resolver is valid and externally resolvable; its projection has `resolver: null`.
- Keep `apiVersion: murrmure.flow/v1` as the sole clean target; no dual parser or migration.

## Implementation

- Replace manifest schema/parser/compiler/index/scheduler/preview reads of `start` with canonical `triggers`.
- Normalize plain steps and branch defaults before all consumers.
- Materialize defaults into the compiled catalog so explicit/default branches are downstream-equivalent.
- Remove role/presentation discrimination and role-based dispatch/auto-completion.
- Remove wait-step and nullable-routing code.
- Replace `awaiting_human`/`active_human_step` projections with generic `open_steps[]`.
- Add protocol/CLI test support to resolve an unbound step; shell fallback controls are not introduced.
- Update flow templates and fixtures to the exact tutorial shape.

## Testing

### Automated

- Parse/compile/apply/start tests for manual, schedule, event, invoke-only, missing triggers, removed `start`, and dual `start` + `triggers`.
- Pipeline parity tests prove every plain step survives schema, normalization, reachability, IR, catalog, contract keys, runtime, and graph data.
- Exact progressive fixture assertion proves `contract-keys.json` contains `write_spec`, `build`, and `cleanup` when those stages are activated.
- Default/explicit branch equivalence and terminal-success/failure routing tests.
- Rejection/absence guards for `start`, `requires_view`, empty branches, wait shapes, `role`, `presentation`, `deriveRole`, `awaiting_human`, and `active_human_step`.
- Strict rejection tests for `payload:`/`outcome:` branch wrappers.
- Run API tests for zero/one/multiple `open_steps[]` and `resolver: null`.
- Authorization tests for external resolution of an unbound step.
- CLI/Desktop eligibility parity for manual and invoke-only flows.
- Exact tutorial fixture and docs-proof assertions.

### Manual

- Follow Tutorial Part 2 verbatim: create the manifest, strict-apply, inspect it, start it from CLI and Desktop, and resolve its open step with an authorized client.
- Apply a manifest using `start` and confirm hard strict-schema failure with no fallback.
- Apply `triggers: {}` and confirm no independent Run affordance while orchestration invocation still works.
- Inspect compiled catalog and run detail for generic branch and open-step state.

## Documentation, skills, specs, and ADRs

- **ADR required:** resolver-agnostic step contracts and trigger-only clean cutover, including default branch semantics and generic open-step lifecycle.
- **Normative specs:** product flow/trigger semantics, CLI start eligibility, `studio-specs/current/bridges/step-contract.md`.
- **User docs:** `creating-flows.md` and trigger/resolve references.
- **Tutorial:** Part 2 plus related troubleshooting.
- **Skills:** developer flow-authoring and agent resolve guidance.
- **Scaffolds/examples:** minimal flow templates and contract fixtures.
- **Enforcement:** docs-proof, strict schema tests, and forbidden-pattern guards.
- **Changelog:** trigger/default-branch cutover and modality-field removal.

## References

- [Flow branch API simplification](../2026-07-10-flow-branch-api-simplify.md)
- [Default branches](../2026-07-10-step-default-branches.md)
- [Coordinating plan T02/T03](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial Part 2](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow.md)
- [Current step contract](../../current/bridges/step-contract.md)

## Done gate

- Exact Part 2 YAML strict-applies, starts, and resolves.
- Every tutorial step has a stable contract key and appears in every downstream representation.
- Explicit and injected default branches are semantically identical.
- Invoke-only eligibility is consistent on every start path.
- Removed fields and lifecycle states have no schema, type, runtime, fixture, documentation, or skill path.
- Empty explicit branch maps and wrapper branch shapes are rejected; omitted branches alone receive defaults.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2-max | complete | Assessed committed `20ccd42` against the Task 03 done gate: resolver-agnostic step contracts, `triggers`-only start, flat branch authoring, default-branch injection, and generic `open_steps[]` (`resolver: null`) were already co-committed with Task 01; normative bridges (`step-contract.md`), user docs (`creating-flows.md`), tutorial Part 2, developer `flow-authoring` + agent resolve skills, ADR-007, and the operator changelog were already synced by a concurrent agent. This session completed the remaining Task 03 cutover paths: migrated `mrmr space flow init` scaffold templates (`hello-gate`, `hello-invoke`, `example`) to clean step contracts and updated `space-flow-init` assertions; migrated the `preview-review-v2` reference manifest to flat `route`/`resume` and removed `role`/`presentation`/`orchestration`/`goto`/`complete`/`continue` assertions from `preview-review-v2-example.test.ts`; migrated inline manifests in `space-doctor`, `space-doctor-handlers`, `wizard/onboard`, and `mcp-attach`; migrated daemon `flow-call-*`, `transfer`, and `worker-bindings-federation` manifests (`start`→`triggers`, `invoke`→step contracts) and removed `requires-view.test.ts` (removed `requires_view`/`active_human_step`/`awaiting_human`); fixed the space-apply route to surface specific legacy codes (`LEGACY_START_KEY`/`LEGACY_REQUIRES_VIEW`/`LEGACY_STEP_KIND`) via pre-bundle `parseFlowManifest` instead of a generic `INVALID_APPLY_BUNDLE`; aligned `isManualStartAllowed` to `triggers.manual === true` so `triggers: {}` / flow-call-only flows are invoke-only on every start path; added Task 03 cutover entries to the `cli`, `hub-core`, and `hub-daemon` changelogs. | Full suite: 912 passed \| 55 skipped \| 6 failed — all 6 failures are pre-existing and outside Task 03 scope (CLI `mcp-snippet-shared` MCP config shape; shell-web `App.test.tsx` ConnectPage UI and `NotificationBell` ×4 UI a11y). Contracts + hub-core: 239 passed \| 22 skipped; hub-core + hub-daemon: 354 passed \| 38 skipped; cli + desktop + shell-web + view-sdk: 466 passed \| 12 skipped. Beyond-Task-03 orchestration suites (`flow-call-*`, `nested-resolve`, `attach`, `preview-review-v2` dispatch) remain intentionally `describe.skip` per in-file "beyond Task 03 / owned by the orchestration slice" comments. Removed fields have no schema, type, runtime, fixture, doc, or skill path. | review |
