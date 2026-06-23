# Studio hub — wire contracts

Normative wire types, command vocabulary, and kernel mapping for `@studio/contracts`. Hub architecture (modules, federation, evolution) is in [architecture.md](./architecture.md).

## Provenance

Every command carries: `space_id`, `instance_id?`, `actor_id`, `token_id`, `command_id?`. **Path `space_id` is authority** — never accept override in body.

## IDs

Prefixed ULID: `spc_`, `ins_`, `tok_`, `grt_`, `evt_`, `chk_`, `trg_`, `hub_`, `qry_`, `act_`.

## Entity schemas (S0)

Space, Instance, Grant, Member, ContractRef, Gate, HubEvent, CapabilityInstall, Trigger.

## Commands (S1+)

| Command | Purpose |
|---------|---------|
| `space.create` | Bootstrap or admin creates space |
| `space.update` | Patch space settings |
| `space.archive` | Archive when no active instances |
| `instance.create` | New instance with pinned contract ref |
| `instance.metadata.patch` | JSON bag merge (product extension) |
| `state.transition` | FSM event on instance |
| `gate.resolve` | Human checkpoint decision |
| `event.append` | Custom/async event |
| `wait.register` / `wait.cancel` | Sync coordination |
| `query.ask` / `query.answer` | Cross-space queries (XS0+) |
| `grant.mint` / `grant.revoke` / `grant.rotate` | Agent access |
| `member.invite` / `member.role.assign` / `member.remove` | Human members |
| `trigger.register` / `trigger.disable` / `trigger.replay` | Async reactions |
| `evolution.draft.upsert` | Capability install draft |
| `evolution.validate` / `evolution.test.run` | Lens A/B pipeline |
| `evolution.promote.request` / `evolution.rollback` | Version promotion |
| `evolution.live.apply` | Mount refresh (capability-runtime) |
| `blob.read` / `blob.write` | Blob storage |
| `audit.export` | SOC2 export |

## Queries

`space.get`, `space.list`, `instance.get`, `instance.list`, `state.get`, `gate.list`, `event.tail`, `wait.poll`, `auth.whoami`, `capability.list`, `capability.get`, `contract.diff.get`, `trigger.list`, `trigger.delivery.log`, `projection.grants`, `grants.export`, `federation.status`, `mcp.catalog.for_token`, `query.get`.

## WaitCondition

Types: `state` | `gate` | `event` | `contract` | `compound`.

| Studio | Kernel |
|--------|--------|
| `gate` | `checkpoint` |
| `event` | `entry` |
| `contract` | `artifact` |

## Contract v2

`schemaVersion: "2.0"` — states, transitions, gates, events.declarations, inbound_queries, outbound_queries, metadata_schema, mcp_tools_by_version.

Fixture: [../fixtures/hub/linear-demo-v2.json](../fixtures/hub/linear-demo-v2.json).

## Kernel bridge

Vocabulary mapping:

| Studio | Kernel |
|--------|--------|
| `space_id` | `scope_id` |
| `instance_id` | `aggregate_id` |
| `token_id` | `credential_id` |
| `gate_id` | `checkpoint_id` |
| `trigger_id` | `reaction_id` |
| `space_seq` | `scope_seq` |
| `instance_seq` | `aggregate_seq` |

Command mapping:

| Studio | Kernel |
|--------|--------|
| `instance.create` | `aggregate.create` |
| `state.transition` | `state.transition` |
| `gate.resolve` | `checkpoint.resolve` |
| `event.append` | `event.append` |
| `wait.register` | `wait.register` |
| `wait.cancel` | `wait.cancel` |
| `wait.poll` | **QueryPort** |

Ports wired in `@studio/hub-core`: PolicyPort, RulesPort (v2 bridge), ConditionPort (CEL), NotifyPort (in-proc SSE/long-poll fan-out). `gate_queue` projection on kernel ProjectionPort.

## Package layout

```
packages/studio-contracts/src/   ← leaf, no @runtime/*
packages/studio-hub-core/
packages/studio-hub-persistence/
packages/studio-hub-daemon/
packages/studio-hub-mcp/
packages/studio-hub-cli/
packages/studio/capability-sdk/
```

Export pattern: `@studio/contracts/commands/*`, `/queries/*`, `/sse/*`, `/mcp/tools`, `/discovery`, `/evolution`, `/errors`.

## Implementation decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| In-process composition | `@studio/hub-core` calls kernel CommandPort/QueryPort in-process | No sidecar HTTP; production entry = hub-daemon |
| Monorepo | agentStudio workspace; hub packages alongside kernel | Single daemon mount |
| Node runtime | Bun for hub-daemon; TypeScript throughout | Team stack |
| Wire IDs | Prefixed ULID (`spc_`, `ins_`, …) | Sortable, grep-friendly |
| Single database | One SQLite WAL per hub process | Simplicity v0 |
| Contract bridge | RulesPort loads contract v2 JSON; hub validates transitions | OD/Crit pattern |

## Related fixtures

- [../fixtures/hub/linear-demo-v2.json](../fixtures/hub/linear-demo-v2.json) — contract v2 example
- [../fixtures/kernel/](../fixtures/kernel/) — kernel golden rules and journal scenarios
