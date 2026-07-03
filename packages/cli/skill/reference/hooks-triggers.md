# Hooks & triggers

Two related concepts — don't conflate them:

| Concept | Location | Meaning |
|---------|----------|---------|
| **Flow triggers** | `triggers:` in `flow.manifest.yaml` | When a **run** may be created for that flow |
| **Space hooks** | `murrmure/hooks.yaml` | Hub reactions to journal events / schedules |

## Flow triggers (manifest)

Normative top-level key: **`triggers:`** (legacy `start:` accepted with `DEPRECATED_START_KEY` warning).

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

| Field | Behavior |
|-------|----------|
| `manual: true` | Shell **Run** button + `mrmr flow run` |
| `events` | Hub creates run when journal event matches |
| `schedule` | Cron tick — no separate UI |
| `flow_call: true` | Callable via parent `start_flow` step |
| `idempotency` | Dedup key for repeated triggers |

**No human UI on triggers.** Human interaction belongs on **checkpoint steps** only ([decision 05](../../../../studio-specs/plans/product/plan/decisions/05-triggers-only-checkpoint-steps.md)).

## Space hooks (hooks.yaml)

```yaml
version: 1
hooks:
  - id: on-spec-published
    on:
      type: mrmr.spec.published
    do:
      start_flow:
        flow_id: flw_handle_spec
        input:
          spec_id: "{{event.data.spec_id}}"
```

| Reaction | Effect |
|----------|--------|
| `invoke` | Call an action |
| `start_flow` | Create a run for an indexed flow |
| `extend_session` | Attach work to existing session |

Alias: `triggers.yaml` is accepted as `hooks.yaml`.

## Workflow

```bash
# Edit murrmure/hooks.yaml and/or flow triggers
mrmr space apply --strict
mrmr space status   # confirm hook + flow digests
```

Legacy `mrmr space trigger` → define hooks in YAML and apply.

See [flow-authoring.md](flow-authoring.md), [space-directory.md](space-directory.md).
