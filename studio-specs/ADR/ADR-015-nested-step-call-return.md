# ADR-015 — Nested step call/return and assignment yield

**Status:** Accepted  
**Date:** 2026-07-15

## Decision

A nested step is an asynchronous call/return boundary inside one run. An open
parent resolver explicitly activates one direct declared child with
`murrmure_open_child_step({ run_id, parent_step_id, child_step_id,
idempotency_key })`. Activation accepts no input payload.

Successful activation is ordered as one transition: the parent memo becomes
`yielded`, its assignment credential/process authority is revoked, a
`mrmr.step.yielded` event is appended, and only then is the child opened and its
resolver dispatched. One parent may have one working direct child. The required
idempotency key is parent-scoped in effect: exact retries return the original
activation; reuse with different arguments fails.

A child branch with neither `route` nor `resume` returns to its immediate parent,
including a branch named `failed`. `resume: <ancestor>` may target only an
existing ancestor and returns only to an ancestor whose runtime memo is
`yielded`. It does not open, resolve, or validate the ancestor. Explicit
`route: { run: failed }` is the only immediate run-failure effect. A nested
child cannot `route.step` to a sibling or other step; strict apply reports
`NESTED_ROUTE_STEP_FORBIDDEN`.

Return writes canonical `returned_child` context (`step_id`, `branch`,
`iteration`, payload, artifact references), changes the ancestor from `yielded`
to `working`, and appends `mrmr.step.resumed`. It does not append another
`mrmr.step.opened`. The same exclusive `step.opened::{key}` handler binding is
assigned again with reason `resumed`. Shell/script handlers therefore get a new
process and credential; adapter-level agent session reuse is optional. A View
receives refreshed host context through the same host-mediated protocol.

## Consequences

- Parents own their eventual branch resolution and may iterate through children.
- Old and new parent mutation authority never overlap.
- `complete_parent`, `continue_parent`, `goto`, and automatic parent completion
  have no active contract.
- Journal consumers can distinguish open, yield, child resolve, resume, and
  parent resolve without inferring control flow.
- The executable nested build/review fixture is release-blocking conformance.
