# Feature-spec — wire bridge

Maps [feature-spec.md](../capabilities/feature-spec.md) to packages. Mount at `/api/specs` via capability-runtime live apply.

## HTTP → hub-core

| HTTP | Hub operations |
|------|----------------|
| `POST /api/specs` | `instance.create` + transition `open_spec` |
| `GET /api/specs` | `instance.list` filter `cref_feature_spec` |
| `GET /api/specs/{key}` | `instance.get` → SpecJson |
| `PATCH /api/specs/{key}` | `instance.metadata.patch` (title, sections, context_refs) |
| `POST …/sections` | metadata patch sections map |
| `POST …/context-refs` | metadata patch append context_refs |
| `POST …/publish` | `state.transition` → published; `Idempotency-Key` → command_id |

## SpecJson projection

```typescript
function toSpecJson(instance: Instance): SpecJson {
  const spec = instance.metadata.spec as SpecBag;
  return {
    protocol_version: "1",
    spec_key: instance.instance_id,
    title: spec.title ?? "Untitled",
    state: instance.state as SpecState,
    version: spec.version ?? 1,
    summary: spec.summary,
    sections: spec.sections ?? {},
    context_refs: spec.context_refs ?? [],
    target_repo: spec.target_repo,
    created_at: instance.created_at,
    updated_at: instance.updated_at,
    published_at: spec.published_at,
  };
}
```

## MCP → HTTP

| MCP tool | HTTP |
|----------|------|
| `open_spec` | POST `/api/specs` |
| `get_spec` | GET `/api/specs/{key}` |
| `patch_spec_section` | PATCH `/api/specs/{key}/sections/{id}` |
| `add_context_ref` | POST `/api/specs/{key}/context-refs` |
| `transition_spec` | POST `/api/specs/{key}/publish` or internal transition |
| `publish_spec` | POST `/api/specs/{key}/publish` |

`revise_spec` / `archive_spec` → `transition_spec` with contract event name.

## Inbound query handler

Answers `spec_summary@1` when cross-space ask targets this capability:

- Returns title, version, summary, section_count, published_at
- **Never** `body_ref`
- Source space on target `query_policy.inbound_allowlist`

## SSE (capability-local)

Events: `spec.section_changed`, `spec.state_changed`, `ready` — UI refresh only.

## Packages

```
examples/capabilities/feature-spec/   CDK reference (contract/, server/, ui/)
```

Contract fixture: [../fixtures/feature-spec/contracts/feature-spec-v1.json](../fixtures/feature-spec/contracts/feature-spec-v1.json)
