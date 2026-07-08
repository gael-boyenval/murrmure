# Bridge — Step contracts (v2.2)

**Status:** Normative (VS-1 — compile + catalog; resolve runtime ships VS-2+)  
**Spec:** [step contracts v2.2](../../plans/2026-07-07-step-contracts-unified-state-machine.md)

Murrmure flow steps use **one authoring shape**: optional `executor`, optional `presentation`, required `branches`, optional nested `steps`. There is no parallel `invoke:` / `checkpoint:` runtime kind in the target model.

---

## Authoring shape

```yaml
apiVersion: murrmure.flow/v1
name: preview-review
triggers:
  manual: true
start:
  manual: true   # deprecated — migrate to triggers:

steps:
  - id: intake
    description: Human attaches spec markdown.
    presentation:
      view: preview-review-intake
    branches:
      continue:
        schema: { type: object, required: [spec_filename] }
        next: write_spec
      cancel:
        schema: { type: object }
        next: null
        fail_run: true

  - id: write_spec
    description: Agent writes spec to repo.
    executor:
      action: feature_write_spec
      params:
        spec_filename: "{{input.spec_filename}}"
    branches:
      completed:
        schema: { type: object }
        next: build
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: build
    description: Build and review loop until validated.
    orchestration: engine-routed   # default
    executor:
      action: feature_build
      params:
        spec_filename: "{{input.spec_filename}}"
    steps:
      - id: build-loop
        description: Implement site; resolve when preview URL ready.
        branches:
          completed:
            schema:
              type: object
              required: [preview_url]
              properties:
                preview_url: { type: string }
            goto: review
          failed:
            schema: { type: object }
            fail: true

      - id: review
        description: Human validates preview — wait; do not resolve yourself.
        presentation:
          view: preview-review
          assignees: ["{{input.reviewer}}"]
        branches:
          validated:
            schema: { type: object }
            complete: parent
          changes_required:
            schema: { type: object }
            continue: parent
            goto: build-loop
          cancel:
            schema: { type: object }
            fail: true
    branches:
      completed:
        schema: { type: object }
        next: archive
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: archive
    executor: { action: feature_archive }
    branches:
      completed: { schema: { type: object }, next: commit }
      failed: { schema: { type: object }, next: null, fail_run: true }

  - id: commit
    executor: { action: feature_commit }
    branches:
      completed: { schema: { type: object }, next: null }
      failed: { schema: { type: object }, next: null, fail_run: true }
```

### Step identity

| Scope | ID | Example |
|-------|-----|---------|
| Top-level | `{step_id}` | `write_spec`, `build` |
| Nested | `{parent}.{child}` | `build.build-loop`, `build.review` |

### Branch routes

**Top-level** (`next`, `fail_run`):

| Field | Effect |
|-------|--------|
| `next: <step_id>` | Engine opens next top-level step |
| `next: null` | Run completes (success branch) |
| `fail_run: true` | Fail the run |

**Nested** (local only — never reference top-level ids like `archive`):

| Field | Effect |
|-------|--------|
| `complete: parent` | Close nested graph; resolve parent success |
| `continue: parent` | Merge child output; parent stays active |
| `goto: <child_id>` | Engine opens sibling child |
| `fail: true` | Fail parent + run |

### Role derivation (compile-time)

| Condition | `role` |
|-----------|--------|
| `presentation.view` set | `human` |
| `executor.action` set (no view) | `agent` |
| Neither | `system` |

---

## StepContractCatalog (apply-time)

`mrmr space apply` compiles a **StepContractCatalog** per flow and stores it on the space index entry (`step_contract_catalog`).

```json
{
  "flow_id": "flw_preview_review",
  "digest": "sha256:…",
  "graph_digest": "sha256:…",
  "step_ids": ["intake", "write_spec", "build", "build.build-loop", "build.review", "archive", "commit"],
  "entries": [
    {
      "step_id": "build.build-loop",
      "parent_id": "build",
      "role": "agent",
      "branches": {
        "completed": {
          "schema_ref": "murrmure.schemas/inline.completed.v1.json",
          "routes": [{ "engine": "goto", "step_id": "review" }]
        }
      }
    }
  ]
}
```

CLI surfaces the catalog digest on apply:

```text
✓ Indexed 5 action(s), 1 flow(s) (1 changed) · catalog flw_preview_review: abc123… (7 steps)
```

`mrmr space status` shows `step_contract_catalog_digest` per indexed flow.

---

## Strict apply linter

`mrmr space apply --strict` fails on:

| Code | Meaning |
|------|---------|
| `LEGACY_STEP_KIND` | Step uses deprecated `invoke:` / `checkpoint:` / `gate:` |
| `UNKNOWN_MURRMURE_TOKEN` | `{{murrmure.*}}` token not in known set |
| `NEXT_TARGET_NOT_FOUND` | Branch `next` references missing step |
| `GOTO_TARGET_NOT_FOUND` | Nested `goto` references missing sibling |
| `DEAD_STEP` | Step unreachable from flow entry |
| `MIXED_STEP_SHAPE` | Step mixes `branches` with legacy keys |

Known `{{murrmure.*}}` tokens at VS-1:

- `murrmure.run_id`, `murrmure.space_root`, `murrmure.agentStepContract`, `murrmure.inputs.json`
- `murrmure.step.{qualified}.description|workdir|iteration`
- `murrmure.step.{qualified}.artifact.{slot}.path|transfer_id`

Legacy `{{input.*}}`, `{{origin_space}}`, `{{steps.*}}` tokens are unchanged.

---

## Resolve API (VS-2+)

Agents and views complete steps via **`murrmure_resolve_step`** (`step:resolve` capability):

```http
POST /v1/runs/{run_id}/steps/{step_id}/resolve
```

```json
{
  "branch": "completed",
  "payload": { "preview_url": "http://127.0.0.1:5173" },
  "artifacts_out": [{ "slot": "preview_screenshot", "path": "work/preview.png" }],
  "idempotency_key": "optional"
}
```

Journal events: `mrmr.step.opened`, `mrmr.step.resolved` (wired in VS-2).

---

## Migration from invoke/checkpoint

1. Replace each `invoke:` step with `executor:` + `branches` (`completed` / `failed`).
2. Replace each `checkpoint:` step with `presentation:` + `branches` (explicit branch names, not `on_resolve.when`).
3. Move review under `build.steps` for nested loop (VS-7).
4. Re-apply with `--strict`; fix linter errors.
5. Mint grant with `step:resolve` (replaces `gate:resolve` for flow steps in VS-2).

Until VS-8 cutover, legacy manifests still index (with `LEGACY_STEP_KIND` warnings) but **`--strict` fails**.

---

## References

- [Unified step contracts v2.2](../../plans/2026-07-07-step-contracts-unified-state-machine.md)
- [action-invoke.md](./action-invoke.md)
- [flow-engine.md](./flow-engine.md)
