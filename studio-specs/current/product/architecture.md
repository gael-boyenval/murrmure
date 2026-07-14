# Murrmure v2 — product architecture

**Status:** normative (v2 core shipped 2026-06-30)  
**Companion:** [spec.md](./spec.md) (wire + behavior) · [philosophy.md](./philosophy.md) (intent)  
**Hub kernel:** [hub/architecture.md](../hub/architecture.md) (journal, federation ADRs)  
**Backlog:** [plans/product/plan/index.md](../../plans/product/plan/index.md)

> Flows declare work; sessions track it; runs execute it; views project it; logs record it.

---

## 1. Layer model

```text
┌─────────────────────────────────────────────────────────────────┐
│  EDGES — observe / mutate / deliver                             │
│  shell-web · shell-ui · shell-client · cli · hub-daemon ·       │
│  executors (mcp · shell · queue · remote) · desktop             │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / SSE / MCP / fs
┌────────────────────────────▼────────────────────────────────────┐
│  MURRMURE PROTOCOL — hub-core                                   │
│  session · flow-engine · space-index · invoke · grants ·        │
│  step-memo projections · federation policy                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ CommandPort / QueryPort / ports
┌────────────────────────────▼────────────────────────────────────┐
│  GENERIC KERNEL — runtime-kernel                                │
│  aggregate(Run) · checkpoint(Gate) · reaction(Hook) · journal     │
└────────────────────────────┬────────────────────────────────────┘
                             │ PersistencePort
┌────────────────────────────▼────────────────────────────────────┐
│  PERSISTENCE — runtime-persistence · hub-persistence            │
└─────────────────────────────────────────────────────────────────┘

OUTSIDE HUB (never stored):
  View = client reading /v1/sessions, /v1/runs, journal SSE
  Agent = harness × task × context × space
  Space content = user directory (agent.md, skills, src/)
```

### Responsibility matrix

| Layer | Owns | Must never |
|-------|------|------------|
| **Protocol kernel** | Run lifecycle, gate interrupt, hook dedup/delivery, journal append, idempotency | Prompts, flow graphs, UI, executor implementation |
| **Flow engine** | Manifest compile, matrix planning, start conditions, invoke/`start_flow` dispatch | Business logic, agent config, view rendering |
| **Space index** | Parse/index `.mrmr/` files (`space/`, `flows/`, `views/`) | Own agent content; interpret param semantics |
| **Session correlation** | Grouping, `subject` path, derived status from child runs | Step state machines (Runs own those) |
| **Executor adapters** | Preflight, dispatch, completion reporting | LLM loops; silent queue-without-visibility |
| **Shell** | Flowchart, gates, notifications, logs, CLI instruction pages | Author graphs; agent definitions |
| **CLI** | `space link/apply`, grant mint, headless invoke | Replace hub enforcement |

**PR test:** *Is this protocol, flow, view rule, or space implementation?*

---

## 2. Package graph (workspace)

```text
@murrmure/contracts              ← rev-1 wire Zod (Session, Run, CE journal, …)
       ↑
@murrmure/hub-core               ← Murrmure domain + flow-engine + space-index
       ↑
@murrmure/hub-persistence
       ↑
@murrmure/hub-daemon             ← HTTP/SSE/MCP routes + composition root

Adapters & products:
  @murrmure/executors            ← ExecutorPort (shell_spawn, mcp_session, …)
  @murrmure/shell-client · shell-ui · shell-web
  @murrmure/cli                  ← mrmr + setup/grants + bundled skill
  @murrmure/view-sdk             ← custom view host + app mount helpers
  @murrmure/mcp-bridge           ← murrmure-mcp stdio bridge (bundled in apps/desktop)
  apps/desktop                   ← Electrobun host (hub sidecar + shell + mcp-bridge)
```

**Boundary CI:** `hub-core` must not import SQLite, `node:fs`, or HTTP frameworks. Daemon is composition + routes only.

### Entity → module map

| Entity | Module |
|--------|--------|
| Session | `packages/contracts/src/entities/session.ts` |
| Run | `packages/contracts/src/entities/run.ts` |
| Gate | `packages/contracts/src/entities/gate.ts` + `hub-core/gates/` |
| Hook / Handler | `contracts/entities/handler.ts` + `hub-core/hooks/` + `hub-core/index/parse-handlers.ts` |
| Action / Executor *(legacy)* | `contracts/entities/action.ts`, `executor.ts` + `hub-core/index/` + `executors/` — superseded by handlers for default spaces |
| Flow | `contracts/flow/*` + `hub-core/flow-engine/` |
| Journal | `contracts/journal/cloudevents.ts` |
| RunStepMemo | `contracts/entities/run-step-memo.ts` + `hub-core/projections/step-memo.ts` |
| View | *(not stored)* — shell + optional `view-sdk` |

---

## 3. v2 resolutions (shipped)

Architecture review items P1–P6, U1–U6, O1–O3, F1–F3 are normative in [spec.md §16b](./spec.md#16b-architecture-resolutions-2026-06-30).

| Area | Shipped behavior |
|------|------------------|
| Parallel matrix | Eager sibling runs at step entry |
| Headless step ids | `hook:{id}`, `action:{name}`, `orchestration:proposed` |
| Views | Space-owned `view_resolver` in `handlers.yaml` + `.mrmr/views/`; no hub registry or flow-owned View identity |
| Federation | Virtual `remote_hub` bindings, cross-hub artifacts |
| Out-of-shell notify | Gate pending + run failed |
| Flow-call | `start_flow` step + `flow_call` start condition |

---

## 4. Anti-patterns

| Anti-pattern | Guardrail |
|--------------|-----------|
| Fat daemon with domain logic | Move to `hub-core` |
| Hub view registry | Views are clients; the shell reads the space's `view_resolver` projection on `open_steps[]` without apply-time flow denormalization |
| Silent executor unavailable | ExecutorPort preflight + typed error |
| Session owns step state | Runs + step memo own execution state |
| Hub runs LLM loop | Out of scope |
| Assume declarative `gate` steps run | Engine dispatches invoke/start_flow only until backlog B1 |

---

## 5. Not shipped (see plan / deferred)

| Topic | Where tracked |
|-------|----------------|
| Declarative gate steps, step outputs, mid-flow views, apply lint, flow scaffold | [plan/index.md](../../plans/product/plan/index.md) |
| Gate quorum, in-hub queue runtime, A2A wire, dynamic matrix from step output | [deferred.md](./deferred.md) |

---

## Historical drafts

Full rev-1 draft text (pre-promotion): [archives/plans/product/](../../archives/plans/product/).
