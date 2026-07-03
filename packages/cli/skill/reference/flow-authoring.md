# Flow authoring (v2)

Murrmure v2 flows live in the **space directory** — indexed via `mrmr space apply`.

## Layout

```text
murrmure/flows/{name}/flow.manifest.yaml
```

## Triggers (when a run may start)

Normative key: **`triggers:`**. Legacy `start:` accepted with `DEPRECATED_START_KEY` warning.

```yaml
triggers:
  manual: true
  flow_call: false
  events:
    - type: mrmr.spec.published
      source: "/spaces/spc_spec"
  schedule: "0 9 * * *"
  idempotency: run_key
```

| Trigger | Behavior |
|---------|----------|
| `manual: true` | Shell **Run** button + `mrmr flow run` |
| `events` | Hub creates run when journal event matches |
| `schedule` | Hub scheduler tick |
| `flow_call: true` | Callable via parent `start_flow` step |

**No human UI on triggers.** Put intake/review views on **checkpoint steps**. See [hooks-triggers.md](hooks-triggers.md).

## Workflow

```bash
# Edit murrmure/flows/…/flow.manifest.yaml
mrmr space apply          # index + compile IR; prints apply lint warnings
mrmr space apply --strict # fail on lint warnings (except DEPRECATED_START_KEY, CHECKPOINT_LOOPBACK_HINT)
mrmr flow run flw_my_flow --input '{"topic":"news"}'
```

## Apply-time warnings (phase 01)

| Code | Meaning |
|------|---------|
| `UNSUPPORTED_STEP_KIND` | Step kind not in engine dispatch |
| `CHECKPOINT_VIEW_DIST_MISSING` | View referenced but `dist/` missing — run `npm run build` |
| `CHECKPOINT_ON_RESOLVE_DEFAULT_MISSING` / `CANCEL_MISSING` | Explicit routing required |
| `DEPRECATED_START_KEY` | Use `triggers:` instead of legacy `start:` (warn-only under `--strict`) |

## Grants

| Capability | Effect |
|------------|--------|
| `flow:run` | See in **Available to run** + execute |
| `flow:read` | Sanitized preview — no Run button |

Mint: `mrmr grant mint --capabilities flow:run,flow:read`.

## Step types

| Step | Purpose | Engine dispatch |
|------|---------|-----------------|
| `invoke` | Call a space action | ✅ |
| `checkpoint` / `gate` | Human checkpoint — pending gate + pause | ✅ |
| `parallel.matrix` | Fan-out lanes | ✅ |
| `start_flow` | Call another indexed flow as sub-run | ✅ |

**Templates:** `{{steps.id.output.field}}` resolves after the referenced step completes.

### Checkpoint steps

```yaml
steps:
  - id: review
    checkpoint:
      view: preview-review
      assignees: ["{{input.reviewer}}"]
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
        default: { goto: done }
        cancel: { fail: true }
```

**Resolve wire:** `{ disposition: "continue" | "cancel", output?: {...} }`. See [gates.md](gates.md).

## Flow-call composition (`start_flow`)

```yaml
steps:
  - id: review
    start_flow:
      flow_id: flw_review_url
      input:
        url: "{{steps.dev.output.preview_url}}"
      wait: true
```

Child flow must set `triggers.flow_call: true`.

## Manifest rules

- `apiVersion: murrmure.flow/v1`
- **No inline script steps** — rejected at apply time
- Cross-space invokes use explicit `space:` on each step

See [space-directory.md](space-directory.md), [grants.md](grants.md), [views.md](views.md).
