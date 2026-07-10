# Bridge — Step contracts (v2.2)

**Status:** Normative — **shipped** (VS-8)  
**Spec:** [step contracts v2.2](../../plans/2026-07-07-step-contracts-unified-state-machine.md)

Murrmure flow steps use **one authoring shape**: optional `role`, optional `presentation`, required `branches`, optional nested `steps`. Flow manifests declare **protocol only** — no `executor.action`, no `invoke:` / `checkpoint:` runtime kinds. **Execution** is owned by the space via [handlers.md](./handlers.md) (`contract_keys` in `.mrmr/space/handlers.yaml`).

---

## Authoring shape (protocol-only)

```yaml
apiVersion: murrmure.flow/v1
name: preview-review
triggers:
  manual: true

steps:
  - id: intake
    description: Human attaches spec markdown.
    presentation:
      view: preview-review-intake
    branches:
      continue:
        schema:
          type: object
          required: [spec_filename, reviewer]
        artifact_slots:
          spec:
            description: Attached spec markdown file
            max_bytes: 1048576
        next: write_spec
      cancel:
        schema: { type: object }
        next: null
        fail_run: true

  - id: write_spec
    description: Agent writes spec to repo.
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: build
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: build
    description: Build site and human review loop until validated.
    role: agent
    orchestration: engine-routed
    steps:
      - id: build-loop
        description: Implement site; resolve when preview URL ready.
        role: agent
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
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: commit
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: commit
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: null
      failed:
        schema: { type: object }
        next: null
        fail_run: true
```

**Execution binding** (space-owned, not in the flow manifest):

```yaml
# .mrmr/space/handlers.yaml
handlers:
  - id: feature_write_spec
    contract_keys: [preview-review.write_spec]
    on: step.opened
    type: shell_spawn
    complete: explicit
    command: cursor agent -p --force {{prompt}}
    prompt: |
      … then murrmure_resolve_step({ run_id, step_id: "write_spec", branch: "completed" })
```

See [handlers.md](./handlers.md) for the full handler schema and contract-key rules.

### Step identity

| Scope | ID | Example |
|-------|-----|---------|
| Top-level | `{step_id}` | `write_spec`, `build` |
| Nested | `{parent}.{child}` | `build.build-loop`, `build.review` |

Contract keys use `{flow_ref}.{qualified_step_id}` — e.g. `preview-review.write_spec`, `preview-review.build.build-loop`.

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
| Explicit `role: agent` or agent step without view | `agent` |
| Neither view nor agent role | `system` |

Agent steps require a matching `step.opened` handler at apply/lint time. Human steps never receive shell dispatch on `step.opened`.

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
✓ Indexed 4 handler(s), 1 flow(s) (1 changed) · catalog flw_preview_review: abc123… (7 steps)
```

`mrmr space status` shows `step_contract_catalog_digest` per indexed flow.

Apply also lints handler coverage: every agent step must have exactly one `step.opened` handler for its contract key (unless scope-only human keys in a multi-key owner handler).

---

## Strict apply linter

`mrmr space apply --strict` fails on:

| Code | Meaning |
|------|---------|
| `LEGACY_STEP_KIND` | Step uses deprecated `invoke:` / `checkpoint:` / `gate:` |
| `HANDLER_MISSING` | Agent step has no matching `step.opened` handler |
| `HANDLER_KEY_CONFLICT` | Multiple handlers match the same contract key |
| `HANDLER_ORPHAN_KEY` | Handler `contract_key` does not match any catalog step |
| `UNKNOWN_MURRMURE_TOKEN` | `{{murrmure.*}}` token not in known set |
| `NEXT_TARGET_NOT_FOUND` | Branch `next` references missing step |
| `GOTO_TARGET_NOT_FOUND` | Nested `goto` references missing sibling |
| `DEAD_STEP` | Step unreachable from flow entry |
| `MIXED_STEP_SHAPE` | Step mixes `branches` with legacy keys |

Known `{{murrmure.*}}` tokens at VS-1:

- `murrmure.run_id`, `murrmure.space_root`, `murrmure.agentStepContract`, `murrmure.inputs.json` (token path after `murrmure.` prefix)
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

CLI equivalent: `mrmr step resolve --run … --step … --branch completed`.

Journal events: `mrmr.step.opened`, `mrmr.step.resolved`.

Step memos use `awaiting_human` for open human steps (no gate entity for step_contract flows).

View SDK `submit(params)` → `POST /v1/runs/{run_id}/steps/{step_id}/resolve` (same handler as `murrmure_resolve_step`). Shell **ViewCanvasHost** binds to `active_human_step` from run memos — not the gate queue.

### ViewCanvasHost binding (VS-3)

| Context field | Source |
|---------------|--------|
| `ctx.run_id` | Active run |
| `ctx.step.step_id` | Step memo with `status = awaiting_human` |
| `ctx.step.branch_names` | Compiled catalog branches |
| View iframe `view_ref` | `presentation.view` denormalized at apply |

Flow human steps do **not** create gate rows. Notifications / “Needs you” query step memos (`human_step` kind) and orchestration gates only.

Submit/cancel from views maps via `mapViewSubmitToResolveStep` → `{ branch, payload }`.

---

## Engine invariants (VS-4)

| Invariant | Behavior |
|-----------|----------|
| Monotonic memos | Terminal step memos (`completed` / `failed`) never regress via journal replay |
| Terminal run reject | `POST …/resolve` on `failed` / `completed` / `cancelled` runs → **409** `RUN_TERMINAL` |
| Handler cancel | Run failure cancels in-flight shell subprocesses and queued handler tasks |
| Split timeouts | Handler `timeout_ms` counts **agent work only**; hub pauses the clock while a nested human step is `awaiting_human` |

Human review may use optional `presentation.expires_at`; it is separate from handler `timeout_ms`.

---

## Step artifacts (VS-6)

Per-step scratch and stable artifact paths under `.mrmr.temp/runs/{run_id}/steps/{qualified}/`.

| Path | Role |
|------|------|
| `steps/{qualified}/work/` | Scratch while step is active |
| `steps/{qualified}/{slot}/{name}` | Stable after resolve promotes `artifacts_out` |

Declare `artifact_slots` on branches; resolve with `artifacts_out: [{ slot, path }]` where `path` is relative to workdir. Views upload via `POST …/work/upload` then resolve (View SDK `submit(params, artifacts?)`).

Prompt tokens: `{{murrmure.step.{qualified}.artifact.{slot}.path}}` and `.transfer_id`.

---

## Migration from invoke/checkpoint/executor.action

1. Remove `executor.action` from flow manifests; bind execution in `.mrmr/space/handlers.yaml` via `contract_keys`.
2. Replace each legacy `invoke:` step with protocol `role: agent` + `branches` (`completed` / `failed`).
3. Replace each `checkpoint:` step with `presentation:` + `branches` (explicit branch names, not `on_resolve.when`).
4. Move review under `build.steps` for nested loop (VS-7).
5. Re-apply with `--strict`; fix linter errors.
6. Mint grant with `step:resolve` (replaces `gate:resolve` for flow steps in VS-2).

Legacy manifests with `invoke:` / `checkpoint:` still index with warnings; **`--strict` fails**. Legacy `murrmure/actions.yaml` is no longer the primary execution path after HANDLER-CUTOVER (2026-07-09).

---

## References

- [handlers.md](./handlers.md) — space execution binding (primary)
- [Unified step contracts v2.2](../../plans/2026-07-07-step-contracts-unified-state-machine.md)
- [action-invoke.md](./action-invoke.md) — headless invoke only (not flow steps)
- [flow-engine.md](./flow-engine.md)
