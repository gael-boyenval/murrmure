# 08 — Run a nested build/review loop

**Status:** Ready  
**Build order:** 08  
**Depends on:** 07  
**Source work packages:** nested subset of T03, T05, T07, T11

## Goal

Deliver nested orchestration as a complete call/return capability: an open parent resolver activates one declared child, yields, receives the validated child result on resume, may iterate through another child, and eventually resolves its own contract.

## User stories

- As a flow author, a nested child returns control to its parent by default without resolving the parent.
- As a parent resolver, I can activate one declared child at a time and later decide whether to iterate or resolve.
- As an operator, journal state distinguishes child open, parent yield, child resolution, parent resume, and parent resolution.
- As an agent or View author, returned-child context is consistent across resolver types.
- As a security reviewer, stale parent assignments cannot mutate after yielding or open undeclared steps.

## Contracts

- Child branch with neither `route` nor `resume` resumes its immediate parent by default, including `failed`.
- `resume: <ancestor_step>` returns to an already-open ancestor; apply rejects self, unknown, non-ancestor, or closed targets.
- Immediate run failure requires explicit `route: { run: failed }`.
- Resume never opens or resolves the ancestor and never validates the ancestor's branch contract.
- Parent receives canonical returned-child identity, branch, iteration, payload, and artifact references.
- Parent resolver may call `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })`.
- Child activation accepts no arbitrary input, targets only declared children, and permits one active child per parent.
- Successful child open atomically yields the current parent assignment and revokes its mutation credential.
- Child return creates one fresh parent assignment with reason `resumed`; no duplicate `step.opened` and no overlapping old/new authority.
- Shell/script resume is a new process invocation. Agent-session reuse is optional adapter behavior. A View resolver refreshes context in place.
- Remove `complete_parent`, `continue_parent`, `goto`, and automatic parent completion.

## Implementation

- Add nested normalization/compiled routes and ancestor validation.
- Add canonical resume/yield journal events and returned-child projection.
- Implement idempotent, parent-scoped `murrmure_open_child_step` across domain, MCP, and authorized clients.
- Make child open, parent yield, credential revocation, and child dispatch one atomic transition.
- Reinvoke the same exclusive handler binding on resume with reason/context.
- Extend View context/host operation and agent prompt rendering for declared children and returned child.
- Remove old nested parent-completion/goto machinery.
- Add an executable nested build/review fixture or tutorial extension without changing the simple introductory path unnecessarily.
- Treat the nested fixture as release-blocking conformance even when it remains an advanced example rather than a required Part 1–6 reader action.

## Testing

### Automated

- Compile/apply tests for implicit immediate-parent resume, explicit ancestor resume, nested failed return, explicit run failure, and invalid targets.
- Parent activation authorization, undeclared target, arbitrary input rejection, one-active-child race, and idempotency mismatch.
- Atomic yield tests prove stale writes fail before child dispatch and only one fresh resumed assignment appears.
- No duplicate parent `step.opened`, no implicit parent resolution, and parent contract validation only on parent resolve.
- Shell fresh-process, optional agent-session reuse, and View in-place-refresh parity.
- Resumed prompt/View context includes exact returned-child data and declared children.
- Absence guards for `complete_parent`, `continue_parent`, `goto`, and automatic parent completion.

### Manual

- Run a parent build resolver that opens review, receives a requested-change result, opens another build/review iteration, and finally resolves itself.
- Observe journal and UI through every transition.
- Attempt a second active child, an undeclared child, stale parent mutation, and idempotency-key reuse with different arguments.
- Repeat once with an agent parent and once with a View parent.

## Documentation, skills, specs, and ADRs

- **ADR required:** nested step call/return, parent yield, and resolver resume semantics.
- **Normative specs:** step-contract control flow, handler resume lifecycle, MCP child activation, journal events.
- **User docs:** `creating-flows.md`, multi-agent/nested workflow guidance.
- **Tutorial:** keep Part 5 terminology consistent and link the executable advanced example if the introductory path does not demonstrate the loop. The advanced fixture remains a release gate either way.
- **Skills:** flow authoring, agent parent-resolver protocol, View child activation.
- **Scaffolds/examples:** nested build/review fixture.
- **Enforcement:** compile/runtime race, prompt/context parity, and removed-pattern guards.
- **Changelog:** nested call/return protocol and removed parent-completion vocabulary.

## References

- [Flow branch API simplification](../2026-07-10-flow-branch-api-simplify.md)
- [Default branches](../2026-07-10-step-default-branches.md)
- [Handler authoring simplification](../2026-07-10-handler-authoring-simplify.md)
- [Agent prompt protocol](../2026-07-10-agent-prompt-protocol-simplify.md)
- [Coordinating plan T03/T05/T07/T11](../2026-07-13-tutorial-v3-full-alignment.md)

## Done gate

- Parent/child iteration works through real resolvers and the canonical journal.
- Child return never resolves, reopens, or validates the parent.
- Successful child activation yields and revokes the old assignment atomically.
- Only declared children can open, one at a time, with deterministic idempotency.
- Agent, shell, and View resolver semantics differ only in adapter lifecycle, not protocol state.
- Removed nested-control vocabulary has no active path.
- The release suite executes the nested conformance fixture even if Parts 1–6 retain the simpler linear walkthrough.

