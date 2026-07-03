# Flow engine bridge

Maps rev-1 flow manifest semantics to hub runtime behavior. See [product/spec.md](../product/spec.md) §5.2, §5.4, §5.6, §9.2, §12.3 and [product/architecture.md](../product/architecture.md).

## Module

`packages/hub-core/src/flow-engine/`

| File | Role |
|------|------|
| `parse.ts` | YAML → `FlowManifestSchema`; rejects inline script steps |
| `compile.ts` | Canonical IR + `sha256:` digest stored on index |
| `plan.ts` | Linear step plan (`invoke`, `gate`, `start_flow`) |
| `matrix.ts` | Matrix resolution + sibling run idempotency keys |
| `join.ts` | Wait for sibling runs before parent advances |
| `graph.ts` | `GET /v1/runs/{id}/graph` overlay builder |
| `advance-runner.ts` | Post-step matrix expansion + join + next dispatch |
| `advance.ts` | Step dispatch builder — `invoke` + checkpoint planner |
| `checkpoint-dispatch.ts` | `buildCheckpointDispatch` — gate create payload |
| `checkpoint-resolve.ts` | `on_resolve` branch planner (max depth 32) |
| `checkpoint-runner.ts` | Gate open + resolve advance |
| `exec-context.ts` | `mergeStepOutputIntoExecContext`, input merge |
| `engine-capabilities.ts` | `ENGINE_DISPATCH_KINDS` + apply lint |
| `start.ts` | Manual / event / schedule preflight |
| `start-flow.ts` | `start_flow` child run orchestration |
| `run-service.ts` | Session + Run creation, idempotency |
| `space-home.ts` | Aggregated `/v1/spaces/:id/home` payload |
| `templates.ts` | `{{input.*}}`, `{{steps.*}}`, `{{event.*}}` resolution |
| `cron.ts` | Schedule expression evaluation |

## Index pipeline

```
mrmr space apply → parseFlowManifest → compileFlowIr → enrichCheckpointViewRefs → FlowIndexEntry (+ ir)
```

Runs pin `flow_digest` from compiled IR at start.

## Engine dispatch capabilities (runtime)

**Source of truth:** `packages/hub-core/src/flow-engine/engine-capabilities.ts` — `ENGINE_DISPATCH_KINDS`.

| Step kind | Indexed / IR | Dispatched by advance | Apply lint (default) |
|-----------|--------------|----------------------|----------------------|
| `invoke` | ✅ | ✅ | cross-ref actions/executors |
| `start_flow` | ✅ | ✅ | — |
| `parallel.matrix` | ✅ | ✅ | — |
| `gate` / `checkpoint` | ✅ | ✅ | checkpoint view + `on_resolve` lint |
| `wait` | ✅ | ❌ | warn |
| Checkpoint `view` + `dist/` | manifest | — | warn; strict fails if view missing or not built |
| `on_resolve.default` / `cancel` | manifest | — | warn; strict fails if missing |
| `{{steps.*}}` templates | ✅ parse | ✅ resolve at dispatch | — |

### Checkpoint runtime (phase 03)

1. **On entry:** `createPendingGate`, run lifecycle → `input-required`, step memo → `working`, hold advance.
2. **On resolve:** `{ disposition: continue|cancel, output? }` → `steps[step_id].output`, optional input merge (step 0), `on_resolve` branch (`goto` / `fail`).
3. **Loop-back:** `goto` resets target + downstream step memos to `pending` and re-dispatches.

Fixtures: `studio-specs/current/fixtures/flow-engine/`.

## HTTP routes

| Method | Path | Notes |
|--------|------|-------|
| POST | `/v1/flows/{id}/run` | Manual start; creates session + run |
| POST | `/v1/sessions/{id}/runs` | Existing path; dispatches first step when `flow_id` set |
| POST | `/v1/gates/{id}/resolve` | v2 `{ disposition, output }`; legacy `decision` mapped |
| GET | `/v1/spaces/{id}/home` | Six space-home sections |
| GET | `/v1/runs/{id}/graph` | Manifest overlay + step memo + matrix lanes |

## CLI

```bash
mrmr flow run flw_morning_brief --input '{"topic":"news"}'
```

Index refresh: `mrmr space apply` (not `mrmr flow push`).

## Scheduler

`packages/hub-daemon/src/flow-scheduler-cron.ts` — minute tick evaluates `start.schedule` cron expressions.

## Event start

Journal / space events matching `start.events` invoke `matchFlowEventStarts` after trigger dispatch.

## Backlog

See [plan/index.md](../../plans/product/plan/index.md) and [product/spec.md §21](../product/spec.md).
