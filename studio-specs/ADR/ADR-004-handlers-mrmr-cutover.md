# ADR-004 — Space handlers and `.mrmr/` layout cutover

**Status:** accepted (completed 2026-07-09)  
**Date:** 2026-07-09  
**Supersedes:** dual-write period for `actions.yaml` + `hooks.yaml` + `executors.yaml`  
**Amends:** [ADR-003](./ADR-003-space-flow-protocol-v2.md) (execution model)

## Context

Murrmure v2 shipped unified step contracts (ADR-003) but space execution still split across three indexed files (`actions.yaml`, `hooks.yaml`, `executors.yaml`) and flow manifests could reference `executor.action`. Cross-repo federation and strict apply lint require a single execution catalog keyed to protocol contract addresses.

The handlers cutover plan ([2026-07-09-space-handlers-contract-keys-plan.md](../plans/2026-07-09-space-handlers-contract-keys-plan.md)) consolidated space-owned execution.

## Decision

1. **`handlers.yaml` replaces `actions.yaml`, `hooks.yaml`, and `executors.yaml`** as the canonical space execution catalog at `.mrmr/space/handlers.yaml`.
2. **Contract keys** (`{flow_ref}.{qualified_step_id}`) bind handlers to flow step contracts. Event handlers use `contract_keys: []` with `on: event: { type }`.
3. **`.mrmr/` layout** is the canonical space directory. Legacy `murrmure/` paths are rejected by strict apply and docs CI (`DOC-LAYOUT-01`).
4. **Flow manifests carry protocol only** — no `executor.action`, `invoke:`, `gate:`, or `checkpoint:` step kinds. Agent steps use `role: agent` + handler dispatch on `step.opened`.
5. **Strict lint bans `executor.action`** in flow manifests and example trees (`VS-6`).
6. **HANDLER-CUTOVER complete** — dual-write acceptance ended 2026-07-09. New spaces and examples must ship handlers-only.

## Consequences

- Tutorials and examples migrate to `.mrmr/` + `handlers.yaml` (preview-review-v2, team-brief-v2, daily-brief-v2).
- Agent primary path: `murrmure_resolve_step` + `murrmure_list_handlers`; `murrmure_invoke_action` was operator/debug only and is now fully removed (Task 15 Lane A).
- Normative bridge: [bridges/handlers.md](../current/bridges/handlers.md) is the sole step-execution bridge — the former `action-invoke.md` (headless invoke) was removed in the Task 15 v2 cutover (Lane C).
- FDK install/evolution HTTP remains historical (ADR-001); local-first `mrmr space apply` is the only authoring path.

## References

- [handlers.md](../current/bridges/handlers.md)
- [step-contract.md](../current/bridges/step-contract.md)
- [01-local-layout.md](../current/build-capability/01-local-layout.md) — `.mrmr/` filesystem layout
