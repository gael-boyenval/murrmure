# preview-review-v2 (test fixture)

Release-blocking strict-apply fixture for `preview-review-v2-example.test.ts` and
`docs-proof`. Its `build` parent explicitly activates `build.build-loop` and
`build.review`, yields between assignments, consumes `returned_child`, iterates
after `changes_required`, and owns final resolution.

Not linked from `apps/docs/`. User walkthrough:
[Tutorial 1a — First flow (v3)](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/).
The v2 preview-review tutorial (1b) is archived under
`studio-specs/archives/superseded/tutorials/`.
