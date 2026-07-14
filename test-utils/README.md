# test-utils

**Not user documentation.** Internal repo fixtures for automated and manual testing only.

| Path | Used by |
|------|---------|
| `spaces/preview-review-v2/` | `packages/cli/test/preview-review-v2-example.test.ts`, `docs-proof` strict apply |
| `spaces/team-brief-v2/` | `docs-proof` (Tutorial 2 tree) |
| `spaces/daily-brief-v2/` | `docs-proof` (Tutorial 3 tree) |
| `spaces/hello-authoring/` | `docs-proof` minimal handlers space |
| `workers/queue-poll-worker.mjs` | Manual queue-poll worker smoke |

User-facing tutorials and guides are self-contained under `apps/docs/`. Do not link `test-utils/` from published docs.
