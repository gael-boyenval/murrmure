# Flow authoring (v3, resolver-agnostic step contracts)

Flows live in `.mrmr/flows/{name}/flow.manifest.yaml` — indexed via `mrmr space apply`. A flow is **protocol only**: it describes what happens, not how. Execution and human UI are wired separately in `.mrmr/space/handlers.yaml` via the **`on::key`** binding (`contract_keys` is prompt-scope only).

## Triggers (when a run may start)

`triggers:` is the **only** start-condition field. The removed `start:` and `requires_view` are rejected by the parser with no fallback.

```yaml
triggers:
  manual: true
  flow_call: false
  events:
    - type: mrmr.spec.published
      source: "/spaces/spc_spec"
  schedule: "0 9 * * *"
```

| Trigger | Behavior |
|---------|----------|
| `manual: true` | Shell **Run** + `mrmr flow run` |
| `events` | Hub creates a run when a journal event matches |
| `schedule` | Hub scheduler tick |
| `flow_call: true` | Callable via parent flow composition (`start_flow`) |

`triggers: {}` means **invoke-only**: no independent CLI / Desktop / schedule / external-event start, but authorized orchestration invocation stays valid. **No human UI on triggers.** Spaces bind Views to steps through `handlers.yaml`, not through the portable flow.

## Step contracts (resolver-agnostic)

A step is `id`, optional `description`, optional `branches`, and optional nested `steps` — no `role`, `presentation`, `deriveRole`, or resolver modality. A step with no bound handler is valid and externally resolvable (`resolver: null`).

```yaml
steps:
  - id: intake
    description: Human attaches one spec markdown file.
    branches:
      continue:
        schema:
          type: object
          required: [spec]
        artifact_slots:
          spec:
            description: The spec markdown file
            max_bytes: 1048576
        route: { run: completed }
      cancel:
        schema: { type: object }
        route: { run: failed }

  - id: write_spec
    description: Agent writes spec to repo.
```

### Branch authoring (flat)

Each key under `branches` is an **outcome name** — the `branch` value passed to `murrmure_resolve_step`. A branch is flat: `schema`, `schema_ref`, `artifact_slots`, and optional `route` / `resume` are sibling fields. Wrapper shapes (`payload:`, `outcome:`) and superseded routing keys (`next`, `fail_run`, `goto`, `fail`, `complete`, `continue`) are **rejected**.

| Field | Effect |
|-------|--------|
| `route: { step: <id> }` | Open the target step (top-level or qualified nested id) |
| `route: { run: completed }` | Run ends successfully (canonical terminal success) |
| `route: { run: failed }` | Run fails |
| `resume: <ancestor_id>` | Yield control back to an already-open ancestor (nested loops) |

### Default branches

Omit `branches` for a linear step — the compiler injects `completed` (open next sibling; last step ends the run) and `failed` (fail the run). Injected defaults are semantically identical to explicit `completed` / `failed` branches. Explicit branch maps are exact: `branches: {}` is rejected, and custom top-level branch names require an explicit `route`.

## Nested orchestration

```yaml
  - id: build
    description: Build and review loop.
    steps:
      - id: build-loop
        description: Implement; resolve when preview URL ready.
        branches:
          completed:
            schema:
              type: object
              required: [preview_url]
            route: { step: build.review }
          failed:
            schema: { type: object }
            route: { run: failed }
      - id: review
        description: Human validates preview.
        branches:
          validated:
            schema: { type: object }
            resume: build
          changes_required:
            schema: { type: object }
            route: { step: build.build-loop }
```

Qualified step ids: `build.build-loop`, `build.review`. Contract keys use `{flow_ref}.{qualified_step_id}`. Handlers may list multiple keys for subgraph ownership.

## Open-step lifecycle and resolve wire

A step is **open** while its memo status is `working`. Run detail exposes a generic `open_steps[]` projection with `resolver: string | null`. There is no `awaiting_human` status and no `active_human_step` projection.

Agents, views, and authorized protocol clients call **`murrmure_resolve_step`**:

```json
{ "run_id": "run_…", "step_id": "intake", "branch": "continue", "payload": {}, "artifacts_out": [{ "slot": "spec", "path": "work/spec.md" }] }
```

Branch names must match manifest `branches:` keys. Payload must validate against the branch schema. A token without `step:resolve` is denied.

Required names that match same-branch `artifact_slots` are artifact
requirements, not payload properties. Do not add a fake
`schema.properties.spec`. Each branch owns its slots independently; alternate
branches inherit nothing. Payload/artifact name collisions fail apply.

Artifact slots support `media_types`, normalized `extensions`, `min_bytes`,
`max_bytes`, `min_files`, `max_files` (default 1), and `max_total_bytes`.
Views submit browser files with
`submitBranch("continue", { files: { spec } })`; never base64-encode files or
call Hub upload/resolve APIs from a View. Use `submission` for progress and
`submission.cancel()` to abort an in-flight upload while leaving the step open.
Top-level `cancel()` resolves the workflow cancel branch.

## Workflow

```bash
# Edit .mrmr/flows/…/flow.manifest.yaml and handlers.yaml
mrmr space apply          # index + lint warnings
mrmr space apply --strict # fail on warnings (except documented warn-only codes)
mrmr flow run flw_my_flow --input '{"topic":"news"}'
```

## Apply-time lint (selected)

**Hard-rejected at parse** (HTTP 400, no `--strict` needed):

| Code | Meaning |
|------|---------|
| `LEGACY_START_KEY` | Top-level `start:` removed — use `triggers:` (including dual `start` + `triggers`) |
| `LEGACY_REQUIRES_VIEW` | `requires_view` removed — bind Views through `handlers.yaml` |
| `LEGACY_STEP_KIND` | Legacy `invoke:` / `checkpoint:` / `gate:` step kind |
| `REMOVED_FIELD` | Removed step/branch key (`role`, `presentation`, `next`, `fail_run`, `goto`, `fail`, `payload`, `outcome`, …) |
| `EMPTY_BRANCHES` | `branches: {}` — omit for defaults or declare at least one |
| `INLINE_SCRIPT_STEP` | Inline `script` / `run` / `shell` / `command` step |

**`--strict` warnings** (print by default; exit 1 under `--strict`):

| Code | Meaning |
|------|---------|
| `CUSTOM_BRANCH_REQUIRES_ROUTE` | Custom top-level branch has no explicit `route` |
| `DEAD_STEP` | Step unreachable from flow entry |
| `HANDLER_ORPHAN_KEY` | Handler `contract_key` not in flow catalog |
| `PAYLOAD_ARTIFACT_NAME_COLLISION` | Same branch declares one name as payload property and artifact slot |
| `INVALID_BRANCH_SCHEMA` | Schema uses unsupported Draft 2020-12 features, remote refs, or an unapproved format |

## Grants

| Capability | Effect |
|------------|--------|
| `flow:run` | Execute flows |
| `flow:read` | Preview graph — no Run button |
| `step:resolve` | Resolve open steps (required to call `murrmure_resolve_step`) |

Mint: `mrmr grant mint --capabilities flow:run,flow:read,step:resolve`.

## Manifest rules

- `apiVersion: murrmure.flow/v1` is the sole clean target (no dual parser)
- **No inline script steps** — rejected at apply
- **No `executor.action`** — use handlers + `on::key` binding
- **No `start`, `requires_view`, `role`, `presentation`** — rejected by the strict schema
- Templates: `{{steps.id.output.field}}`, `{{input.*}}` in handler params

See [space-directory.md](space-directory.md) and parent `SKILL.md` for handler wiring, and the [step-contract bridge](../../../../../studio-specs/current/bridges/step-contract.md) for the normative contract.
