# Cloud shell — wire bridge

Maps [spec.md](../cloud/spec.md) to apps and BFF.

## Components

```
apps/studio-cloud-bff/     Session + hub proxy
apps/shell-web/            VITE_CLOUD_SHELL=1 build
packages/studio-session/   Session store + magic link
```

## BFF routes

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/api/auth/login` | Start magic link / verify password |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Actor + spaces (browser replaces GET /v1/auth/whoami) |
| ALL | `/api/hub/v1/*` | Proxy to hub with derived token |

## Derived token

```
Browser → studio.example.com/api/hub/v1/spaces/…
       → BFF validates studio_session cookie
       → mints tok_der_* (60s TTL, space-scoped, member scopes)
       → forwards to STUDIO_HUB_INTERNAL_URL
```

**Invariant:** session cookie never accepted as MCP bearer.

## Environment

| Var | Purpose |
|-----|---------|
| `STUDIO_HUB_INTERNAL_URL` | e.g. `http://127.0.0.1:8787` |
| `STUDIO_SESSION_SECRET` | Cookie signing |
| `STUDIO_PUBLIC_URL` | `https://studio.example.com` |
| `STUDIO_DEPLOY_TOKENS` | CI push auth (or DB) |

## Shell build modes

| Mode | Entry |
|------|-------|
| Local (phase 1) | `/connect` — paste hub URL + bearer |
| Cloud | `/login` — hide paste UI |

Flag: `import.meta.env.VITE_CLOUD_SHELL`

## CI push (CL1)

```http
POST /v1/ci/capabilities/push
Authorization: Bearer dep_tok_…
```

Pipeline: `evolution.draft.upsert` → validate → test → `evolution.live.apply` (CR0)
