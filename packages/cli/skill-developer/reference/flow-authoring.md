# Flow authoring (v2.2 step contracts)

Flows live in `.mrmr/flows/{name}/flow.manifest.yaml` — indexed via `mrmr space apply`. Execution is wired separately in `.mrmr/space/handlers.yaml` via `contract_keys`.

## Triggers (when a run may start)

Normative key: **`triggers:`**. Legacy `start:` accepted with deprecation warning.

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
| `events` | Hub creates run when journal event matches |
| `schedule` | Hub scheduler tick |
| `flow_call: true` | Callable via parent flow composition |

**No human UI on triggers.** Put intake/review on steps with `presentation:`.

## Step contracts

Steps declare **branches** (resolve wire), optional **presentation** (human UI), and optional nested **steps** (engine-routed subgraph).

```yaml
steps:
  - id: intake
    presentation:
      view: preview-review-intake
    branches:
      continue:
        schema:
          type: object
          required: [spec_filename, reviewer]
        artifact_slots:
          spec:
            description: Attached spec markdown
        next: write_spec
      cancel:
        schema: { type: object }
        next: null
        fail_run: true

  - id: write_spec
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: build
      failed:
        schema: { type: object }
        fail_run: true
```

Agent steps (`role: agent`) require a handler with matching `contract_key` (`{flow_ref}.write_spec`). Human steps use `presentation:` — resolved via ViewCanvasHost, not handler dispatch on open.

## Nested orchestration

```yaml
  - id: build
    role: agent
    orchestration: engine-routed
    steps:
      - id: build-loop
        role: agent
        branches:
          completed:
            schema:
              type: object
              required: [preview_url]
            goto: review
      - id: review
        presentation:
          view: preview-review
        branches:
          validated:
            schema: { type: object }
            complete: parent
          changes_required:
            goto: build-loop
    branches:
      completed:
        next: archive
```

Qualified step ids: `build.build-loop`, `build.review`. Handlers may list multiple keys for subgraph ownership.

## Resolve wire

Agents and views call **`murrmure_resolve_step`**:

```json
{ "run_id": "run_…", "step_id": "write_spec", "branch": "completed", "payload": {} }
```

Branch names must match manifest `branches:` keys. Payload must validate against branch schema.

## Workflow

```bash
# Edit .mrmr/flows/…/flow.manifest.yaml and handlers.yaml
mrmr space apply          # index + lint warnings
mrmr space apply --strict # fail on warnings (except documented warn-only codes)
mrmr flow run flw_my_flow --input '{"topic":"news"}'
```

## Apply-time lint (selected)

| Code | Meaning |
|------|---------|
| `HANDLER_CONTRACT_KEY_UNCOVERED` | Agent step lacks handler binding |
| `HANDLER_CONTRACT_KEY_UNKNOWN` | Handler key not in flow catalog |
| `UNSUPPORTED_STEP_KIND` | Legacy step kind — migrate to contracts |
| `CHECKPOINT_VIEW_DIST_MISSING` | View `dist/` missing — run view build |
| `DEPRECATED_START_KEY` | Use `triggers:` instead of `start:` |

## Grants

| Capability | Effect |
|------------|--------|
| `flow:run` | Execute flows |
| `flow:read` | Preview graph — no Run button |

Mint: `mrmr grant mint --capabilities flow:run,flow:read`.

## Manifest rules

- `apiVersion: murrmure.flow/v1`
- **No inline script steps** — rejected at apply
- **No `executor.action`** — use handlers + contract_keys
- Templates: `{{steps.id.output.field}}`, `{{input.*}}` in handler params

See [space-directory.md](space-directory.md) and parent `SKILL.md` for handler wiring.
