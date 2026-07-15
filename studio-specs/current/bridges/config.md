---
topic: Studio configuration shell — HTTP bridge
date: 2026-06-20
status: active
reference: ../product/studio-product-bridge.md
delta: adr/CS-ADR-04-delta-to-product-p0-p5.md
---

# Studio configuration shell — bridge

Maps **config HTTP routes** → hub-core commands. Extends [studio-product-bridge.md](../product/studio-product-bridge.md) **without modifying that file**. Implement in `packages/studio-hub-daemon/src/routes/config/`.

## Auth middleware

Reuse product bridge `requireToken`. Additional rules:

| Route class | Token requirement |
|-------------|-------------------|
| `POST /v1/spaces` (first) | Bootstrap token (`space_id: "bootstrap"`) |
| `POST /v1/spaces` (subsequent) | `space:admin` on parent or hub bootstrap policy |
| Config mutations on `{space_id}` | Matching path scope + command scope |
| `GET /v1/ops/*` | `space:admin` on any space (hub operator) |

Path `space_id` is authority — never accept override in body ([CS-ADR-01](./adr/CS-ADR-01-config-platform-routes.md)).

## Config HTTP → HubHandler

Routes **not** in product P0 table — added by config shell CS0:

| Method | Path | Command / Query | Scope |
|--------|------|-----------------|-------|
| GET | `/v1/auth/whoami` | `auth.whoami` | any valid token |
| GET | `/v1/spaces` | `space.list` | `space:enter` (returns granted spaces) |
| PATCH | `/v1/spaces/{id}` | `space.update` | `space:admin` |
| POST | `/v1/spaces/{id}/archive` | `space.archive` | `space:admin` |
| GET | `/v1/spaces/{id}/capabilities` | `capability.list` | `space:read` |
| POST | `/v1/spaces/{id}/capabilities/install` | `evolution.draft.upsert` | `capability:install` |
| GET | `/v1/spaces/{id}/capabilities/{install_id}` | `capability.get` | `space:read` |
| PATCH | `/v1/spaces/{id}/capabilities/{install_id}/config` | `capability.configure` | `capability:configure` |
| POST | `/v1/spaces/{id}/evolution/validate` | `evolution.validate` | `capability:install` |
| POST | `/v1/spaces/{id}/evolution/test` | `evolution.test.run` | `capability:install` |
| POST | `/v1/spaces/{id}/evolution/promote` | `evolution.promote.request` | `capability:install` |
| POST | `/v1/spaces/{id}/evolution/rollback` | `evolution.rollback` | `capability:install` / gate |
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
| GET | `/v1/ops/grants/export` | `grants.export` | hub operator |
| GET | `/v1/ops/federation/status` | `federation.status` | `space:admin` |

Existing product P0/P1 routes unchanged — see product bridge.

## Request / response shapes (normative v0)

### GET `/v1/auth/whoami`

```json
{
  "actor_id": "act_…",
  "kind": "human",
  "token_id": "tok_…",
  "spaces": [
    { "space_id": "spc_ui_sandbox", "scopes": ["space:admin", "…"] }
  ],
  "expires_at": "2026-09-20T00:00:00Z"
}
```

### POST `/v1/spaces/{id}/capabilities/install`

```json
{
  "package_id": "review-loop",
  "version": "2.0.0",
  "config": {
    "default_preview_url_pattern": "",
    "production_gate_enabled": true,
    "required_approver_role": "product_lead"
  },
  "target_state": "live"
}
```

Response: `CapabilityInstall` with `install_id`, `evolution_state`, `contract_ref_id`.

### POST `/v1/spaces/{id}/grants`

```json
{
  "label": "Dev Cursor — ui-sandbox worker",
  "harness": "cursor-local",
  "scopes": ["space:read", "event:read", "state:transition", "event:emit", "blob:read", "blob:write"],
  "capability_acl": ["review-loop"],
  "expires_in_days": 90
}
```

Response includes **one-time** `token` field (never stored server-side in plaintext after mint).

### POST `/v1/spaces/{id}/triggers`

```json
{
  "name": "backend-ready-wake-frontend",
  "filter": {
    "event_types": ["work.ready"],
    "source_space_id": "spc_backend_api",
    "capability_ids": []
  },
  "action": {
    "type": "wake_mcp_agent",
    "target_space_id": "spc_ui_sandbox",
    "tool": "handle_work_ready"
  },
  "dedup": {
    "key_jsonpath": "$.event_id",
    "ttl_seconds": 86400
  },
  "partition_key": "space_id"
}
```

## Enriched denial envelope

All config route denials return:

```typescript
interface StudioDenial {
  code: string;           // SCOPE_ENFORCEMENT_FAILURE | INSTALL_POLICY_VIOLATION | …
  message: string;        // human-readable
  hint?: {
    required_scope?: string;
    nearest_space_id?: string;
    install_policy?: string;
    legal_transitions?: string[];
  };
}
```

Map hub-core `scope_enforcement_failure` journal denials to this shape in HTTP layer.

## `@murrmure/hub-client` extensions

Delta to product P2 interface — implement in same package:

```typescript
export interface HubClientConfig {
  auth: { whoami(): Promise<WhoamiResponse> };
  spaces: {
    list(): Promise<SpaceSummary[]>;
    create(body: CreateSpaceRequest): Promise<Space>;
    update(spaceId: string, body: UpdateSpaceRequest): Promise<Space>;
    archive(spaceId: string): Promise<void>;
  };
  capabilities: {
    list(spaceId: string): Promise<CapabilityInstallSummary[]>;
    get(spaceId: string, installId: string): Promise<CapabilityInstallDetail>;
    install(spaceId: string, body: InstallCapabilityRequest): Promise<CapabilityInstallDetail>;
    configure(spaceId: string, installId: string, config: Record<string, unknown>): Promise<void>;
    validate(spaceId: string, installId: string): Promise<ValidateResult>;
    test(spaceId: string, installId: string): Promise<TestResult>;
    promote(spaceId: string, installId: string): Promise<PromoteResult>;
    rollback(spaceId: string, installId: string, toVersion: string): Promise<RollbackResult>;
    diff(spaceId: string, params: { from: string; to: string }): Promise<ContractDiff>;
  };
  members: {
    list(spaceId: string): Promise<Member[]>;
    invite(spaceId: string, body: InviteMemberRequest): Promise<Member>;
    updateRole(spaceId: string, memberId: string, role: MemberRole): Promise<Member>;
    remove(spaceId: string, memberId: string): Promise<void>;
  };
  grants: {
    list(spaceId: string): Promise<GrantSummary[]>;
    mint(spaceId: string, body: MintGrantRequest): Promise<MintGrantResponse>;
    revoke(spaceId: string, grantId: string): Promise<void>;
    rotate(spaceId: string, grantId: string): Promise<MintGrantResponse>;
    exportHubWide(): Promise<Blob>;
  };
  triggers: {
    list(spaceId: string): Promise<TriggerSummary[]>;
    register(spaceId: string, body: RegisterTriggerRequest): Promise<TriggerSummary>;
    disable(spaceId: string, triggerId: string): Promise<void>;
    deliveries(spaceId: string, params?: { limit?: number }): Promise<TriggerDelivery[]>;
    replay(spaceId: string, triggerId: string, body: { source_event_id: string; reason: string }): Promise<void>;
  };
  ops: {
    federationStatus(): Promise<FederationStatus>;
  };
}

// Merge into HubClient:
export type HubClient = HubClientRuntime & HubClientConfig;
```

Shell imports merged client; runtime-only screens use subset.

## SSE events (config-relevant)

Subscribe on space channel — existing product SSE. Config UI listens for:

| SSE `event` | Config UI action |
|-------------|------------------|
| `gate.pending` | Refresh capability `promoted_pending` badge |
| `journal.append` type `evolution.*` | Refresh evolution pipeline step |
| `journal.append` type `grant.*` | Refresh grant list |

## MCP / CLI

No new MCP tools for Configuration v0 — admins use browser. CLI may add later:

- `studio config space create`
- `studio config connection create`

Out of CS0 scope.

## Related

- [CS-ADR-01](./adr/CS-ADR-01-config-platform-routes.md)
- [CS-ADR-04](./adr/CS-ADR-04-delta-to-product-p0-p5.md)
- [studio-config-shell-impl.md](./studio-config-shell-impl.md)
