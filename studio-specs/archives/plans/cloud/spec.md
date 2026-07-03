# Studio cloud shell

Hosted Studio where collaborators use **browser session auth** — not paste `tok_*` into localStorage. Parity with config CS1–CS2 + triggers TR1.

**Prerequisites:** config CS2, capability-runtime CR0.

## Problem

| Local shell | Cloud gap |
|-------------|-----------|
| `/connect` paste hub URL + bearer | No safe token handoff for team |
| `~/.studio/hubs/shared.json` on laptop | Central hub on EC2/Vercel |
| curl for bootstrap | Alex admin needs full configure UI |

## Scope

### CL0

- Shell origin — `https://studio.example.com` (single SPA)
- Session auth — httpOnly cookie `studio_session` after admin login
- Hub resolver — session maps to `{ hub_url, actor_id, space_grants[] }`
- BFF pattern — shell server proxies `/v1/*` with short-lived derived token (60s) per request
- Connect flow — `/login` not `/connect` paste on cloud deploy
- Logout / revoke session

### CL1

- Full configure routes via BFF
- CI capability push — `POST /v1/ci/capabilities/push` with deploy token
- Health + relay status on `/configure/hub`
- Audit export download in browser

### Out

- Full OAuth/OIDC (hooks: `auth.provider: oidc` future)
- Multi-org billing
- Per-customer isolated hubs (v1 single hub per deployment)

## Auth model

| Actor | Mechanism |
|-------|-----------|
| Human admin | Email + magic link or password → session cookie |
| Human collaborator | Same; role from member table |
| IDE agent | Long-lived grant token — **not** session cookie |
| CI pipeline | `STUDIO_DEPLOY_TOKEN` — space-scoped, rotateable |

**Invariant:** Session cookie never usable as MCP bearer directly (c01-J07).

### Session cookie (normative)

- `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` for admin)
- Absolute TTL: 7 days default; idle timeout: 24h
- Rotation on privilege change; server-side revoke list
- CSRF: double-submit token or SameSite + custom header on mutating BFF routes

### `/configure/hub` health (CL1)

```json
{
  "hub_status": "healthy" | "degraded" | "unreachable",
  "relay_status": "connected" | "disconnected" | "local_only",
  "last_relay_heartbeat_at": "ISO8601"
}
```

Required for c01-J15 always-on topology.

## BFF proxy

```
Browser → studio.example.com/api/hub/v1/spaces/…
       → BFF validates session
       → mints derived tok_der_* (60s, single space, same scopes as member)
       → forwards to hub internal URL
```

## BFF routes

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/api/auth/login` | Start magic link / verify password |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Actor + spaces (replaces whoami for browser) |
| ALL | `/api/hub/v1/*` | Proxy to hub with derived token |

## Login flow

1. User → `/login`
2. Authenticate (magic link v0)
3. BFF creates session row + Set-Cookie
4. Redirect `/configure` — same UI as local config shell

## Shell build modes

| Mode | Connect route | Flag |
|------|---------------|------|
| Local | `/connect` token paste | default |
| Cloud | `/login` — hide paste UI | `VITE_CLOUD_SHELL=1` |

## Environment

| Var | Purpose |
|-----|---------|
| `STUDIO_HUB_INTERNAL_URL` | e.g. `http://127.0.0.1:8787` |
| `STUDIO_SESSION_SECRET` | Cookie signing |
| `STUDIO_PUBLIC_URL` | `https://studio.example.com` |
| `STUDIO_DEPLOY_TOKENS` | CI push auth |

## Hub discovery (cloud)

No `~/.studio/hubs/shared.json` on user laptop. BFF holds hub internal URL. Shell `/configure/hub` shows health via BFF proxy.

## CI push (CL1)

```http
POST /v1/ci/capabilities/push
Authorization: Bearer dep_tok_…

{
  "space_id": "spc_ui_sandbox",
  "bundle_digest": "sha256:…",
  "package_id": "feature-spec",
  "version": "1.2.0",
  "target_state": "live"
}
```

Pipeline: `evolution.draft.upsert` → validate → test → `live.apply` — no browser. See [current/capability-runtime/spec.md](../../current/capability-runtime/spec.md).

## Components

```
apps/studio-cloud-bff/     Session + hub proxy
apps/shell-web/            Cloud build flag
packages/studio-session/   Session store + magic link
```

## Acceptance — CL-min

Fixture: [./fixtures/cloud-admin-first-space.json](./fixtures/cloud-admin-first-space.json)

1. Admin login → create space without curl
2. Mint grant → copy MCP snippet for remote hub URL
3. Session expiry redirects to login

## Acceptance — CL-full

4. CI push promotes feature-spec live
5. Collaborator viewer cannot access configure routes
6. BFF derived token expires — no replay after 60s

## Related

- Config UI parity: [archives/superseded/config-shell-v1.md](../../superseded/config-shell-v1.md) (**retired**)
- Live apply: [current/capability-runtime/spec.md](../../current/capability-runtime/spec.md)
