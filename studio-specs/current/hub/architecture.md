---
topic: Studio hub — architecture
date: 2026-06-20
status: normative
consolidated_from: research/studio/hub-core-v2.md
---

# Studio hub — architecture

Definitive architecture for the **domain-agnostic hub runtime**. Capabilities (review, portals, briefings) mount on top; shell and adapters are thin edges.

**Validated against:** Loopcraft + Théo journeys (40), product Gate 0, reference hubs (Crit, OD, LangGraph, Cline, Impeccable, n8n).

---

## Part 0 — Architectural decisions

| ID | Decision | Rejected | Rationale |
|----|----------|----------|-----------|
| ADR-01 | **Hexagonal hub** — `@studio/hub-core` pure domain, zero I/O | Monolith daemon with domain routes (V1) | V3 boundary; review is capability |
| ADR-02 | **Contracts-first** — `@studio/contracts` Zod leaf, all edges import it | Schemas duplicated in MCP/HTTP | OD pattern; Journey-11 strict deserializer lesson |
| ADR-03 | **Instance primitive** — core owns `instance_id`; product says "session" | Session only in capability | J01/J04 multi-session per space |
| ADR-04 | **Contract pin on create** — in-flight instances keep pinned semver | Auto-migrate on promote | J10 finish-current; LangGraph checkpoint immutability |
| ADR-05 | **Journal canonical** — SQLite append-only + write-through snapshots | JSONL-only or snapshot-only | SOC2 export + indexed queries + Impeccable repair |
| ADR-06 | **Dual seq** — global `seq` + per-space `space_seq` + per-instance `instance_seq` | Global-only | Federation + trigger partition + audit |
| ADR-07 | **Denials are events** — every 403/409 appends journal row | Silent HTTP reject | J12 SOC2; Sarah audit |
| ADR-08 | **Sync + async orthogonal** — separate modules, tools, observability columns | Triggers that block emitter | Overview two-plane model |
| ADR-09 | **Subscribe-before-signal** — wait registered before mutation that satisfies | Poll chat | Crit race class |
| ADR-10 | **Both SSE + long-poll** — one notify bus, transport at registration | SSE-only or poll-only | Shell SSE + CLI block + MCP one-shot |
| ADR-11 | **Federation in core** — policy, queue, FSM, ingress | Relay owns routing | J09/J13/J17 |
| ADR-12 | **Relay = wire adapter only** | Relay as second runtime | hub-core validation |
| ADR-13 | **Business-key dedup default** — JSONPath on payload, not event.id only | Event-id dedup | J06 duplicate PRs |
| ADR-14 | **Default integration_failure alert** — opt-out per trigger | Silent external fail | J07 90-minute outage |
| ADR-15 | **Platform ask timeout** — synthetic `query_failed(ANSWER_TIMEOUT)` | Agent-only timeout | J02 silent briefing holes |
| ADR-16 | **Schema strip then forbidden_fields** — allowlist projection + semantic denylist | Strip only | J03 PCI + J12 minimum disclosure |
| ADR-17 | **CEL conditions hub-side** — no sandbox at runtime | JS sandbox in executor | Predictable, testable guards |
| ADR-18 | **Gate pre-commit interrupt** — state stays at `from` until resolve | Auto-advance then gate | LangGraph interrupt semantics |
| ADR-19 | **Full evolution pipeline always** — validate→test→promote→notify→live | Breaking-only pipeline | Gate 0 #6 fix |
| ADR-20 | **Grant + Member split** — agents get grants; humans get roles for gates | Roles in grants only | J05 delegation, J10 multi-approver |
| ADR-21 | **Prefixed ULID IDs** — `spc_`, `ins_`, `evt_`, … | UUID bare | Sortable, grep-friendly |
| ADR-22 | **One hub process per machine** — discovery file + startup lock | Per-repo listeners | Product non-goal |
| ADR-23 | **At-least-once + dedup** — no exactly-once global claim | Kafka-style EOS | what-we-are-not |
| ADR-24 | **Skills ≠ law** — MCP resources for live contract | Skills as protocol | Gate 0 #7 |

---

## Part 1 — Package graph

```
@studio/contracts          ← Zod only (leaf)
       ↑
@studio/hub-core           ← hexagon: auth, tenancy, state, journal, coordination, federation, evolution
       ↑
@studio/hub-persistence    ← SQLite WAL, blob files, dedup store
       ↑
@studio/hub-daemon         ← Bun HTTP + SSE + bootstrap + wiring

Adapters (thin):
  @studio/hub-mcp          ← stdio → HTTP
  @studio/hub-cli          ← blocking JSON stdout
  @studio/client           ← typed fetch + SSE for shell

Authoring:
  @studio/capability-sdk   ← validate CLI, test harness, UI mount types

Deployables (later):
  @studio/shell-web · relay-wire binary
```

**Export pattern (OD mirror):** `@studio/contracts/commands/*`, `/queries/*`, `/sse/*`, `/mcp/tools`, `/discovery`, `/evolution`, `/errors`.

**Cline mapping:** discovery + daemon lifecycle → `@studio/hub-daemon`; agent session loop → **not in hub**.

---

## Part 2 — Runtime topology

```
                    ┌─ Adapters ─────────────────────────┐
                    │  HTTP · MCP stdio · CLI · Relay in │
                    └──────────────────┬─────────────────┘
                                       ▼
┌─ Bootstrap ─────────────────────────────────────────────┐
│  ~/.studio/hubs/shared.json · startup lock · health     │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─ @studio/hub-core ──────────────────────────────────────┐
│  auth ──► tenancy (space + instance) ──► contracts        │
│              │                                            │
│              ▼                                            │
│  state + gates ◄── interrupt/checkpoint on instance       │
│              │ append                                     │
│              ▼                                            │
│  journal (pub/sub bus)                                    │
│       ├─► coordination/sync (waits)                     │
│       ├─► coordination/async (triggers + dedup)           │
│       ├─► federation (policy · queue · FSM · ingress)   │
│       ├─► projections (rebuildable)                       │
│       └─► notify port (SSE + long-poll)                   │
│  blobs · evolution · ops (probe, replay, export)          │
└──────────────────────────┬────────────────────────────────┘
                           ▼
              persistence · relay wire · trigger handlers
```

**Truth:** `journal_events` + `instance_snapshots`. Everything else rebuildable.

**Shell vs core:** Shell = UI for config, observability, gate queue presentation. Core = enforcement + projections via Command/Query ports.

---

## Part 3 — Module responsibilities

| Module | Owns | Must never |
|--------|------|------------|
| `auth` | Verify, scopes, harness binding, human vs agent, mint/revoke/rotate grants | Infer space from body; agent bypass |
| `tenancy` | Spaces, topology, instances, install/preview/query policies | Domain workflow rules |
| `contracts` | Load/cache semver artifacts, query_types registry | Hardcode review states |
| `state` | Transitions, conditions (CEL), optimistic revision, legal_transitions projection | Import capability code |
| `gates` | Pending/resolved, quorum, delegation, pre-commit interrupt | Approve = downstream success |
| `journal` | Append-only, seq allocation, pub/sub fan-out | Payloads > 64 KiB inline |
| `coordination/sync` | Wait registry, subscribe-before-signal | Chat polling |
| `coordination/async` | Trigger match, dedup, partition queue, delivery log, replay | Arbitrary shell |
| `federation` | Hub registry, routing matrix, ingress gate, outbound queue, FSM | Second state executor |
| `blobs` | Opaque store, namespace ACL on fetch | ACL from event mention |
| `evolution` | Lens A/B, test orchestration, promote FSM, notify live | Skip test/notify |
| `projections` | Audit, gate queue, triggers, grants, health, drift, federation status | Second source of truth |
| `notify` | SSE multiplex, long-poll resolve, MCP control outbox | Domain events only |

---

## Part 4 — Identity & data model

### ID format

`{prefix}_{ULID}` — e.g. `spc_01J…`, `ins_01J…`, `evt_01J…`, `grt_01J…`, `tok_01J…`, `hub_01J…`

### Provenance tuple (every mutation)

```typescript
{
  space_id: string;      // required
  instance_id?: string;  // required for workflow ops
  actor_id: string;
  token_id: string;      // tok_*
  command_id?: string;   // client idempotency
}
```

### Core entities (summary)

| Entity | Key fields | Lifecycle |
|--------|------------|-----------|
| **Hub** | `hub_id`, `deployment_profile`, `federation_mode` | starting→ready↔degraded→stopped |
| **Space** | `slug`, `parent_space_id`, `install_policy`, `preview_policy`, `query_policy` | active→archived |
| **Instance** | `capability_install_id`, `contract_ref_id` (pinned), `state`, `metadata`, `revision` | active→converged→archived |
| **Actor** | `kind`: human\|agent\|system | active→disabled |
| **Grant** | `scopes[]`, `capability_acl`, `harness_binding`, `blob_namespace_acl` | active→revoked\|expired |
| **Member** | `role`: owner\|editor\|viewer | invited→active→removed |
| **CapabilityInstall** | `semver`, `evolution_state`, `contract_ref_id` | draft→…→live→superseded |
| **ContractRef** | immutable semver + digest + storage_uri | immutable |
| **Event** | `seq`, `space_seq`, `instance_seq`, `type`, `outcome`, `payload`, `denial?` | append-only |
| **Gate** | `transition`, `quorum`, `checkpoint`, `downstream_outcome?` | pending→approved\|rejected |
| **Wait** | `condition`, `wait_token`, `delivery_mode` | registered→resolved\|expired |
| **Trigger** | `filter`, `action`, `dedup` template | active↔disabled |
| **TriggerDelivery** | `dedup_fingerprint`, `outcome`, `http?` | append-only |
| **Blob** | `namespace`, `digest`, `storage_key` | active→deleted |
| **FederationPeer** | `remote_hub_id`, `liveness` | active→disabled |
| **RoutingRule** | `match`, `action`: allow\|deny | active→disabled |
| **FederationQueueEntry** | `partition_key`, `partition_seq`, `state` | queued→delivered\|dead_letter |

### Topology invariants

- Siblings isolated by default
- Child→parent: read-only status upward
- Parent→child: dispatch downward only
- No child silent rewrite of parent

### Authorization evaluation order

1. Token valid (not revoked/expired)
2. Harness binding match (if enabled)
3. Grant scopes ∩ space install policy ∩ **actor kind** (`human_only` blocks agents)
4. Capability ACL
5. Live contract transition/event/query rules
6. Federation routing matrix (cross-hub only)

---

## Part 5 — Command & Query ports

### Platform scopes

`space:enter` · `space:read` · `event:read` · `event:emit` · `state:transition` · `blob:read` · `blob:write` · `capability:install` · `capability:configure` · `trigger:register` · `federation:emit` · `space:admin`

### Command catalog (mutations)

| Domain | Commands | Primary scope |
|--------|----------|---------------|
| Grants | `grant.mint`, `grant.revoke`, `grant.rotate`, `member.role.assign` | `space:admin` |
| Spaces | `space.create`, `space.update`, `space.archive` | `space:admin` |
| Instances | `instance.create`, `instance.metadata.patch`, `instance.archive` | `space:read` + contract |
| State | `state.transition`, `gate.resolve` | `state:transition` / role |
| Events | `event.append` | `event:emit` |
| Blobs | `blob.write` | `blob:write` |
| Sync | `wait.register`, `wait.cancel` | matching scope |
| Async | `trigger.register`, `trigger.disable`, `trigger.replay` | `trigger:register` / admin |
| Cross-space | `query.ask`, `query.answer`, `federation.emit` | policy + scopes |
| Evolution | `evolution.draft.upsert`, `validate`, `test.run`, `promote.request`, `promote.approve`, `live.apply`, `rollback` | `capability:install` / gate |
| Ops | `integration.probe`, `config.snapshot`, `audit.export`, `grants.export` | `space:admin` |

**Path convention:** `POST /v1/spaces/{space_id}/…` — `space_id` in path must match grant; never from body.

### Query catalog (reads)

| Domain | Queries | Scope |
|--------|---------|-------|
| Spaces | `space.get`, `space.list`, `topology.get` | `space:enter` |
| Instances | `instance.get`, `instance.list`, `state.get`, `gate.list` | `space:read` |
| Contracts | `contract.live.get`, `contract.draft.get`, `contract.diff.get` | `space:read` / install |
| Events | `event.subscribe` (SSE), `event.tail` | `event:read` |
| Blobs | `blob.get` | `blob:read` + fetch ACL |
| Coordination | `wait.poll`, `trigger.list`, `trigger.delivery.log` | `space:read` |
| Federation | `federation.status`, `query.policy.get` | `space:enter` / admin |
| Projections | `projection.audit`, `gate_queue`, `grants`, `integration_health`, `drift`, `federation` | admin / read |
| Auth | `auth.whoami`, `auth.evaluate` | any / admin |

### MCP platform tools (6)

| Tool | Maps to |
|------|---------|
| `get_space_state` | instance + state + contract.live |
| `transition` | `state.transition` |
| `emit_event` | `event.append` |
| `wait_for_state` | `wait.register` + `wait.poll` |
| `blob_read` / `blob_write` | blob get/write |

Capability tools registered at install; filtered by grant + contract. **Config-scoped `space_id` in env — no override in tool args.**

---

## Part 6 — State engine & contract model

### Contract schema (v2)

```json
{
  "schemaVersion": "2.0",
  "id": "review-loop",
  "version": "2.0.0",
  "initial_state": "draft",
  "terminal_states": ["converged", "archived"],
  "metadata_schema": { /* JSON Schema */ },
  "states": [{ "id": "draft", "kind": "active" }],
  "transitions": [{
    "id": "t1",
    "from": "draft",
    "to": "awaiting_review",
    "event": "open_review",
    "actors": ["agent:*"],
    "condition": null,
    "gate": null,
    "emit": ["review.opened"]
  }],
  "convergence": { "evaluate_on": ["enter:converged"], "rules": [...] },
  "events": { "declarations": [...] },
  "query_types": { "billing_status@1": { /* registry entry */ } },
  "inbound_queries": { /* per-type allowlists */ },
  "outbound_queries": { /* targets */ },
  "breaking_rules": { "major_if": ["state_removed", "..."] }
}
```

### Transition algorithm (12 steps)

1. Auth → 2. Load instance FOR UPDATE → 3. Optimistic lock (`expected_revision`) → 4. Load **pinned** contract → 5. Match transitions (event, actors, CEL condition) → 6. Pending gate check → 7. Payload/metadata validate → 8. **Pre-commit gate interrupt** (202 + gate_id) → 9. Convergence evaluate → 10. Commit state + revision++ → 11. Append journal + emit → 12. Resolve waits + async triggers

**409 body includes:** `current_state`, `revision`, `legal_transitions_for_actor[]`, `reason` enum.

### Gate model

- **Quorum:** `any` | `all` | `count`
- **Assignment:** role → members; optional named actors
- **Delegation:** pre-delegation record; break-glass owner; admin reassign
- **Reject path:** optional `on_reject.target_state`

### In-flight policy (ADR-04)

**`finish_current` (default):** instances pin `contract_ref_id` at create; breaking promote updates live pointer for **new** instances only; agents rebind on reconnect for new work.

### Condition evaluation

Hub-side **CEL** on read-only context: `{ state, metadata, actor, gates, hooks? }`. Max 512 chars. Promote-time parse validation only.

---

## Part 7 — Journal & persistence

### Storage (ADR-05)

| Store | Technology | Role |
|-------|------------|------|
| Journal | SQLite `journal_events` INSERT-only | Canonical truth |
| Snapshots | SQLite `instance_snapshots` write-through | Hot read path |
| Projections | SQLite + cursors | Rebuildable |
| Dedup | SQLite unique `(trigger_id, fingerprint)` | Async plane |
| Federation queue | SQLite ordered by `(partition_key, partition_seq)` | Cross-hub |
| Blobs | Filesystem by `storage_key` | Large artifacts |
| Export | Generated JSONL on demand | SOC2 — not truth |

**WAL mode;** commit journal before pub/sub fan-out.

### Event envelope v1

```typescript
{
  seq: number;              // hub-global
  space_seq: number;      // per space
  instance_seq?: number;   // per instance
  event_id: string;
  type: string;
  outcome: "success" | "denial";
  space_id: string;
  instance_id?: string;
  actor_id: string;
  token_id: string;
  harness?: string;
  ts: string;
  payload: object;          // ≤ 64 KiB
  blob_refs: BlobRef[];
  dedup_key?: string;
  denial?: { code, http_status, message, hints?, context? };
  federation?: { origin_hub_id, origin_seq, ingress: bool };
}
```

### Denial catalog (sample)

`scope_enforcement_failure` · `harness_binding_failure` · `transition_denied` · `gate_resolution_denied` · `blob_access_denied` · `query_failed` · `federation_policy_denied` · `token_denied` · `contract_validation_denied`

### Projection rebuild

Incremental handlers post-commit; ops command `studio hub rebuild-projections [--from-seq N]`.

---

## Part 8 — Sync coordination plane

### Wait condition union

```typescript
type WaitCondition =
  | { type: "state"; state: string; op?: "eq" | "in" }
  | { type: "gate"; gate_id?: string; resolution?: "approved" | "rejected" }
  | { type: "event"; event_type: string; match?: object }
  | { type: "contract"; capability_id: string; min_version?: string }
  | { type: "compound"; all_of?: WaitCondition[]; any_of?: WaitCondition[] }
```

### API flow

1. `RegisterWait` (subscribe **before** signal)
2. `HoldWait` / SSE stream / MCP one-shot

**Key:** `(space_id, instance_id, condition_fingerprint)` + client `wait_token` for reconnect.

### MCP reconnect (J13)

1. Connect → attach to control bus
2. `session.handshake` with `contract_versions[]`
3. Client `handshake_ack`
4. Drain durable outbox (24h TTL) — push `control.contract_updated`

### Timeouts

| Context | Default |
|---------|---------|
| CLI hold | 300s |
| MCP SSE | 1800s |
| Cross-space ask | min(client, type default, 30s platform max) |
| Wait registration TTL | 120s if no hold |

Timeout returns **200 + structured snapshot**, not silent hang.

---

## Part 9 — Async coordination plane

### Trigger registration (required fields)

- `filter`: event_types, source_spaces, capability_ids?, instance_id?
- `action`: handler_type + config (see allow-list)
- `dedup`: `{ required: true, source: "configured", key_path: "event.payload.diff_blob_id", window_seconds: 86400 }`
- `partition.key`: `space_id` (default) | `space_id:instance_id` | `trigger_id`
- `alerting.on_external_failure`: `default` | `enabled` | `disabled`

### Handler allow-list (v1)

| Type | Idempotent default |
|------|-------------------|
| `mcp_wake` | yes |
| `http_webhook` | configurable |
| `http_github_actions_dispatch` | **no** |
| `cli_allowlisted` | configurable |
| `cross_space_emit` | yes |
| `instance_transition` | conditional |

### Dedup precedence

1. Trigger `dedup.key_path` (JSONPath)
2. Else `event.dedup_key` from emitter
3. Else `event.id` (warn Lens B)

Store key: `sha256(trigger_id | partition | extracted_value)`.

### Integration credential vault

```json
{
  "credential_ref": "cred_github_novaform",
  "kind": "github_pat",
  "metadata": { "expires_at": "...", "scopes": [...] },
  "health": { "last_probe_outcome", "consecutive_failures" }
}
```

Expiry warnings at 30/7/1 days; block dispatch when expired.

### Replay

`trigger.replay { source_event_id, trigger_id, bypass_dedup?, reason }` — redispatch without re-append source event; audit `replay_of`.

### Dispatch lifecycle

```
journal append → match triggers → dedup check → enqueue(partition) → worker invoke
→ delivery log → integration_failure if external fail (default on)
→ optional instance_transition on success/fail
```

---

## Part 10 — Federation subsystem

### Routing policy (default deny)

```json
{
  "default_action": "deny",
  "global_forbidden_event_types": [
    "capability_install", "state_transition", "blob_write", "grant_create"
  ],
  "cross_hub_rules": [{
    "rule_id": "rule-personal-to-company",
    "source_hub": "hub-personal",
    "target_hub": "hub-company",
    "allowed_event_types": ["ask", "answer", "query_failed"],
    "allowed_source_spaces": ["comms"],
    "allowed_target_spaces": ["client-a-code"],
    "allowed_query_types": { "client-a-code": ["project_status_summary"] }
  }]
}
```

### Federation FSM

`disconnected` → `connecting` → `connected` ↔ `degraded` → `local_only` (on relay loss, ~30s heartbeat)

### Outbound queue

- Partition: `(target_hub_id, source_space_id)`
- **FIFO strict within partition**
- At-least-once delivery; `federation_dedup_key` on ingress
- Drain in `sequence` order on reconnect

### Ingress pipeline (12 stages)

Transport auth → envelope schema → dedup → registry → space liveness → routing matrix → inbound policy → event ACL → query policy → answer projection → topology → append

### Local-only classification (J13)

**Still works:** intra-hub everything (instances, transitions, blobs, local triggers, same-hub ask/answer)

**Queued:** cross-hub ask/answer/signals

**Fails fast:** sync cross-hub wait (timeout); queue overflow

---

## Part 11 — Cross-space protocol

### Event types

**Query plane:** `ask` · `answer` · `query_failed`

**Signal plane (allowlisted):** `escalation.required` · `deploy_requested` · `deploy_completed` · `knowledge.write` · …

### Ask payload

```json
{
  "query_id": "uuid",
  "query_type": "billing_status",
  "params": {},
  "response_schema": { /* JSON Schema, additionalProperties: false */ },
  "timeout_ms": 8000
}
```

### Answer payload

```json
{
  "query_id": "uuid",
  "status": "ok",
  "data": { /* schema-projected */ },
  "_attribution": {
    "source_space_id": "...",
    "source_hub_id": "...",
    "query_type": "...",
    "answered_at": "...",
    "answered_by_actor_id": "...",
    "answered_by_actor_kind": "agent"
  }
}
```

### Projection order (Accept answer)

1. Required + type validation → fail `query_failed`
2. Schema strip (allowlist keys only)
3. `forbidden_fields` pass (strip or reject per policy)
4. Semantic guards (topic allowlist for `context_fetch`)
5. Inject `_attribution` (non-overridable)
6. Route to source space; source re-validates

### Outbound validator (pre-append)

Auth → outbound_queries target/type → open schema forbidden → response_schema ⊆ registry → params validate → federation route → append + start watchdog

---

## Part 12 — Evolution pipeline

### FSM states

```
draft → validated → tested → promoted_pending? → promoted → live → superseded
         ↑ fail      ↑ fail
         └───────────┘
```

| State | Meaning |
|-------|---------|
| `draft` | Staged bundle |
| `validated` | Lens A pass |
| `tested` | Sandbox tests green |
| `promoted_pending` | Human gate (breaking / policy) |
| `promoted` | Slot reserved |
| `live` | Authoritative + `contract.updated` notify |
| `superseded` | Former live; rollback target |

### Lens A (blocking)

Manifest schema · contract graph reachability · gate roles exist · event refs · query types valid · install-parity · deps satisfiable

### Lens B (warnings)

Forward-compat · test coverage · N-1 client sim · query breadth · event payload narrowing

### Breaking semver

**Major if:** state removed · transition removed/narrowed · required metadata added · query type removed · required response field added

**Minor if:** additive states/events/optional fields

---

## Part 13 — Bootstrap & discovery

### File: `~/.studio/hubs/shared.json` (mode 0600)

```json
{
  "hubId": "hub-a1b2c3d4",
  "protocolVersion": "1",
  "coreVersion": "0.2.0",
  "authToken": "<64-char hex>",
  "host": "127.0.0.1",
  "port": 8787,
  "url": "http://127.0.0.1:8787",
  "pid": 12345,
  "startedAt": "2026-06-20T10:00:00.000Z",
  "deploymentProfile": "loopback",
  "federationMode": "local_only",
  "relayUrl": null
}
```

**Startup lock:** `<path>.lock/owner.json` — stale after 30s if pid dead.

---

## Part 14 — Deployment profiles

| Profile | Relay | Typical use | Cross-hub |
|---------|-------|-------------|-----------|
| `loopback` | No | Dev laptop, Loopcraft single hub | N/A |
| `hub+relay` | Required | Théo two-machine | Queue on partition loss |
| `always-on-server` | Optional | Loopcraft EC2 (J15) | Relay buffers hub restart |

| Guarantee | All profiles |
|-----------|--------------|
| Intra-hub transitions | Immediate, authoritative snapshot |
| Triggers | At-least-once + dedup; sequential per `space_id` |
| Cross-hub | At-least-once; per-partition FIFO; **no global ordering** |
| Blobs cross-hub | **Denied** |
| Gate approval | ≠ downstream integration success |

---

## Part 15 — Command flow (normative)

```
Auth
→ tenancy (space + instance)
→ contracts (live or pinned)
→ [RegisterWait + subscribe if blocking]
→ mutate OR build denial
→ BEGIN TX: allocate seq → INSERT journal → UPSERT snapshot → projections
→ COMMIT
→ notify (SSE resolve waits + journal fan-out)
→ async trigger dispatch (post-commit)
→ federation drain if reconnecting
```

---

## Part 16 — Gate 0 invariants (core-enforced)

1. No mutation without `(space_id, instance_id?, actor_id, token_id)`
2. Authority from token only
3. Transitions vs **live/pinned** contract + grants
4. No default active space/session
5. Triggers: allow-list + mandatory dedup; handlers idempotent
6. **All** promotes: validate → test → promote → notify → live
7. Clients read contracts via protocol; skills not law
8. Inline event cap 64 KiB; blobs by ref
9. Harness binding when enabled
10. Federation: at-least-once + dedup; no global ordering claim
11. Gate approval ≠ downstream success — instance reflects delivery outcome

---

## Part 17 — Explicit non-goals

Review/board/foundation semantics in core · Agent LLM loop in hub · Exactly-once global · Multi-tenant OAuth IdP v1 · Per-repo listeners · Anomaly ML (rule-based alerts only) · LangGraph as execution engine · Crit review routes in daemon

---

## Part 18 — Implementation priority

| Phase | Modules | Unblocks |
|-------|---------|----------|
| **P0** | auth, tenancy+instance, journal, contracts, state+gates, sync waits, audit/gate projections | Loopcraft J01 happy path |
| **P1** | blobs, async triggers+dedup, evolution full pipeline, grant lifecycle | J02/J06/J10/J12 |
| **P2** | federation, cross-space protocol, integration health, replay | Théo day-one |
| **P3** | discovery/daemon bootstrap, drift projections, MCP outbox | Ops polish |

---

## Part 19 — Reference patterns adopted

| Source | Adopted |
|--------|---------|
| **Open Design** | Contracts-first; Lens A/B; install-parity validate |
| **Crit** | Subscribe-before-signal; SSE + long-poll same bus |
| **LangGraph** | Gate as interrupt + checkpoint; pinned instance state |
| **Impeccable** | Journal canonical; snapshot repair from journal |
| **n8n** | Dedup store with TTL + unique constraint |
| **Cline** | Discovery file; daemon/client split; no agent loop in hub |
| **MCP SDK** | Bearer scopes; structured tool I/O; session-owner binding |

---

## Related documents

- [hub-core.md](./hub-core.md) — v2 summary (superseded by this doc for implementation)
- [hub-core-validation-2026-06-20.md](./hub-core-validation-2026-06-20.md) — journey review
- [../studio-v3-core-architecture-2026-06-20.md](../studio-v3-core-architecture-2026-06-20.md) — phase 1 analysis

**Next:** `@studio/contracts` Zod schemas implementing Part 4–12 wire types.
