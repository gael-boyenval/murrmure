# Flow engine bridge

Maps rev-1 flow manifest semantics to hub runtime behavior. See [product/spec.md](../product/spec.md) §5.2, §5.4, §5.6, §9.2, §12.3 and [product/architecture.md](../product/architecture.md).

## Module

`packages/hub-core/src/flow-engine/`

| File | Role |
|------|------|
| `parse.ts` | YAML → `FlowManifestSchema`; rejects inline script steps and legacy step kinds |
| `compile.ts` | Canonical IR + `sha256:` digest stored on index |
| `plan.ts` | Linear step plan (`start_flow`) |
| `matrix.ts` | Matrix resolution + sibling run idempotency keys |
| `join.ts` | Wait for sibling runs before parent advances |
| `graph.ts` | `GET /v1/runs/{id}/graph` overlay builder |
| `advance-runner.ts` | Post-step matrix expansion + join + next dispatch |
| `advance.ts` | Step dispatch builder (step-contract only) |
| `exec-context.ts` | `mergeStepOutputIntoExecContext`, input merge |
| `engine-capabilities.ts` | Apply lint — rejects legacy `invoke`/`checkpoint`/`gate`/`wait` step kinds |
| `start.ts` | Manual / event / schedule preflight |
| `start-flow.ts` | `start_flow` child run orchestration |
| `run-service.ts` | Session + Run creation, idempotency |
| `space-home.ts` | Aggregated `/v1/spaces/:id/home` payload |
| `templates.ts` | `{{input.*}}`, `{{steps.*}}`, `{{event.*}}` resolution |
| `step-contract-compile.ts` | YAML → `StepContractCatalog`; nested flatten |
| `step-resolve.ts` | Unified `resolve_step` handler; nested child return |
| `step-open.ts` | Open step + exclusive handler assignment dispatch |
| `open-child-step.ts` | Atomic parent yield, credential revocation, direct-child activation |
| `step-catalog.ts` | Catalog lookups; nested children ordering |
| `step-contract-slice.ts` | Runtime injection slice + `active-step-contract.json` |

## Index pipeline

```
mrmr space apply → parseFlowManifest → compileFlowIr → FlowIndexEntry (+ ir)
```

Runs pin `flow_digest` from compiled IR at start.

## Step contracts (v3, resolver-agnostic)

Flows authored with resolver-agnostic **`step`** blocks compile a **`StepContractCatalog`** at apply time. Runtime progression uses **`POST /v1/runs/{run_id}/steps/{step_id}/resolve`** (MCP: `murrmure_resolve_step`) — not gate resolve or `complete_action`. Start conditions live under **`triggers`** (the only start-condition field); the removed `start` and `requires_view` are rejected.

| Concept | Behavior |
|---------|----------|
| **Top-level step** | `route: { step: <id> }` opens the next step; `route: { run: completed \| failed }` terminates |
| **Nested step** | Qualified id `parent.child`; assigned parent activates one direct child with `murrmure_open_child_step`; child `resume` returns to the yielded ancestor |
| **Call/return** | Child activation yields/revokes parent before dispatch; return creates a fresh parent assignment with canonical `returned_child` |
| **Default branches** | Omitted `branches` inject `completed` / `failed`; explicit maps are exact (`branches: {}` rejected) |
| **Unbound step** | No handler ⇒ open and externally resolvable; `open_steps[]` projects `resolver: null` |

Normative detail: [step-contract.md](./step-contract.md). Execution binding: [handlers.md](./handlers.md).

### Nested runtime (preview-review)

1. Engine opens **build** and dispatches its exclusive resolver assignment.
2. Parent calls `murrmure_open_child_step(build.build-loop)`; parent becomes
   `yielded`, its credential/process are revoked, and the child opens.
3. Build child resolves with `{ preview_url }`; `resume: build` creates a fresh
   parent assignment containing that canonical `returned_child`.
4. Parent opens **build.review** and yields. The View resolves review.
5. `changes_required` resumes the parent so it can open a new build iteration;
   `validated` resumes the parent so it can resolve its own completed branch and
   open **archive**.

Run graph (`GET /v1/runs/{id}/graph`) renders nested nodes when `step_contract_catalog` is present.

## Removed legacy engine surface (historical)

> The v2 `invoke:`, `checkpoint:`, `gate:`, and `wait:` step kinds, the
> `on_resolve`/`goto` routing, `isDeclarativeCheckpointStep`, and the
> `checkpoint-dispatch` / `checkpoint-resolve` / `checkpoint-runner` modules
> were removed in the Task 15 Lane A cutover. Flows are resolver-agnostic step
> contracts only ([step-contract.md](./step-contract.md)); flow steps advance
> through `step:resolve`, never through gates. The only retained gate surface
> is orchestration approval (`POST /v1/gates/:gate_id/resolve`, `flow:run`,
> space-bound) for operator attach flows — not flow-step progression.

## HTTP routes

| Method | Path | Notes |
|--------|------|-------|
| POST | `/v1/flows/{id}/run` | Manual start; creates session + run |
| POST | `/v1/sessions/{id}/runs` | Existing path; dispatches first step when `flow_id` set |
| POST | `/v1/runs/{id}/steps/{step_id}/resolve` | `step:resolve` — branch + payload; flow-step progression |
| POST | `/v1/gates/{gate_id}/resolve` | Orchestration gate approval only (`flow:run`, space-bound) |
| GET | `/v1/spaces/{id}/home` | Six space-home sections |
| GET | `/v1/runs/{id}/graph` | Manifest overlay + step memo + matrix lanes |

## CLI

```bash
mrmr flow run flw_morning_brief --input '{"topic":"news"}'
```

Index refresh: `mrmr space apply` (not `mrmr flow push`).

## Scheduler

`packages/hub-daemon/src/flow-scheduler-cron.ts` — minute tick evaluates `triggers.schedule` cron expressions.

## Event start

Journal / space events matching `triggers.events` invoke `matchFlowEventStarts` after trigger dispatch.

## Backlog

See [plan/index.md](../../plans/product/plan/index.md) and [product/spec.md §21](../product/spec.md).
