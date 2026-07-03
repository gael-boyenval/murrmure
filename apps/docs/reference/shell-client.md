# Shell client (`@murrmure/shell-client`)

Typed HTTP client for the **Murrmure observer shell** and custom views. Used by `@murrmure/shell-web` and `@murrmure/view-sdk`.

## Install

Monorepo package at `packages/shell-client/`. Import:

```typescript
import { createShellClient, JOURNAL_SSE_EVENTS, parseSseMessage } from "@murrmure/shell-client";
```

## Create client

```typescript
const client = createShellClient({
  baseUrl: "http://127.0.0.1:8787",
  token: "tok_…",
});
```

In Desktop bundled mode, `baseUrl` is same-origin (`window.location.origin`).

## API surface

| Namespace | Methods | HTTP |
|-----------|---------|------|
| `spaces` | `list()`, `home(space_id)`, `flowPreview(space_id, flow_id)`, `runFlow(flow_id, body)` | `/v1/spaces`, `/v1/spaces/{id}/home`, … |
| `me` | `get()`, `patch(body)` | `GET/PATCH /v1/me` |
| `notifications` | `list(status?)`, `dismiss(id)` | `/v1/notifications` |
| `gates` | `listForRun(run_id)`, `resolve(gate_id, body)` | `/v1/runs/{id}/gates`, `POST /v1/gates/{id}/resolve` |
| `sessions` | `get(id)`, `listRuns(id)` | `/v1/sessions/{id}`, …/runs |
| `runs` | `get(id)`, `graph(id)`, `retry(id, body?)` | `/v1/runs/{id}`, …/graph, …/retry |
| `journal` | `query(params)`, `subscribe(onEvent)` | `GET /v1/journal`, SSE `/v1/journal/subscribe` |
| `auth` | `mintSseTicket()` | `POST /v1/auth/sse-ticket` |

## SSE subscription

Journal SSE uses a short-lived ticket (avoid putting bearer tokens in EventSource URLs):

1. `POST /v1/auth/sse-ticket` → `{ ticket, expires_in: 60 }`
2. `EventSource` → `GET /v1/journal/subscribe?ticket=…`
3. Listen for events in `JOURNAL_SSE_EVENTS`

```typescript
const unsub = client.journal.subscribe(({ event, data }) => {
  console.log(event, data);
});
// later: unsub();
```

### SSE event names

`journal.append`, `gate.pending`, `gate.resolved`, `notification.changed`, `out_of_shell.desktop`, `wait.resolved`, `flow.dev_reload`, `flow.live_applied`, `space.list_changed`, `mrmr.space.index.updated`, `heartbeat`

Use `parseSseMessage(event, rawData)` to safely parse payloads (returns `null` for heartbeats).

## Scope

Shell client covers **read and gate-resolve** paths for the observer UI. Admin mutations (grants, apply, federation) belong to **CLI** or direct HTTP with appropriate tokens — not the shell client.

## Related

- [HTTP API overview](./http-api)
- [View SDK](./view-sdk)
- [Murrmure Desktop](../guide/desktop)
