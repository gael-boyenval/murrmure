# Golden: checkpoint pending creation

Rule: `fixtures/rules/with-checkpoint.json`

## Steps

1. `aggregate.create` — scope `scp_test`, actor `actor_agent`, metadata `{}`
2. `state.transition` — event `submit`, expected_revision `0`

The kernel retains only checkpoint **creation**. A transition whose rule declares a
`checkpoint` quorum pauses the aggregate (`checkpoint_pending`, 202 Accepted) with no
state change. Resolution is no longer a kernel command — advancing the aggregate is owned
by the orchestration gate service (`@murrmure/hub-core` `gates/service`) on the gates
table (see `studio-specs/current/kernel/spec.md` §5.5.1). A `gate.resolve` on the `chk_`
gate id returned here is denied `gate_not_found` (404): the kernel checkpoint has no
gates-table row, so the gates-table resolution path does not advance it and the
checkpoint stays pending.

---

## Expected after step 2 (checkpoint pending — 202)

- `http_semantic`: 202
- `code`: `checkpoint_pending`
- aggregate: state **still `draft`**, revision **0**, status `active`
- journal entry appended: type `checkpoint.created`, outcome `success`, kind `command`
- checkpoint row: status `pending`, quorum `any`, count `1`, assignees `["human:*"]`
- no `checkpoint.resolved` / `checkpoint.vote` / `checkpoint.rejected` entries are appended
