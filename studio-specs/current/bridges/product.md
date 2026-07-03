---
topic: Studio product — bridge (HTTP, SSE, review, MCP)
date: 2026-06-20
status: active
reference: agentStudio/kernelspecs/hub/studio-kernel-bridge.md
---

# Studio product bridge

Maps product edges → hub-core. Read after hub [studio-kernel-bridge.md](https://github.com/n/a) (`agentStudio/kernelspecs/hub/studio-kernel-bridge.md`).

## Space directory index (v2)

| HTTP | Purpose |
|------|---------|
| `POST /v1/spaces/{id}/link` | Register `{ host, path, primary }` binding |
| `POST /v1/spaces/{id}/apply` | Re-index `murrmure/` bundle from CLI |
| `GET /v1/spaces/{id}/actions` | Indexed actions registry |
| `GET /v1/spaces/{id}/executors` | Indexed executors |
| `GET /v1/spaces/{id}/hooks` | Indexed hooks |
| `GET /v1/spaces/{id}/index/flows` | Flow index entries (includes denormalized `view_ref`) |
| `GET /v1/spaces/{id}/index/status` | Counts + digests for MCP `murrmure_space_status` |
| `GET /v1/flows/{flow_id}` | Single flow index row |

CLI: `mrmr space init` → `link` → `apply` → `status`. See `packages/cli/skill/reference/space-directory.md`.

MCP v2 stubs: `murrmure_apply_space`, `murrmure_space_status`, `murrmure_grant_mint`.

## Auth middleware (all routes)

```typescript
async function requireToken(req: Request, pathSpaceId?: string): Promise<TokenContext | Response> {
  const bare = parseBearer(req);  // tok_* or bare ULID → addTokenId
  if (!bare) return json403(STUDIO_DENIAL_CODES.TOKEN_DENIED);
  const ctx = await policyPort.resolve(bare);
  if (!ctx) return json403(STUDIO_DENIAL_CODES.TOKEN_DENIED);
  if (pathSpaceId && ctx.space_id !== pathSpaceId)
    return json403(STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, { hint: { nearest_space_id: ctx.space_id } });
  return ctx;
}
```

Bootstrap token: `space_id: "bootstrap"` in policy — only for `POST /v1/spaces`. All other routes require real `spc_*` scope.

## Platform HTTP → HubHandler

| HTTP | Command / Query | Notes |
|------|-----------------|-------|
| `POST /v1/spaces` | `space.create` | Bootstrap token only |
| `GET /v1/spaces/{id}` | `query: space.get` | |
| `POST …/instances` | `instance.create` | |
| `GET …/instances/{id}` | `query: instance.get` | |
| `PATCH …/instances/{id}/metadata` | `instance.metadata.patch` | P-ADR-07 |
| `POST …/transitions` | `state.transition` | `Idempotency-Key` → `command_id` |
| `GET …/gates` | `query: gate.list` | |
| `POST …/gates/{id}/resolve` | `gate.resolve` | |
| `POST …/events` | `event.append` | |
| `GET …/events` | `query: event.tail` | `from_seq` query param |
| `POST …/waits` | `wait.register` | |
| `GET …/waits/{id}` | `query: wait.poll` | |
| `GET …/audit/export` | `query: audit.export` | P1 — `since`, `until`, `instance_id` |

## Platform SSE wire format

Endpoint: `GET /v1/spaces/{space_id}/events/subscribe`

```
event: journal.append
data: {"seq":42,"type":"state.transition","instance_id":"ins_…","…": HubEvent fields}

event: gate.pending
data: {"gate_id":"chk_…","instance_id":"ins_…","assignees":[…]}

event: gate.resolved
data: {"gate_id":"chk_…","decision":"approved"}

event: heartbeat
data: {}
```

Translation from journal fan-out:

| Journal `type` | SSE `event` |
|----------------|-------------|
| `state.transition` | `journal.append` |
| `checkpoint.pending` | `gate.pending` |
| `checkpoint.resolved` | `gate.resolved` |
| `wait.matched` | `wait.resolved` |

Implement in `packages/studio-hub-daemon/src/sse.ts`. Reuse kernel fan-out notify hook.

## Review HTTP → hub-core

## Session & Run API (rev-1 §10.1)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/v1/sessions` | Create session (`ses_*`) |
| GET | `/v1/sessions` | List/filter by `status`, `space_id` |
| GET | `/v1/sessions/{id}` | Derived status from child runs |
| GET | `/v1/sessions/{id}/runs` | Runs in session |
| POST | `/v1/sessions/{id}/runs` | Start headless or flow run |
| POST | `/v1/sessions/{id}/cancel` | Cascade cancel (30s cap) |
| GET | `/v1/runs/{id}` | Describe + step memo |
| GET | `/v1/runs/{id}/graph` | Step memo as graph stub |
| POST | `/v1/runs/{id}/cancel` | Cancel single run |
| POST | `/v1/runs/{id}/retry` | New run with `reference_run_ids` |

v1 shim: `POST /v1/spaces/{id}/instances` → Session + Run; `instance_id` aliases `run_id`.

Grants v2: [grants-migration.md](./grants-migration.md).


| HTTP | Hub operations | Notes |
|------|----------------|-------|
| `POST /api/sessions` | `instance.create` + `state.transition(open_review)` optional | Returns `session_key` = `instance_id` |
| `GET /api/sessions` | `query: instance.list` filtered by `contract_ref_id = cref_review_loop` | |
| `GET /api/sessions/{key}` | `instance.get` → project SessionJson | |
| `PATCH /api/sessions/{key}` | `instance.metadata.patch` | `{ target: { url } }`, `{ title }` |
| `POST …/comments` | `instance.metadata.patch` on `metadata.review.threads` | |
| `POST …/comments/{id}/replies` | metadata patch | |
| `PATCH …/comments/{id}` | metadata patch | |
| `POST …/finish` | `state.transition(finish_review)` | |
| `POST …/review-cycle` | `wait.register` + long-poll | See below |

### SessionJson projection

```typescript
function toSessionJson(instance: Instance): SessionJson {
  const review = instance.metadata.review as ReviewBag;
  return {
    protocol_version: "1",
    session_key: instance.instance_id,
    view: review.view ?? "app",
    review_round: review.review_round ?? 1,
    round_state: instance.state as RoundState,  // contract state = round_state
    target: review.target ?? { view: review.view ?? "app" },
    threads: review.threads ?? {},
    created_at: instance.created_at,
    updated_at: instance.updated_at,
  };
}
```

Update capability bundle `contract/` schemas to match contract states (drop `collecting_feedback`, `agent_applying`, `round_closing`).

### Review FSM map (review-loop-v2)

| Review action | Hub event | From → To |
|---------------|-----------|-----------|
| Create session | (create only) | → `awaiting_review` initial |
| Finish review (round 1) | `finish_review` | `awaiting_review` → `awaiting_agent` |
| Agent done + preview update | `agent_done` | `awaiting_agent` → `changes_made` |
| Finish review (round 2) | `finish_review` | `changes_made` → `converged` |
| Request production | `request_production` | `converged` → gate → `production_approved` |

Contract fixture: `fixtures/hub/contracts/review-loop-v2.json`, pin id `cref_review_loop`.

### wait_for_review / review-cycle

```typescript
// POST /api/sessions/{key}/review-cycle
await handler.execute({
  kind: "wait.register",
  provenance: { space_id, instance_id: key, … },
  condition: {
    type: "state",
    state: "awaiting_agent",
    match: "entered",
  },
  delivery_mode: "http_long_poll",
  timeout_ms: body.timeout_ms ?? 300_000,
});
// On match: return ReviewCycleResponse with comments from SessionJson threads
```

Response shape (extend `ReviewCycleResponseSchema`):

```typescript
{
  session_key: string;
  round_state: string;
  comments: Array<{ id, body, author, scope, anchor?, replies[] }>;
  prompt?: string;       // legacy Crit compat — optional
  next_command?: string; // legacy — optional
}
```

## MCP → HTTP

| MCP tool | HTTP | space_id source |
|----------|------|-----------------|
| `transition` | `POST /v1/spaces/{STUDIO_SPACE_ID}/instances/{id}/transitions` | env only |
| `emit_event` | `POST …/events` | env |
| `wait_for_state` | `POST …/waits` + poll | env |
| `get_space_state` | `GET …/instances/{id}` + `GET …/gates` | env |
| `contract_versions` | in-proc query pinned refs | — |
| `create_review_session` | `POST /api/sessions` | env |
| `get_session` | `GET /api/sessions/{key}` | — |
| `wait_for_review` | `POST /api/sessions/{key}/review-cycle` | — |

**No `space_id` in MCP tool args** (P-ADR-06). Use `STUDIO_SPACE_ID` env.

## DaemonContext

```typescript
export interface DaemonContext {
  handler: HubHandler;
  studioPersistence: StudioPersistencePort;
  config: {
    databasePath: string;
    port: number;
    dataDir: string;
    defaultSpaceId: string;
    bootstrapToken?: string;
  };
  capabilities: string[];  // ["review"] after P3
}
```

```typescript
export function mountCapabilities(app: Hono, ctx: DaemonContext): void {
  mountReviewRoutes(app, ctx);
}
```

## Legacy code map

| Legacy | Use for | Do not copy |
|--------|---------|-------------|
| `apps/web` | UI component patterns (SessionView, CommentPanel) | `/api` proxy-only setup |
| `apps/daemon` | Route naming reference | `session-store.ts` disk persistence |
| `deprecated/` US-001 stack | UI/route patterns | disk session-store, in-process mounts |
| `examples/capabilities/review-loop/` | CDK reference — contract + server + UI | — |
| `packages/client` | Review HTTP client pattern | Rename to hub-client for platform only |

## Related

- [P-ADR-04](./adr/P-ADR-04-instance-session-bridge.md)
- [P-ADR-07](./adr/P-ADR-07-instance-metadata-patch.md)
- [studio-product-runtime-delta.md](./studio-product-runtime-delta.md)
