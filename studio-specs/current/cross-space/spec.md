# Studio cross-space queries

Exposes hub **Ask/Answer** protocol on HTTP and MCP so agents perform typed cross-space reads without `emit_event` hacks.

Hub event types (unchanged): `ask` · `answer` · `query_failed`

**Scope:** XS0 = same hub (normative here). XS1 = cross-hub federation + config UI, deferred to [plans/cross-space-xs1/](../../plans/cross-space-xs1/).

## Problem

| Workaround | Target |
|------------|--------|
| emit_event + subscriber agent | query_ask with declared response schema |
| Broad space:read on target | Target contract inbound_queries allowlist |
| Ad-hoc JSON in payload | Schema strip + query_failed on violation |

## Scope

### XS0 (same hub)

- HTTP ask/answer endpoints
- MCP platform tools `query_ask`, `query_answer`
- Client timeout → `query_failed(ANSWER_TIMEOUT)`
- Response projection per hub architecture Part 11
- `_attribution` injected server-side

- Capability-owned query type `spec_summary@1` (feature-spec), answered by the live capability — see [../build-capability/12-worker-runtime-and-host-bridge.md](../build-capability/12-worker-runtime-and-host-bridge.md) §6

### XS1 — deferred

Moved to [plans/cross-space-xs1/](../../plans/cross-space-xs1/): config `query_policy` editor, cross-hub federation relay, `context_fetch@1`, `openapi_diff_ref@1`.

### Out

- Arbitrary cross-space blob passthrough
- Sync cross-hub wait (fails fast per J13)
- Super-agent orchestrator capability

## New scopes

| Scope | Meaning |
|-------|---------|
| `query:ask` | Initiate cross-space ask from source space |
| `query:answer` | Submit answer in target space |

Added to dynamic MCP catalog when grant includes scopes — see [capability-runtime/spec.md](../capability-runtime/spec.md).

## HTTP API

### POST `/v1/spaces/{source_space_id}/queries/ask`

```json
{
  "target_space_id": "spc_backend_api",
  "query_type": "openapi_diff_ref@1",
  "params": { "endpoint": "/recommendations" },
  "response_schema": {
    "type": "object",
    "required": ["ref"],
    "properties": { "ref": { "type": "string" } },
    "additionalProperties": false
  },
  "timeout_ms": 8000
}
```

Response:

```json
{
  "query_id": "qry_…",
  "status": "ok",
  "data": { "ref": "blob:openapi/rec-v1.diff" },
  "_attribution": { "source_space_id": "…", "answered_by_actor_id": "…" }
}
```

Or `status: "failed"`, `reason: "ANSWER_TIMEOUT" | "QUERY_POLICY_DENIED" | "SCHEMA_VIOLATION"`.

Auth: outbound permission on source + target inbound policy allows query_type.

### POST `/v1/spaces/{target_space_id}/queries/{query_id}/answer`

```json
{
  "status": "ok",
  "data": { "ref": "blob:openapi/rec-v1.diff" }
}
```

Hub validates against registered type schema + ask's `response_schema` intersection.

### GET `/v1/spaces/{source_space_id}/queries/{query_id}`

Status poll via `query.get`.

## HTTP → hub commands

| HTTP | Command |
|------|---------|
| POST …/queries/ask | `query.ask` |
| POST …/queries/{qid}/answer | `query.answer` |
| GET …/queries/{qid} | `query.get` |

Ask flow:

1. Auth + outbound validator
2. Append `ask` event to target partition
3. Register sync wait on source for `answer|query_failed` matching `query_id`
4. Target handler or agent calls answer
5. Project response → return to caller

## MCP tools

```typescript
// query_ask — target_space_id allowed here (cross-space exception)
{ target_space_id, query_type, params, response_schema, timeout_ms? }

// query_answer
{ query_id, status: "ok"|"failed", data?, reason? }
```

Env: `STUDIO_SPACE_ID` = source for ask; answer requires target space token or in-proc handler.

Platform mutations still forbid space_id override in body.

## Denial codes

| code | Meaning |
|------|---------|
| `QUERY_POLICY_DENIED` | inbound/outbound policy |
| `ANSWER_TIMEOUT` | watchdog fired |
| `SCHEMA_VIOLATION` | answer failed projection |
| `TARGET_SPACE_UNREACHABLE` | federation local_only |

## Timeout table

| Layer | Default |
|-------|---------|
| Client `timeout_ms` | max 30_000 |
| Platform cap | 30_000 |
| Type default in contract | optional lower |

## Acceptance — XS-min

Fixtures: [../fixtures/cross-space/same-hub-ask-answer.json](../fixtures/cross-space/same-hub-ask-answer.json), [query-failed-timeout.json](../fixtures/cross-space/query-failed-timeout.json)

1. Spec space asks backend for OpenAPI diff ref — structured response
2. Timeout 100ms → `query_failed` not hang
3. Denied query_type → `QUERY_POLICY_DENIED` + audit denial

## Query policy (normative)

Space setting `query_policy`:

```typescript
interface QueryPolicy {
  inbound_allowlist: Array<{
    source_space_id: string;
    allowed_query_types: string[];  // e.g. "spec_summary@1", "context_fetch@1"
  }>;
  outbound_allowlist?: string[];    // query types this space may ask
  forbidden_topics?: string[];      // semantic deny patterns (c02-J12, c02-J14)
  forbidden_fields?: string[];      // strip from answers (c02-J18)
}
```

**Evaluation order:** outbound allow → inbound allow → query type registered → forbidden_topics → handler → projection strip forbidden_fields → inject `_attribution`.

Open-ended `response_schema` without `additionalProperties: false` rejected for sensitive target spaces (c02-J12).

## Query types (canonical)

| Type | Handler | Answer shape |
|------|---------|--------------|
| `openapi_diff_ref@1` | platform or capability | `{ ref: string }` blob ref |
| `spec_summary@1` | feature-spec | title, version, summary, section_count, published_at — **no body_ref** |
| `context_fetch@1` | knowledge capability | `{ sections: [{ title, content, relevance }] }` max N sections; topic policy (c02-J14) |

Params for `context_fetch@1`: `{ topic: string, max_sections?: number }`.

## Acceptance — XS0 (extended)

4. Extra field in answer stripped (schema strip / projection)
5. feature-spec `spec_summary@1` query type registered and answered

## Federation and XS-full

Deferred — see [plans/cross-space-xs1/](../../plans/cross-space-xs1/).

## Related

- Feature-spec inbound handler: [capabilities/feature-spec.md](../capabilities/feature-spec.md)
- Config query_policy UI: XS1 extension to [config/spec.md](../config/spec.md)
