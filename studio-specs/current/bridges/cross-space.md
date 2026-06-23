# Cross-space — wire bridge

Maps [spec.md](../cross-space/spec.md) to hub-daemon routes.

## HTTP → hub commands

| HTTP | Command |
|------|---------|
| `POST /v1/spaces/{id}/queries/ask` | `query.ask` |
| `POST /v1/spaces/{id}/queries/{qid}/answer` | `query.answer` |
| `GET /v1/spaces/{id}/queries/{qid}` | `query.get` |

## Ask flow

1. Auth + outbound validator (hub architecture Part 11)
2. Append `ask` event to target partition
3. Register sync wait on source for `answer|query_failed` matching `query_id`
4. Target handler or agent calls answer
5. Project response → return to caller with `_attribution`

## MCP tools

```typescript
// query_ask — target_space_id allowed (cross-space exception)
{
  target_space_id: string;
  query_type: string;
  params: object;
  response_schema: JsonSchema;
  timeout_ms?: number;  // max 30_000
}

// query_answer
{
  query_id: string;
  status: "ok" | "failed";
  data?: object;
  reason?: string;
}
```

Platform mutations still forbid `space_id` override in body.

## Denial codes

| code | Meaning |
|------|---------|
| `QUERY_POLICY_DENIED` | inbound/outbound policy |
| `ANSWER_TIMEOUT` | platform 30s watchdog |
| `SCHEMA_VIOLATION` | answer failed projection |
| `TARGET_SPACE_UNREACHABLE` | federation `local_only` (c02-J13) |

Do not emit `POLICY_DENIED` — use `QUERY_POLICY_DENIED` only.

## Routes package

```
packages/studio-hub-daemon/src/routes/cross-space/
  ask.ts
  answer.ts
  get.ts
```

## Federation (XS1)

Ask/answer event types passthrough relay — same envelope as hub S3 federation wire.
