# @murrmure/contracts (`packages/contracts`)

Murrmure rev-1 wire vocabulary — Zod schemas for hub entities, space index shapes, and CloudEvents journal envelopes.

**Publish id:** `@murrmure/contracts`.

## Entity inventory

| Entity | Schema module | rev-1 spec |
|--------|---------------|------------|
| Session | `entities/session.ts` | §3.2 |
| Run | `entities/run.ts` | §3.3 |
| RunStepMemo | `entities/run-step-memo.ts` | §8.3 |
| Gate | `entities/gate.ts` | §6.1 |
| Artifact | `entities/artifact.ts` | §7.3 (`mrmr.artifact/v1`) |
| Grant (v1) | `entities/grant.ts` | legacy scopes |
| Capability | `grants/capability.ts` | §9.1 |
| Action (indexed) | `entities/action.ts` | §4.1 |
| Executor binding | `entities/executor.ts` | §4.2 |
| Flow manifest | `flow/manifest.ts` | §5.2 |
| Flow index entry | `entities/flow-index.ts` | §5.4 |
| Flow attach | `flow/attach.ts` | §6.3 |
| Hook | `entities/hook.ts` | §5.3 |
| Journal (CloudEvents) | `journal/cloudevents.ts` | §8.1 |
| Journal event types | `journal/event-types.ts` | §8.2 |
| Inline payload helper | `journal/inline-payload.ts` | §7.1 (64 KiB cap) |
| Hub event (v1) | `entities/hub-event.ts` | migration shim |

## Alias policy

| v1 | v2 | Notes |
|----|-----|-------|
| `InstanceSchema` | `RunSchema` | v1 `InstanceSchema` kept for hub until phase 05; `RunSchema` accepts `instance_id` → `run_id` alias |
| `HubEventSchema` | `JournalEntrySchema` | Use `hubEventToJournalEntry()` during migration |

Kernel reaction side effects use `ReactionActionPort` in `@murrmure/runtime-contracts`; v2 indexed action lookup uses `ActionPort`.

## Tests

```bash
pnpm --filter @murrmure/contracts typecheck
pnpm --filter @murrmure/contracts test
```

Conformance: `conformance/cloudevents.test.ts` (CloudEvents required attributes).

## Related

- Normative spec: [current/product/spec.md](../../studio-specs/current/product/spec.md)
- Architecture entity map: [architecture.md §2](../../studio-specs/current/product/architecture.md#2-package-graph-workspace)
