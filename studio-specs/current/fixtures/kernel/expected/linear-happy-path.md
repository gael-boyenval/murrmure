# Golden: linear happy path

Rule: `fixtures/rules/linear.json`

## Steps

1. `aggregate.create` — scope `scp_test`, rule_ref digest of linear.json, metadata `{ "label": "test" }`
2. `state.transition` — event `start`, expected_revision `0`

## Expected aggregate after step 2

- `state`: `running`
- `revision`: `1`
- `status`: `active`

## Expected journal entry types (in order)

1. `aggregate.created` — outcome success
2. `transition.applied` — outcome success, payload includes `from: idle`, `to: running`, `event: start`

## Expected transition.denied on illegal event

Command: `state.transition` event `finish` while state `idle`, revision `0`

- http_semantic: 409
- code: `transition_denied`
- denial.context.legal_transitions_for_actor`: includes `{ event: "start", to: "running" }`
- journal: append `transition.denied` outcome denial
- snapshot: unchanged (still idle, revision 0)
