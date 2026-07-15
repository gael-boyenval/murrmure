# Collection example — local directory vs remote references

This is a standalone example fixture (not part of the introductory Tutorial v3
path, which stays singleton). It demonstrates the multi-file artifact
collection contract from Tutorial v3 Task 11.

## Flow

`api-contract-review` declares one bounded collection slot `assets` on the
`intake` step:

- `min_files: 1`, `max_files: 4` — a collection (`max_files > 1`).
- `max_bytes` per file and `max_total_bytes` for the whole collection.
- Each file independently satisfies MIME/extension/byte constraints; duplicate
  normalized filenames fail; submission and manifest preserve deterministic
  order. Archives remain opaque single files.

## Local consumption

The `review` handler binds the collection with the `.directory` token:

```
{{murrmure.step.intake.artifact.assets.directory}}
```

At apply time the runtime materializes one verified consumer input directory at
`.mrmr/dev/runs/{run_id}/steps/review/inputs/assets/` containing every file in
the ordered collection with normalized unique names and digest verification
(all-or-nothing). A `.path` binding on this collection slot is rejected before
spawn (`HANDLER_BINDING_VALUE_MISSING`) and lints as
`ARTIFACT_TOKEN_CARDINALITY_MISMATCH`.

## Remote / federated consumption

A remote review space never receives the producer's local path. It receives
ordered immutable artifact references (transfer ids) and materializes them in
its own run tree. The journaled dispatch audit carries the opaque reference
`artifact:intake:assets:directory` — never a `.mrmr/dev/runs` host path.

## Retention

Terminal local run bytes expire at `ended_at + 7 days`; the run-scratch tree is
garbage-collected while journal metadata and global artifact manifests/refs are
preserved. Active run directories are never collected.
