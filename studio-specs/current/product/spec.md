# Studio product layer

Normative spec for **shell, hub daemon edge, review reference capability, and MCP**. Platform semantics (journal, federation, evolution commands) remain in [hub/architecture.md](../hub/architecture.md).

## Scope

### In

- Hub daemon edge: HTTP, SSE, MCP, CLI, ops
- `@murrmure/shell-web` — browser shell (runtime + capability canvases)
- `@murrmure/hub-client` — typed platform HTTP + SSE client
- Review reference capability (`examples/capabilities/review-loop/`)
- Capability SDK scaffold (validate + install manifest)

### Out

- Kernel changes (`@runtime/*` untouched)
- Multi-tenant OAuth
- Relay wire binary
- Agent LLM loop inside hub
- Théo cross-hub product UI (hub S3 only)
- TLS termination (reverse proxy)

## Architectural decisions

| Decision | Choice |
|----------|--------|
| Capability boundary | Capabilities are separate packages importing hub-core; never add review/board nouns to hub-core or contracts |
| Single daemon mount | One Hono app: `/v1/*` platform, `/api/sessions/*` review, `/api/health` combined |
| Contracts per capability | Capability bundle `contract/` dir owns Zod + MCP shapes; hub contracts stay platform-only |
| Instance ↔ session | `session_key` === `instance_id`; review bag in `instances.metadata.review` |
| Metadata patch | Comment CRUD and preview URL via `instance.metadata.patch` command |
| Unified MCP namespace | One `@studio/hub-mcp` server: platform tools + capability tools; no space_id in tool args |
| Shell capability canvas | Dynamic route `/spaces/:spaceId/sessions/:sessionKey` loads capability UI bundle |

## Persona scope (P0–P5)

| Persona | In scope | Out of scope |
|---------|----------|--------------|
| Dev, Priya, Maya | J01-full (review + shell + production gate) | Grant admin UI |
| Sarah | Event tail + session audit export (J12 subset) | Grant inventory UI, ML alerts |
| Alex | Health + drift query (CLI/API) | Topology map, contract editor |
| Théo | None in product layer | Federation UI, Ask/Answer MCP |

## Auth middleware (all routes)

```typescript
async function requireToken(req: Request, pathSpaceId?: string): Promise<TokenContext | Response> {
  const bare = parseBearer(req);  // tok_* or bare ULID
  if (!bare) return json403(STUDIO_DENIAL_CODES.TOKEN_DENIED);
  const ctx = await policyPort.resolve(bare);
  if (!ctx) return json403(STUDIO_DENIAL_CODES.TOKEN_DENIED);
  if (pathSpaceId && ctx.space_id !== pathSpaceId)
    return json403(STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE, { hint: { nearest_space_id: ctx.space_id } });
  return ctx;
}
```

Bootstrap token: `space_id: "bootstrap"` — only for `POST /v1/spaces`. All other routes require real `spc_*` scope.

Auth: `Authorization: Bearer tok_*` on all routes except `GET /v1/health`. Idempotency: header `Idempotency-Key` → `command_id` on mutating routes.

## Platform HTTP

| Method | Path | Command / Query |
|--------|------|-----------------|
| GET | `/v1/health` | `{ status, version, uptime_s, capabilities[] }` |
| GET | `/health` | Alias → `/v1/health` (deprecated) |
| POST | `/v1/spaces` | `space.create` (bootstrap only) |
| GET | `/v1/spaces/{space_id}` | `space.get` |
| POST | `/v1/spaces/{space_id}/instances` | `instance.create` |
| GET | `/v1/spaces/{space_id}/instances/{id}` | `instance.get` |
| PATCH | `/v1/spaces/{space_id}/instances/{id}/metadata` | `instance.metadata.patch` |
| POST | `/v1/spaces/{space_id}/instances/{id}/transitions` | `state.transition` |
| GET | `/v1/spaces/{space_id}/gates` | `gate.list` |
| POST | `/v1/spaces/{space_id}/gates/{id}/resolve` | `gate.resolve` |
| POST | `/v1/spaces/{space_id}/events` | `event.append` |
| GET | `/v1/spaces/{space_id}/events` | `event.tail` (`from_seq` param) |
| GET | `/v1/spaces/{space_id}/events/subscribe` | SSE |
| POST | `/v1/spaces/{space_id}/waits` | `wait.register` |
| GET | `/v1/spaces/{space_id}/waits/{id}` | `wait.poll` |
| GET | `/v1/spaces/{space_id}/audit/export` | `audit.export` (P1) |
| GET | `/v1/spaces/{space_id}/ops/drift` | drift queries (P1) |

## Platform SSE

Endpoint: `GET /v1/spaces/{space_id}/events/subscribe`. Heartbeat every 15s.

```
event: journal.append
data: {"seq":42,"type":"state.transition","instance_id":"ins_…", …}

event: gate.pending
data: {"gate_id":"chk_…","instance_id":"ins_…","assignees":[…]}

event: gate.resolved
data: {"gate_id":"chk_…","decision":"approved"}

event: wait.resolved
data: { … }

event: heartbeat
data: {}
```

| Journal `type` | SSE `event` |
|----------------|-------------|
| `state.transition` | `journal.append` |
| `checkpoint.pending` | `gate.pending` |
| `checkpoint.resolved` | `gate.resolved` |
| `wait.matched` | `wait.resolved` |

## Review HTTP

Auth: same Bearer token. Scope: `STUDIO_SPACE_ID` env for list/create.

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/health` | `{ status, capabilities[] }` |
| GET | `/api/sessions` | List review instances in `STUDIO_SPACE_ID` |
| POST | `/api/sessions` | Create instance + review metadata |
| GET | `/api/sessions/{key}` | SessionJson |
| PATCH | `/api/sessions/{key}` | Update `target.url`, `title`, `assigned_reviewer` |
| POST | `/api/sessions/{key}/comments` | Add comment |
| POST | `/api/sessions/{key}/comments/{id}/replies` | Reply |
| PATCH | `/api/sessions/{key}/comments/{id}` | Patch comment |
| POST | `/api/sessions/{key}/finish` | `finish_review` transition |
| POST | `/api/sessions/{key}/review-cycle` | Block until round complete |
| GET | `/api/sessions/{key}/events` | SSE review events |

### SessionJson projection

```typescript
function toSessionJson(instance: Instance): SessionJson {
  const review = instance.metadata.review as ReviewBag;
  return {
    protocol_version: "1",
    session_key: instance.instance_id,
    view: review.view ?? "app",
    review_round: review.review_round ?? 1,
    round_state: instance.state as RoundState,
    target: review.target ?? { view: review.view ?? "app" },
    threads: review.threads ?? {},
    created_at: instance.created_at,
    updated_at: instance.updated_at,
  };
}
```

Metadata bag shape:

```typescript
{
  view: "app" | "components" | "foundations";
  target: { url?: string; proxy_port?: number | null };
  threads: Record<string, Comment[]>;
  assigned_reviewer?: string;
  title?: string;
}
```

### Review FSM (review-loop-v2)

Pinned contract: [../fixtures/product/hub/contracts/review-loop-v2.json](../fixtures/product/hub/contracts/review-loop-v2.json) (`cref_review_loop`).

| Contract state | SessionJson `round_state` |
|----------------|---------------------------|
| `awaiting_review` | `awaiting_review` |
| `awaiting_agent` | `awaiting_agent` |
| `changes_made` | `changes_made` |
| `converged` | `converged` |
| `production_approved` | `production_approved` |
| `aborted` | `aborted` |

| Review action | Hub event | From → To |
|---------------|-----------|-----------|
| Create session | (create) | → `awaiting_review` |
| Finish review (round 1) | `finish_review` | `awaiting_review` → `awaiting_agent` |
| Agent done | `agent_done` | `awaiting_agent` → `changes_made` |
| Finish review (round 2) | `finish_review` | `changes_made` → `converged` |
| Request production | `request_production` | `converged` → gate → `production_approved` |

Deprecated states removed in P3: `collecting_feedback`, `agent_applying`, `round_closing`.

### Review SSE events

`review.item_changed`, `review.round_start`, `review.finish`, `ready`, `server-shutdown`.

### wait_for_review / review-cycle

Registers `wait.register` with condition `{ type: "state", state: "awaiting_agent", match: "entered" }`, `delivery_mode: "http_long_poll"`, default timeout 300s. Returns `ReviewCycleResponse` with comments from SessionJson threads.

## MCP — unified namespace

Env: `STUDIO_HUB_URL`, `STUDIO_HUB_TOKEN`, `STUDIO_SPACE_ID`. **No `space_id` in tool args.**

### Platform tools

| Tool | HTTP |
|------|------|
| `get_space_state` | `instance.get` + gate list |
| `transition` | `POST …/transitions` |
| `emit_event` | `POST …/events` |
| `wait_for_state` | `POST …/waits` + poll |
| `contract_versions` | in-proc pinned refs |

### Review capability tools

| Tool | HTTP |
|------|------|
| `create_review_session` | `POST /api/sessions` |
| `get_session` | `GET /api/sessions/{key}` |
| `wait_for_review` | `POST /api/sessions/{key}/review-cycle` |

Tool schemas from capability bundle `contract/mcp-tools.json`.

## Shell capability canvas

Route: `/spaces/:spaceId/sessions/:sessionKey`

- Preview iframe + annotation panel (capability UI bundle)
- Gate queue, event tail in runtime mode
- Capability UI loaded from installed capability bundle

## Discovery

File: `~/.studio/hubs/shared.json` — hub URL, port, capabilities, lock file.

## Daemon wiring

```typescript
export interface DaemonContext {
  handler: HubHandler;
  studioPersistence: StudioPersistencePort;
  config: { databasePath, port, dataDir, defaultSpaceId, bootstrapToken? };
  capabilities: string[];
}

export function mountCapabilities(app: Hono, ctx: DaemonContext): void {
  mountReviewRoutes(app, ctx);
  // feature-spec, others via flow-runtime live apply
}
```

```
main.ts → SQLite → HubHandler → Hono /v1/* → mountCapabilities → fan-out → discovery + lock → serve
```

## Packages

```
packages/studio-hub-daemon/     P0 — routes, SSE, worker pool
packages/studio-hub-mcp/        P0 — platform + capability tool dispatch
packages/studio-hub-cli/        P0 — wait, transition helpers
packages/studio-hub-client/     P2 — /v1/* + SSE
packages/shell-web/             P2 — Vite + React shell
examples/capabilities/          P3 — review-loop, feature-spec CDK references
packages/capability-sdk/        P5 — manifest schema, validate CLI
```

dependency-cruiser rules: shell-no-kernel, hub-client-leaf.

## Acceptance — J01-min

1. Agent: `create_review_session` with url, title, assigned_reviewer
2. Shell: reviewer opens session, preview + annotation panel
3. Reviewer: 3 comments, Finish
4. Agent: `wait_for_review` returns comments[]
5. Journal auditable via event.tail

Fixture: [../fixtures/product/product/j01-review-happy-path.json](../fixtures/product/product/j01-review-happy-path.json)

## Acceptance — J01-full

6. Agent PATCH new preview URL; `agent_done`; reply to each comment
7. Reviewer second Finish → `converged`
8. Maya: production gate on `request_production`
9. Sarah: `audit.export` includes transitions, gate, metadata patches

Fixture: [../fixtures/product/product/j01-review-full-path.json](../fixtures/product/product/j01-review-full-path.json)

## Extensions (see other specs)

- Config HTTP routes → [config/spec.md](../config/spec.md)
- Dynamic mount + MCP catalog → [flow-runtime/spec.md](../flow-runtime/spec.md)
- query_ask / query_answer → [cross-space/spec.md](../cross-space/spec.md)
