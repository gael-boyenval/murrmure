# Golden: checkpoint happy path

Rule: `fixtures/rules/with-checkpoint.json`

## Steps

1. `aggregate.create` — scope `scp_test`, actor `actor_agent`, metadata `{}`
2. `state.transition` — event `submit`, expected_revision `0`
3. `checkpoint.resolve` — decision `approved`, resolver actor `actor_human`

---

## Expected after step 2 (checkpoint pending — 202)

- `http_semantic`: 202
- `code`: `checkpoint_pending`
- aggregate: state **still `draft`**, revision **0**, status `active`
- journal entry appended: type `checkpoint.created`, outcome `success`, kind `command`
- checkpoint row: status `pending`, quorum `any`, count `1`, assignees `["human:*"]`

---

## Expected after step 3 (checkpoint resolved — 200)

- `http_semantic`: 200
- aggregate: state `awaiting_approval`, revision `1`, status `active`
- journal entries appended (in order):
  1. type `checkpoint.vote`, outcome `success` — partial approval record
  2. type `checkpoint.resolved`, outcome `success` — quorum met + transition committed
- checkpoint row: status `resolved`

---

## Concurrent resolve race (optional, R4+ test)

Two concurrent `checkpoint.resolve` calls with `approved`:

- One wins: commits as above
- Loser: `http_semantic` 409, code `checkpoint_already_resolved`
- Journal: only one `checkpoint.vote` + one `checkpoint.resolved` appended

---

## Stale checkpoint resolve (K13 test)

Sequence:
1. Aggregate transitions to `awaiting_approval` via checkpoint
2. An out-of-band mechanism resets aggregate state (not possible via kernel FSM, so simulate via persistence manipulation in test)
3. `checkpoint.resolve` attempt → state mismatch at CAS

Expected:
- outcome: denial
- code: `transition_stale`
- journal: `transition.denied` appended with `code: transition_stale`
- checkpoint row: unchanged (still `pending`)
