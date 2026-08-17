# Tutorial 1b (meetings) progressive fixture

Executable source for Tutorial 1b. Each snapshot is a complete two-space
tree after recursively applying its `extends` chain:

1. `part-2/snapshot.json` — both spaces: `space.yaml`, empty handlers, personas;
2. `part-3/snapshot.json` — app `api-shape` flow (`meeting:` + human chair);
3. `part-5/snapshot.json` — scoped `mrmr.meeting.said` handlers on both spaces;
4. `part-6/snapshot.json` — designer chair, `implement` step + shell handler.

`files` maps paths relative to a two-root tree (`meeting-app/…`,
`meeting-research/…`). `snippets` are documentation fragments that are not
always materialized as whole files (Part 1 setup, Part 6 handler append).

Fence marker: `<!-- tutorial-meetings-fence:<id> -->` (not `tutorial-v3-fence`).
Registry: `fences.json`. Manual beats: `tutorial-beats.json`.
