# Tutorial v3 progressive fixture

This is the executable source for Tutorial v3. Each snapshot is a complete
logical space after recursively applying its `extends` chain:

1. `part-2/snapshot.json` — trigger-only intake flow;
2. `part-3/snapshot.json` — space-owned intake View resolver;
3. `part-5/snapshot.json` — safe copy and explicit agent build handlers;
4. `part-6/snapshot.json` — repository-safe archive and commit cleanup.

`files` maps space-relative paths to exact file contents. `null` removes an
inherited file. `snippets` contains executable documentation fragments that are
not materialized into the space. Shared helpers under
`test-utils/tutorial-v3/` load and materialize these snapshots in isolated
temporary roots.

The fixture describes the accepted clean target. Later build tasks activate the
skipped assertions that their task IDs own; this harness does not preserve
removed APIs or encode expected failures.

Fence ownership and comparison modes live in `fences.json`. Manual-only beats
are named in `tutorial-beats.json`, and recorded evidence must validate against
`manual-acceptance.schema.json`.

