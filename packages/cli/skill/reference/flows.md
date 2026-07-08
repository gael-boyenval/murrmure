# Flow manifests (v2.2 step contracts)

Normative bridge: [step-contract.md](../../../../studio-specs/current/bridges/step-contract.md) in the monorepo.

## Target shape (v2.2)

One step block per id — no parallel `invoke:` / `checkpoint:` kinds:

```yaml
steps:
  - id: intake
    presentation:
      view: preview-review-intake
    branches:
      continue: { schema: { type: object }, next: write_spec }
      cancel: { schema: { type: object }, next: null, fail_run: true }

  - id: write_spec
    executor:
      action: feature_write_spec
      params:
        spec_filename: "{{input.spec_filename}}"
    branches:
      completed: { schema: { type: object }, next: build }
      failed: { schema: { type: object }, next: null, fail_run: true }
```

### Nested steps (build + review loop)

```yaml
  - id: build
    orchestration: engine-routed
    executor:
      action: feature_build
    steps:
      - id: build-loop
        branches:
          completed: { schema: { type: object }, goto: review }
          failed: { fail: true }
      - id: review
        presentation:
          view: preview-review
        branches:
          validated: { complete: parent }
          changes_required: { continue: parent, goto: build-loop }
    branches:
      completed: { next: archive }
      failed: { next: null, fail_run: true }
```

Qualified ids: `build.build-loop`, `build.review`.

## Apply + catalog

```bash
mrmr space apply          # compile StepContractCatalog; print digest
mrmr space apply --strict # fail on legacy invoke/checkpoint, bad tokens, dead steps
mrmr space status         # shows step_contract_catalog_digest per flow
```

## Strict linter codes

| Code | Fix |
|------|-----|
| `LEGACY_STEP_KIND` | Migrate to `executor` / `presentation` + `branches` |
| `UNKNOWN_MURRMURE_TOKEN` | Use documented `{{murrmure.*}}` tokens only |
| `DEAD_STEP` | Wire `next` / `goto` so every step is reachable |
| `NEXT_TARGET_NOT_FOUND` | Fix branch target step id |

## Grants (VS-2+)

```bash
mrmr grant mint --capabilities flow:run,flow:read,action:invoke,step:resolve,space:read,journal:read
```

Flow step completion uses `murrmure_resolve_step` — not legacy complete-action or gate-wait MCP tools.
