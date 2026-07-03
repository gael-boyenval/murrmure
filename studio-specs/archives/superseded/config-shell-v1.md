# Studio configuration shell

Normative spec for **Configuration UI** and **config HTTP routes**. Runtime shell (gates, events, audit) is in [product/spec.md](../product/spec.md).

> **CLI parity:** Configure shell actions are also available via `mrmr space`, `mrmr hub`, and `mrmr flow` — see [cli/spec.md](../cli/spec.md).

## Scope

### In

- Configuration route tree in `@murrmure/shell-web`
- Hub config HTTP routes (below)
- `@murrmure/hub-client` config extensions
- First-run setup wizard (`/setup`)
- CDK-backed capability install (no bundled catalog — see [archives/superseded/bundled-catalog-migration.md](../../archives/superseded/bundled-catalog-migration.md))
- Grant mint wizard with scope templates
- Trigger register form (async only; no cron UI)
- Human-readable scope denial rendering (J03)

### Out

- OAuth / multi-tenant IdP
- Capability marketplace
- Contract graph editor
- Cron / scheduled trigger UI
- Gate delegation UI (temp role workaround in Members)
- Federation topology map (relay URL readout only)
- Email / Slack notifications (stub)
- Théo client portal / Ask/Answer policy UI (XS1)

## Architectural decisions

| Decision | Choice |
|----------|--------|
| Config platform routes | Dedicated `/v1/*` routes not in product P0 table; path space_id is authority |
| Shell config/runtime split | Top bar mode toggle: Runtime vs Configure; separate sidebars |
| Bundled catalog v0 | **Superseded** — CDK user push; see [archives/superseded/bundled-catalog-migration.md](../../archives/superseded/bundled-catalog-migration.md) |
| Evolution UI | Full pipeline always: draft → validated → tested → promoted → live |

## Persona scope

| Persona | In scope |
|---------|----------|
| Alex | Setup wizard, spaces, hub settings, promote approve |
| Dev | Capability install/promote, grant mint, triggers |
| Sarah | Grant list, hub-wide export, drift readout |
| Maya, Priya | Runtime shell only |
| Théo | None (CS3+ federation UI deferred) |

## Shell layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Top bar: [Space ▾]  [Hub ●]  [Runtime | Configure]              │
├─────────────┬────────────────────────────────────────────────────┤
│ Sidebar     │ Main panel                                         │
│ RUNTIME     │ Instances, gates, events, audit, capability canvas  │
│ CONFIGURE   │ Spaces, capabilities, triggers, members, grants     │
└─────────────┴────────────────────────────────────────────────────┘
```

**Mode default:** `Configure` if token has `space:admin` on ≥1 space; else `Runtime` only.

## Shell routes

| Route | Screen | Min scope |
|-------|--------|-----------|
| `/connect` | Hub URL + token (local) | — |
| `/setup` | First-run wizard (7 steps) | bootstrap or `space:admin` |
| `/configure` | Dashboard | `space:enter` |
| `/configure/spaces/new` | Create space | bootstrap or `space:admin` |
| `/configure/spaces/:spaceId` | Space settings | `space:admin` |
| `/configure/spaces/:spaceId/flows` | Installed flows | `space:read` |
| `/configure/spaces/:spaceId/flows/new` | New flow — CDK onboarding (BC2a) | `flow:install` |
| `/configure/spaces/:spaceId/flows/install` | Push / link staged bundle (not catalog picker) | `flow:install` |
| `/configure/spaces/:spaceId/flows/:installId` | Detail + evolution | `flow:install` / gate |
| `/configure/spaces/:spaceId/triggers` | Trigger list | `space:read` |
| `/configure/spaces/:spaceId/triggers/new` | Register trigger | `trigger:register` |
| `/configure/spaces/:spaceId/members` | Human members | `space:admin` |
| `/configure/spaces/:spaceId/grants` | Agent grants | `space:admin` |
| `/configure/spaces/:spaceId/grants/new` | Mint grant | `space:admin` |
| `/configure/hub` | Discovery, lock, relay, drift | `space:admin` on any space |

## Config HTTP routes

Auth: reuse product `requireToken`. Bootstrap for first `POST /v1/spaces`.

| Method | Path | Command / Query | Scope |
|--------|------|-----------------|-------|
| GET | `/v1/auth/whoami` | `auth.whoami` | any valid token |
| GET | `/v1/spaces` | `space.list` | `space:enter` |
| PATCH | `/v1/spaces/{id}` | `space.update` | `space:admin` |
| POST | `/v1/spaces/{id}/archive` | `space.archive` | `space:admin` |
| GET | `/v1/spaces/{id}/flows` | `flow.list` | `space:read` |
| POST | `/v1/spaces/{id}/flows/install` | `evolution.draft.upsert` | `flow:install` |
| GET | `/v1/spaces/{id}/flows/{install_id}` | `flow.get` | `space:read` |
| PATCH | `/v1/spaces/{id}/flows/{install_id}/config` | `flow.configure` | `flow:configure` |
| POST | `/v1/spaces/{id}/evolution/validate` | `evolution.validate` | `flow:install` |
| POST | `/v1/spaces/{id}/evolution/test` | `evolution.test.run` | `flow:install` |
| POST | `/v1/spaces/{id}/evolution/promote` | `evolution.promote.request` | `flow:install` |
| POST | `/v1/spaces/{id}/evolution/rollback` | `evolution.rollback` | `flow:install` / gate |
| GET | `/v1/spaces/{id}/contracts/diff` | `contract.diff.get` | `space:read` |
| GET | `/v1/spaces/{id}/members` | `member.list` | `space:admin` |
| POST | `/v1/spaces/{id}/members` | `member.invite` | `space:admin` |
| PATCH | `/v1/spaces/{id}/members/{member_id}` | `member.role.assign` | `space:admin` |
| DELETE | `/v1/spaces/{id}/members/{member_id}` | `member.remove` | `space:admin` |
| GET | `/v1/spaces/{id}/grants` | `projection.grants` | `space:admin` |
| POST | `/v1/spaces/{id}/grants` | `grant.mint` | `space:admin` |
| POST | `/v1/spaces/{id}/grants/{grant_id}/revoke` | `grant.revoke` | `space:admin` |
| POST | `/v1/spaces/{id}/grants/{grant_id}/rotate` | `grant.rotate` | `space:admin` |
| GET | `/v1/spaces/{id}/triggers` | `trigger.list` | `space:read` |
| POST | `/v1/spaces/{id}/triggers` | `trigger.register` | `trigger:register` |
| POST | `/v1/spaces/{id}/triggers/{trigger_id}/disable` | `trigger.disable` | `trigger:register` |
| GET | `/v1/spaces/{id}/triggers/deliveries` | `trigger.delivery.log` | `space:read` |
| POST | `/v1/spaces/{id}/triggers/{trigger_id}/replay` | `trigger.replay` | `space:admin` |
| GET | `/v1/ops/grants/export` | `grants.export` | `space:admin` |
| GET | `/v1/ops/federation/status` | `federation.status` | `space:admin` |

Product P0/P1 routes unchanged — see [product/spec.md](../product/spec.md).

## Request / response shapes

### GET `/v1/auth/whoami`

```json
{
  "actor_id": "act_…",
  "kind": "human",
  "token_id": "tok_…",
  "spaces": [{ "space_id": "spc_ui_sandbox", "scopes": ["space:admin"] }],
  "expires_at": "2026-09-20T00:00:00Z"
}
```

### POST `/v1/spaces/{id}/flows/install` (v2)

Normative wire: [build-capability/06-install-push-apply-http-contract.md](../build-capability/06-install-push-apply-http-contract.md).

```json
{
  "package_id": "review-loop-lite",
  "version": "1.0.0",
  "bundle": {
    "mode": "local-path",
    "local_path": "~/.studio/capabilities/review-loop-lite/1.0.0/bundle.tar.zst"
  },
  "source_metadata": {
    "source_path": "/Users/dev/workflows/review-loop-lite",
    "built_at": "2026-06-20T12:00:00Z",
    "sdk_version": "0.1.0"
  },
  "config": {},
  "target_state": "draft"
}
```

Response includes hub-assigned `contract_ref_id` and `install_id`. v1 catalog-shaped body **deprecated**.

### POST `/v1/spaces/{id}/grants`

```json
{
  "label": "Dev Cursor — ui-sandbox worker",
  "harness": "cursor-local",
  "scopes": ["space:read", "event:read", "state:transition", "event:emit", "blob:read", "blob:write"],
  "flow_acl": ["review-loop"],
  "expires_in_days": 90
}
```

Response includes one-time `token` field (never stored plaintext after mint).

### POST `/v1/spaces/{id}/triggers`

```json
{
  "name": "backend-ready-wake-frontend",
  "filter": { "event_types": ["work.ready"], "source_space_id": "spc_backend_api" },
  "action": { "type": "wake_mcp_agent", "target_space_id": "spc_ui_sandbox", "tool": "handle_work_ready" },
  "dedup": { "key_jsonpath": "$.event_id", "ttl_seconds": 86400 },
  "partition_key": "space_id"
}
```

## Denial envelope

```typescript
interface StudioDenial {
  code: string;
  message: string;
  hint?: {
    required_scope?: string;
    nearest_space_id?: string;
    install_policy?: string;
    legal_transitions?: string[];
  };
}
```

## First-run wizard (`/setup`)

| Step | Action |
|------|--------|
| 1 Connect | Hub URL + token |
| 2 Create spaces | `ui-sandbox` + `ui-production` defaults |
| 3 Link workflow | CDK: init example or register project path → push draft to sandbox |
| 4 Validate & test | Auto-run Lens A/B |
| 5 Agent access | Mint Worker grant → MCP snippet |
| 6 Invite team | Optional email + role |
| 7 Verify | Link to runtime + promote when ready |

Completion: `localStorage.studio_setup_complete = "1"`.

## Space create / edit

| Field | Default | Notes |
|-------|---------|-------|
| Name | — | Display |
| Slug | from name | Immutable after create |
| Parent space | none | Optional topology |
| Install policy | `human_only` | `human_only` \| `authorized_agents` \| `allow_list` |
| Preview policy | `same_origin_only` | External URL allowlist for iframes |
| Description | optional | |

Archive blocked when active instances exist.

## Capability install (CDK — no catalog)

Capabilities are **user-created** and pushed via the Capability Developer Kit. Configure shows evolution pipeline + install metadata (`source_path`, `bundle_digest`, `built_at`).

Install config forms render from bundle `config.schema.json` after push.

> **Migration:** Former bundled catalog (CS-ADR-03) superseded — [archives/superseded/bundled-catalog-migration.md](../../archives/superseded/bundled-catalog-migration.md).

## Evolution pipeline UI

```
draft → validated → tested → promoted_pending? → live → superseded
```

In-flight policy: `finish_current` — live pointer updates for new instances only.

## Grant mint wizard

Harness: `cursor-local` · `claude-code-local` · `cloud-worker` · `ci`

| Template | Scopes |
|----------|--------|
| Observer | `space:read`, `event:read` |
| Worker | + `state:transition`, `event:emit`, `blob:read`, `blob:write` |
| Builder | + `flow:install`, `flow:configure` |
| Cross-space worker | + `query:ask` on source space; target answers via capability handler + `query:answer` grant |

Grant templates are presets — admin may add `query:ask` / `query:answer` for XS0 (see [cross-space/spec.md](../cross-space/spec.md)).
| Custom | manual checkboxes |

Warnings: `space:admin` on non-owner → confirm banner; `trigger:register` → high-privilege; agent install on `human_only` → blocked.

Output: MCP JSON snippet. Default expiry 90 days. Revoke/rotate on grant list.

## Trigger register form

| Section | Fields |
|---------|--------|
| Filter | Event types, source space, optional capability id |
| Action | `wake_mcp_agent` \| `http_post` \| `transition_remote` \| `enqueue_worker` |
| Action config | Tool + target space; signed URL; transition id |
| Dedup | Required — preset `event.id` or JSONPath + TTL |

v0: No cron UI. Delivery log: last 50 deliveries with fingerprint and dedup reason.

## Hub client extensions

`HubClient = HubClientRuntime & HubClientConfig` — config namespaces: `auth`, `spaces`, `capabilities`, `members`, `grants`, `triggers`, `ops`.

## SSE (config-relevant)

| SSE `event` | Config UI action |
|-------------|------------------|
| `gate.pending` | Refresh capability promoted_pending badge |
| `journal.append` type `evolution.*` | Refresh evolution pipeline |
| `journal.append` type `grant.*` | Refresh grant list |

## Acceptance — CS-min

Fixture: [../fixtures/config/first-week-setup.json](../fixtures/config/first-week-setup.json)

1. Bootstrap create first space via UI
2. Install review-loop; validate + test pass
3. Mint Worker grant; copy MCP config
4. Add Editor member
5. Register `work.ready` trigger with dedup
6. Request promote → gate in runtime queue

## Acceptance — CS-full

7. Breaking promote shows gate + contract diff
8. Rollback prior live version
9. Revoke + rotate grant
10. `space:admin` warning on broad scopes
11. Agent install to `human_only` prod → readable 403
12. Hub-wide grant export
13. Trigger delivery log shows dedup drop

Fixtures: [../fixtures/config/promote-breaking-gate.json](../fixtures/config/promote-breaking-gate.json), [../fixtures/config/deny-install-prod.json](../fixtures/config/deny-install-prod.json)

## Extensions

- Trigger templates + event catalog → [triggers/spec.md](../triggers/spec.md)
- Live apply route → [flow-runtime/spec.md](../flow-runtime/spec.md)
- Cloud BFF → [archives/plans/cloud/spec.md](../plans/cloud/spec.md) (**NOT SHIPPED**)
