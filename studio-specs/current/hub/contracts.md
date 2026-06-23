# Murrmure hub — wire contracts

Normative wire types, command vocabulary, and kernel mapping for `@murrmure/contracts`. Hub architecture (modules, federation, evolution) is in [architecture.md](./architecture.md).

## Provenance

Every command carries: `space_id`, `instance_id?`, `actor_id`, `token_id`, `command_id?`. **Path `space_id` is authority** — never accept override in body.

## IDs

Prefixed ULID: `spc_`, `ins_`, `tok_`, `grt_`, `evt_`, `chk_`, `trg_`, `hub_`, `qry_`, `act_`.

## Entity schemas (S0)

Space, Instance, Grant, Member, ContractRef, Gate, HubEvent, FlowInstall, Trigger.

### FlowInstall

| Field | Meaning |
|-------|---------|
| `install_id` | Primary key |
| `space_id` | Owning space |
| `flow_id` | Flow slug from manifest `id` |
| `version` | Semver |
| `evolution_state` | draft → validated → tested → promoted → live → superseded |
| `contract_ref_id` | Hub-assigned contract digest |
| `bundle_digest` | Runtime blob sha256 |
| `source_digest` | Source snapshot sha256 |
| `source_metadata` | `source_path`, `built_at`, `cli_version`, `dev_kit_version` |

### Grant (flow ACL)

| Field | Meaning |
|-------|---------|
| `scopes[]` | Platform scopes including `flow:install`, `flow:configure` |
| `flow_acl` | Allowed flow ids for domain MCP tools |
| `harness_binding` | e.g. `cursor-local`, `cloud-worker` |
| `blob_namespace_acl` | Blob read/write namespaces |

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
| `evolution.draft.upsert` | Flow install draft |
| `evolution.validate` / `evolution.test.run` | Lens A/B pipeline |
| `evolution.promote.request` / `evolution.rollback` | Version promotion |
| `evolution.live.apply` | Mount refresh (flow-runtime) |
| `blob.read` / `blob.write` | Blob storage |
| `audit.export` | SOC2 export |

## Queries

`space.get`, `space.list`, `instance.get`, `instance.list`, `state.get`, `gate.list`, `event.tail`, `wait.poll`, `auth.whoami`, `flow.list`, `flow.get`, `contract.diff.get`, `trigger.list`, `trigger.delivery.log`, `projection.grants`, `grants.export`, `federation.status`, `mcp.catalog.for_token`, `query.get`.

## WaitCondition

Types: `state` | `gate` | `event` | `contract` | `compound`.

| Murrmure | Kernel |
|----------|--------|
| `gate` | `checkpoint` |
| `event` | `entry` |
| `contract` | `artifact` |

## Contract v2

`schemaVersion: "2.0"` — states, transitions, gates, events.declarations, inbound_queries, outbound_queries, metadata_schema, mcp_tools_by_version.

Fixture: [../fixtures/hub/linear-demo-v2.json](../fixtures/hub/linear-demo-v2.json).

## Kernel bridge

Vocabulary mapping:

| Murrmure | Kernel |
|----------|--------|
| `space_id` | `scope_id` |
| `instance_id` | `aggregate_id` |
| `token_id` | `credential_id` |
| `gate_id` | `checkpoint_id` |
| `trigger_id` | `reaction_id` |
| `space_seq` | `scope_seq` |
| `instance_seq` | `aggregate_seq` |

Command mapping:

| Murrmure | Kernel |
|----------|--------|
| `instance.create` | `aggregate.create` |
| `state.transition` | `state.transition` |
| `gate.resolve` | `checkpoint.resolve` |
| `event.append` | `event.append` |
| `wait.register` | `wait.register` |
| `wait.cancel` | `wait.cancel` |
| `wait.poll` | **QueryPort** |

Ports wired in `@murrmure/hub-core`: PolicyPort, RulesPort (v2 bridge), ConditionPort (CEL), NotifyPort (in-proc SSE/long-poll fan-out). `gate_queue` projection on kernel ProjectionPort.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `MURRMURE_HUB_URL` | Hub base URL (CLI, MCP, shell) |
| `MURRMURE_HUB_TOKEN` | Bearer token for agent/human |
| `MURRMURE_SPACE_ID` | Default space (MCP tools — no space_id in tool args) |
| `MURRMURE_DEPLOY_TOKEN` | CI push attestation |
| `MURRMURE_INSTALL_ID` | Worker spawn context |
| `MURRMURE_PACKAGE_ID` | Legacy alias for flow id in worker env — prefer `MURRMURE_FLOW_ID` |
| `MURRMURE_FLOW_ID` | Live flow id in worker subprocess |
| `MURRMURE_VERSION` | Live semver in worker subprocess |
| `MURRMURE_CONTRACT_REF_ID` | Pinned contract ref in worker |

No `STUDIO_*` legacy aliases in Murrmure v1.

## Package layout

```
packages/hub-core/               @murrmure/hub-core
packages/hub-persistence/        @murrmure/hub-persistence
packages/hub-daemon/             @murrmure/hub-daemon
packages/cli/                    @murrmure/cli (MCP + skill + flow build bundled)
packages/flow-dev-kit/           @murrmure/flow-dev-kit
packages/skill/                  @murrmure/skill (private)
packages/contracts/              @murrmure/contracts
```

Export pattern: `@murrmure/contracts/commands/*`, `/queries/*`, `/sse/*`, `/mcp/tools`, `/discovery`, `/evolution`, `/errors`.

## Implementation decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| In-process composition | `@murrmure/hub-core` calls kernel CommandPort/QueryPort in-process | No sidecar HTTP; production entry = hub-daemon |
| Monorepo | [gael-boyenval/murrmure](https://github.com/gael-boyenval/murrmure) workspace; hub packages alongside kernel | Single daemon mount |
| Node runtime | Bun for hub-daemon; TypeScript throughout | Team stack |
| Wire IDs | Prefixed ULID (`spc_`, `ins_`, …) | Sortable, grep-friendly |
| Single database | One SQLite WAL per hub process | Simplicity v0 |
| Contract bridge | RulesPort loads contract v2 JSON; hub validates transitions | OD/Crit pattern |

## Related fixtures

- [../fixtures/hub/linear-demo-v2.json](../fixtures/hub/linear-demo-v2.json) — contract v2 example
- [../fixtures/kernel/](../fixtures/kernel/) — kernel golden rules and journal scenarios
