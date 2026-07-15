# ADR-007 — Resolver-agnostic step contracts and trigger-only clean cutover

**Status:** Accepted
**Date:** 2026-07-14
**Owners:** Contracts, Hub core, CLI
**Task:** [Tutorial v3 Task 03](../plans/2026-07-14-tutorial-v3-build-tasks/03-minimal-flow.md)

## Context

Flow steps previously carried resolver modality — `role`, `presentation`,
`deriveRole`, wait kinds — and start conditions were declared under a top-level
`start:` map that could also carry `requires_view`. Branch routing used
superseded keys (`next`, `fail_run`, `goto`, `fail`, `complete`, `continue`) and
wrapper shapes (`payload:`, `outcome:`). Open human steps were projected as
`awaiting_human` / `active_human_step`, coupling the protocol to a single
human-gate presentation model.

This violated the Murrmure ownership boundary: the portable flow must describe
**what** happens (protocol), while spaces own **how** it is executed and
presented. Embedding resolver modality and View identity in the flow made flows
non-portable and forced the shell to synthesize controls for unbound steps.

## Decision

1. **Resolver-agnostic step contracts.** A step is `id`, optional `description`,
   optional `branches`, and optional nested `steps` — no `role`, `presentation`,
   `deriveRole`, wait kind, or resolver modality. A step with no configured
   resolver is valid and externally resolvable; its projection carries
   `resolver: null`.
2. **`triggers` is the only start-condition field.** The removed `start` and
   flow-level `requires_view` are rejected by the parser with no dual reader,
   no alias, and no migration. `triggers: {}` means invoke-only: no independent
   CLI / Desktop / schedule / external-event start, while authorized
   orchestration invocation remains valid.
3. **Flat branch authoring.** `schema`, `schema_ref`, `artifact_slots`, and
   optional `route` / `resume` are sibling fields. Wrapper shapes (`payload`,
   `outcome`) and superseded routing keys are rejected by the strict schema.
   `route` is `{ step }` (open), `{ run: completed | failed }` (terminate), or
   `resume: <ancestor>` (return a resolved child to an already-yielded
   ancestor). Child activation and assignment yield are defined by
   [ADR-015](./ADR-015-nested-step-call-return.md).
4. **Default branches.** Omitted `branches` inject exact `completed` and `failed`
   branches before every downstream consumer, so explicit and injected defaults
   are semantically identical. Explicit branch maps are exact: `branches: {}` is
   rejected, and custom top-level branches require an explicit `route`. The last
   top-level default `completed` compiles to canonical terminal success — there
   is no `next: null`.
5. **Generic open-step lifecycle.** A step is `open` (`working`) until an
   authorized protocol client or space-bound handler resolves a branch or a
   nested parent atomically yields to one child. A returned child restores the
   ancestor to `working` with a fresh assignment; it does not reopen or resolve
   it. Run detail exposes generic `open_steps[]` with sanitized resolver and
   nested context. `awaiting_human` and `active_human_step` are removed; flow
   steps create no gate rows.
6. **One canonical contract owner.** `BranchResolveContract` and
   `OpenStepResolverProjection` are defined once in `@murrmure/contracts`
   (`entities/step-contract.ts`, `entities/run.ts`); compilers, runtime, and
   every consumer projection reference that single definition.
7. **Sole clean target.** `apiVersion: murrmure.flow/v1` is the only supported
   manifest shape. There is no dual parser, no v2 reader, and no deprecation
   window.

## Consequences

- Flows are portable across spaces, repos, machines, and teams: the same flow
  may run with different execution and presentation policies bound by each space.
- The shell reads `open_steps[]` to render state but must not synthesize forms or
  fallback controls for unbound steps, and must not become a second workflow
  engine.
- CLI and Desktop agree on manual and invoke-only eligibility because both read
  the same `triggers` projection.
- Existing v2.2 manifests with `start`, `requires_view`, `role`, `presentation`,
  `next`, `fail_run`, `goto`, `fail`, `complete`, `continue`, `payload`, or
  `outcome` fail strict apply with a named code and no fallback; authors migrate
  to the flat shape.

## Enforcement

- `FlowManifestSchema`, `FlowStartConditionsSchema`, and
  `StepBranchDefinitionSchema` are `.strict()`; unknown keys (including `start`,
  `requires_view`, `role`, `presentation`, `deriveRole`, wrapper shapes, and
  superseded routing keys) fail validation.
- `parseFlowManifest` rejects `LEGACY_START_KEY` (including dual
  `start` + `triggers`), `LEGACY_REQUIRES_VIEW`, `LEGACY_STEP_KIND`,
  `REMOVED_FIELD`, and `INLINE_SCRIPT_STEP` before schema validation.
- `compileStepContractCatalog` injects default branches, lints
  `EMPTY_BRANCHES`, `CUSTOM_BRANCH_REQUIRES_ROUTE`, `ROUTE_TARGET_NOT_FOUND`,
  `RESUME_TARGET_NOT_ANCESTOR`, and `DEAD_STEP`, and emits a stable catalog
  digest.
- The Tutorial v3 contract, HTTP, and CLI suites prove the exact Part 2 flow
  strict-applies, starts, exposes `open_steps[]` (`resolver: null`), and resolves
  externally with authorization. Pipeline-parity and default-branch-equivalence
  are covered by the hub-core compile and parse suites.
- A contract-ownership test fails if `BranchResolveContract` or
  `OpenStepResolverProjection` is redefined outside its canonical owner.

## References

- [Bridge — Step contracts (v3)](../current/bridges/step-contract.md)
- [ADR-005 — Tutorial v3 contract ownership](./ADR-005-tutorial-v3-contract-ownership.md)
- [Tutorial v3 Task 03](../plans/2026-07-14-tutorial-v3-build-tasks/03-minimal-flow.md)
