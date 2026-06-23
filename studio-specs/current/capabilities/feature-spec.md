# Feature-spec capability

Reference capability for **structured spec documents**: agents and humans collaborate on sections, publish a versioned spec, emit **`spec.published`** for triggers.

Complements review-loop — no preview iframe or comment rounds. `spec.published` complements generic `work.ready` (OpenAPI handoff).

## When to use which signal

| Situation | Use | Example |
|-----------|-----|---------|
| Ad-hoc API/OpenAPI diff ready | `work.ready` + blob ref | c01-J02 Liam → Dev |
| Structured product spec approved | `spec.published` | c01-J20 Smart Sprint step 1 |
| UI/design review on a build | review-loop capability | c01-J01 |
| Agent needs spec summary from another space | `query_ask` / `spec_summary@1` | c02-J14 — **not** wake payload body_ref |

Both `work.ready` and `spec.published` may coexist in one org. Triggers are independent.

**Package id:** `feature-spec` · **Contract ref:** `cref_feature_spec`

## Instance model

- **`spec_key`** = hub `instance_id`
- One instance = one spec document in flight
- Metadata bag validated by contract `metadata_schema`
- Sections: map keyed by section id; each requires `title`, `body`, `order`

## State machine

| State | Kind | UX |
|-------|------|-----|
| `gathering_context` | active | Collecting inputs, links, constraints |
| `draft` | active | Editable sections |
| `in_review` | active | Human gate optional |
| `published` | active | Frozen until admin `revise_spec`; emits event on enter |
| `archived` | terminal | Retired |

### Transitions

| Event | From → To | Actors | Guards |
|-------|-----------|--------|--------|
| `open_spec` | (create) → `gathering_context` | agent, human | — |
| `context_ready` | `gathering_context` → `draft` | agent, human | — |
| `submit_for_review` | `draft` → `in_review` | agent, human | — |
| `request_changes` | `in_review` → `draft` | human | role from config approver |
| `approve_spec` | `in_review` → `published` | human | role from config |
| `publish_direct` | `draft` → `published` | human | guard: `skip_review: true`; gate: approver role |
| `revise_spec` | `published` → `draft` | human admin | increments `version` |
| `archive_spec` | `published` → `archived` | human admin | — |

**Governance:**

- When `skip_review: false`, `draft → published` only via `submit_for_review → approve_spec`
- `publish_direct` MUST carry `guard: { config_eq: { skip_review: true } }`
- Approver roles from verified token grant — never from request body

### On enter `published`

```json
{
  "type": "spec.published",
  "payload": {
    "spec_id": "ins_…",
    "spec_key": "ins_…",
    "title": "…",
    "version": 1,
    "summary": "…",
    "body_ref": "blob:spec/…",
    "section_count": 5,
    "published_by": "act_…"
  }
}
```

- **summary:** `metadata.spec.summary` or first 512 chars of overview/lowest-order section
- **published_by:** server-set verified actor id — required
- **body_ref:** always in **event journal**; consumers in other spaces use `query_ask` — never forwarded in mcp_wake default template

## MCP tools by version

| Version | Tools |
|---------|-------|
| 1.0.0 | `open_spec`, `get_spec`, `patch_spec_section`, `publish_spec` |
| 1.1.0 | + `add_context_ref`, `transition_spec` |

`revise_spec` / `archive_spec` invoked via `transition_spec` — not separate tool names.

| Tool | Behavior |
|------|----------|
| `open_spec` | Create instance + optional title |
| `get_spec` | Project SpecJson |
| `patch_spec_section` | metadata patch one section |
| `add_context_ref` | append to context_refs (v1.1.0+) |
| `transition_spec` | Any contract transition event |
| `publish_spec` | shorthand → `publish_direct` or `approve_spec` |

## HTTP routes

Prefix: `/api/specs` — auth same as review.

| Method | Path | Hub operations |
|--------|------|----------------|
| GET | `/api/specs` | `instance.list` filter `cref_feature_spec` |
| POST | `/api/specs` | `instance.create` + `open_spec` |
| GET | `/api/specs/{key}` | `instance.get` → SpecJson |
| PATCH | `/api/specs/{key}` | `instance.metadata.patch` |
| POST | `/api/specs/{key}/sections` | metadata patch sections |
| PATCH | `/api/specs/{key}/sections/{id}` | update section |
| POST | `/api/specs/{key}/context-refs` | append context_refs |
| POST | `/api/specs/{key}/publish` | transition to published; `Idempotency-Key` |
| GET | `/api/specs/{key}/events` | SSE capability-local |

## SpecJson projection

```typescript
interface SpecJson {
  protocol_version: "1";
  spec_key: string;
  title: string;
  state: SpecState;
  version: number;
  summary?: string;
  sections: Record<string, { title: string; body: string; order: number }>;
  context_refs: Array<{ kind: "url" | "blob"; ref: string; label?: string }>;
  target_repo?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}
```

## Tool scopes

| Tool / route | Required |
|--------------|----------|
| `open_spec`, POST | `state:transition` + ACL `feature-spec` |
| `get_spec`, GET | `space:read` + ACL |
| section PATCH | `state:transition` + ACL (draft/gathering only) |
| publish | `state:transition` + ACL + role gate |
| revise/archive | `transition_spec` + admin role |

Env: `STUDIO_SPACE_ID` — no space_id arg.

## Cross-space (inbound queries)

Answers `spec_summary@1` in its space:

- Contract: `inbound_queries.spec_summary@1`
- Source space on target `query_policy.inbound_allowlist`
- Response: title, version, summary, section_count, published_at — **never** `body_ref`
- **Redaction (c02-J18):** strip client names from free-text fields; use `source_context: "from past project work"` not client id

## Shell UI

Route: `/spaces/:spaceId/specs/:specKey`

| Panel | Content |
|-------|---------|
| Header | Title, state chip, version |
| Context | context_refs list |
| Sections | Editable markdown (human) / read-only when not draft |
| Actions | Submit for review, Publish (role-gated), Revise (admin) |

## SSE (capability-local)

Events: `spec.section_changed`, `spec.state_changed`, `ready`.

## Config schema (install)

| Field | Default |
|-------|---------|
| `skip_review` | false |
| `required_approver_role` | `spec_approver` |
| `default_target_repo` | optional |

## Packages

```
examples/capabilities/feature-spec/   CDK reference (contract/, server/, ui/)
```

Contract fixture: [../fixtures/feature-spec/contracts/feature-spec-v1.json](../fixtures/feature-spec/contracts/feature-spec-v1.json)

Mount via [flow-runtime/spec.md](../flow-runtime/spec.md) live apply.

## Acceptance — FS-min

Fixtures: [../fixtures/feature-spec/happy-path-publish.json](../fixtures/feature-spec/happy-path-publish.json), [publish-direct-denied.json](../fixtures/feature-spec/publish-direct-denied.json)

1. Agent `open_spec` → `gathering_context`
2. Agent adds sections → `context_ready` → `draft`
3. Human publish (`skip_review: true`) → `published` + event with `published_by`, `body_ref`
4. `body_ref` always present
5. `publish_direct` rejected when `skip_review: false`

## Acceptance — FS-full

6. Review path: draft → in_review → gate → published
7. MCP `get_spec` after publish read-only
8. Second spec instance — isolated state
9. `revise_spec` → republish v2 — [revise-republish-v2.json](../fixtures/feature-spec/revise-republish-v2.json)
10. `spec_summary@1` without `body_ref` — [spec-summary-query.json](../fixtures/feature-spec/spec-summary-query.json)

Dedup key for triggers: [spec-published-dedup-key.json](../fixtures/feature-spec/spec-published-dedup-key.json)

## Related

- Triggers: [triggers/spec.md](../triggers/spec.md)
- Cross-space: [cross-space/spec.md](../cross-space/spec.md)
