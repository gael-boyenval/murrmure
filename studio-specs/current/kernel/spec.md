---
topic: Declarative runtime kernel — business-agnostic engine specification
date: 2026-06-20
status: specification (reviewed 2026-06-20 — see runtime-kernel-review-2026-06-20.md)
parent: hub-core-v2.md
purpose: >
  Minimal durable engine beneath product layers (spaces, MCP, federation, evolution).
  Hexagonal command executor over declarative FSM, append-only journal, post-commit fan-out.
---

# Runtime kernel specification

A **business-agnostic execution engine** that turns external rule artifacts into validated state transitions, records every outcome in an append-only journal, and fans out post-commit reactions to synchronous waiters and asynchronous workers.

Studio product concepts (spaces, grants, MCP, federation, evolution pipelines) are **adapters and policy plugins** on this kernel — not part of it.

**Review:** Three-agent critique synthesized in [runtime-kernel-review-2026-06-20.md](./runtime-kernel-review-2026-06-20.md).

---

## 1. Purpose

### 1.1 What this software does

1. Accepts **commands** from driving adapters (HTTP, CLI, in-process, message bus).
2. Evaluates **authority** via a pluggable policy port (no embedded RBAC).
3. Loads **rule artifacts** (declarative FSM graphs) by immutable reference.
4. Executes **state transitions** on aggregates with optimistic concurrency.
5. Supports **pre-commit checkpoints** (human or external approval) without mutating aggregate state until resolved.
6. **Appends** every success and denial to a monotonic journal inside a transaction.
7. Maintains **write-through snapshots** for hot reads.
8. **Fans out** post-commit to sync waiters, async matchers, projection handlers, and notify adapters.
9. Allows **projections** to be rebuilt from the journal at any time.

### 1.2 What this software does not do

- Domain workflow semantics (review, billing, deploy, etc.)
- User/role/tenant product models (only opaque scope + actor + credential IDs)
- Wire protocol choice (REST, MCP, gRPC — all adapters)
- Multi-node federation routing (optional product module using kernel primitives; see §21)
- Rule authoring, semver governance, CI validation (upstream of kernel)
- LLM/agent loops
- Exactly-once side effects globally (at-least-once + idempotent handlers only)

### 1.3 Design goals

| Goal | Mechanism |
|------|-----------|
| Endure policy change | Policy port is swappable; kernel never parses role syntax |
| Endure product evolution | Adapters thin; domain vocabulary lives outside |
| Endure storage change | Persistence port; journal semantics fixed |
| Minimal maintenance | Few modules, explicit invariants, property-testable core |
| Observable correctness | Journal is inspectable; denials are first-class entries |

---

## 2. Architectural patterns (fixed)

| ID | Pattern | Kernel obligation |
|----|---------|-------------------|
| P1 | Hexagonal (ports & adapters) | Zero I/O in domain; all edges via interfaces |
| P2 | CQRS-lite | Commands mutate via journal; queries read snapshots/projections/journal tail |
| P3 | Lite event sourcing | Journal append-only = source of truth |
| P4 | Write-through snapshot | Derived aggregate state updated in same TX as journal append (when state changes) |
| P5 | Declarative FSM executor | Transition logic lives in external rule artifacts only |
| P6 | Pre-commit checkpoint | Pause before state write; resume via separate command |
| P7 | Post-commit pub/sub | No subscriber runs inside the write transaction |
| P8 | Subscribe-before-signal | Sync waiters registered before causing mutation |
| P9 | Async match + dedup + queue | Side effects post-commit; idempotent by design |
| P10 | Rebuildable projections | Read models are caches; replay restores them |

---

## 3. Package structure

```
@murrmure/runtime-contracts     ← wire types + port interfaces only (no I/O)
@murrmure/runtime-kernel        ← pure domain (executor, journal logic, waiters, reactions)
@murrmure/runtime-persistence   ← driven adapter: journal, snapshots, dedup, projection storage
@murrmure/runtime-daemon        ← optional: wiring, config, health (thin)
```

**Dependency rule:** `contracts` ← `kernel` ← `persistence` ← `daemon`. **`kernel` must not depend on persistence implementation.**

**Module naming:** use `waiters` and `reactions` (not `sync`/`async` — reserved/confusable in JS/TS).

---

## 4. Domain vocabulary (generic)

| Term | Meaning |
|------|---------|
| **Scope** | Opaque tenancy boundary ID (`scope_id`). Kernel does not interpret hierarchy. |
| **Aggregate** | Running instance of a rule-bound workflow (`aggregate_id`). Has state, metadata, revision. |
| **Actor** | Opaque principal ID (`actor_id`) that initiated a command. |
| **Credential** | Opaque token reference (`credential_id`) proving actor authority. |
| **RuleRef** | Immutable pointer to a rule artifact (`rule_ref_id` + digest). Pinned on aggregate create. |
| **RuleArtifact** | Declarative FSM graph loaded from storage. |
| **Checkpoint** | Pending approval blocking a transition (product: "gate"). |
| **Waiter** | Registered interest in a future journal-derived condition. |
| **Reaction** | Registered async handler triggered by journal entry match (product: "trigger"). |

No product nouns (space, grant, capability) in kernel public API.

---

## 5. Module responsibilities

### 5.1 `command` (ingress orchestration)

- Parse/normalize incoming command envelope.
- Idempotency check (`command_id`).
- Invoke policy port → allow or build denial.
- Route to executor, checkpoint resolver, or event appender.
- Coordinate subscribe-before-signal ordering for blocking commands.
- Never perform I/O directly.

### 5.2 `policy` (port only in kernel)

```typescript
interface PolicyPort {
  evaluate(ctx: CommandContext): Promise<PolicyResult>;
}

interface CommandContext {
  scope_id: string;
  aggregate_id?: string;
  actor_id: string;
  credential_id: string;
  actor_kind?: "human" | "agent" | "system"; // opaque hint; kernel does not interpret
  command_kind: string;
  payload?: Record<string, unknown>;
  // Optional post-load hook: product may request second evaluate with aggregate snapshot
}
```

Kernel calls policy **once pre-dispatch** by default. Products needing state-dependent authority may use a **post-load policy hook** (same port, `phase: "post_load"`) — optional in adapter, not required in kernel v1.

### 5.3 `rules` (port)

```typescript
interface RulesPort {
  load(ref: RuleRef): Promise<RuleArtifact>;
  loadByKey(scope_id: string, rule_set_key: string): Promise<RuleRef>; // product: "live" pointer
}
```

### 5.4 `executor` (FSM engine)

- Load aggregate snapshot + pinned RuleRef.
- Match transition: `(from_state, event, actor eligibility, condition)`.
- **Actor eligibility:** kernel passes `{ actor_id, patterns[] }` to `ConditionPort.matchActor` — kernel does **not** parse `role:` or `*` syntax (K2).
- Evaluate transition guards via `ConditionPort.evaluate`.
- Validate metadata via `SchemaPort.validate` against `metadata_schema`.
- If transition requires checkpoint → create Checkpoint record, return `pending` **without** state change.
- On terminal state enter → evaluate optional `convergence` block via `ConvergencePort` (product DSL); may emit additional journal entries.
- On `transition_denied` → populate `denial.context.legal_transitions_for_actor[]` from rule artifact + actor eligibility.
- Return `ExecutionResult` for journal builder.

**Revision lock:** pre-flight revision check in executor is **advisory**. Authoritative lock is **compare-and-set inside commit transaction** (§11).

### 5.5 `checkpoint` (interrupt registry)

- Store checkpoint linked to `(aggregate_id, transition_id, checkpoint_payload)`.
- See §5.5.1 for lifecycle.

### 5.5.1 Checkpoint lifecycle

The kernel retains only checkpoint **creation** — the minimal checkpoint surface needed
for waiters and the `gate_queue` projection. A transition whose rule declares a
`checkpoint` quorum appends a `checkpoint.created` entry and pauses the aggregate in
`checkpoint_pending` (202 Accepted) with **no state change**. The pending checkpoint
records `(aggregate_id, transition_id, quorum, assignees)`.

Checkpoint **resolution is no longer a kernel command.** The previous `checkpoint.resolve`
mini-FSM (`pending → (vote)* → resolved | rejected`, quorum CAS commit,
`checkpoint_already_resolved` race, and the K13 stale-resolution re-check) has been
removed. Advancing a paused aggregate is owned by the **orchestration gate service**
(`@murrmure/hub-core` `gates/service`) on the **gates table**, reached via the hub
`gate.resolve` command and `POST /v1/gates/:gate_id/resolve` — not by a kernel
`checkpoint.resolve`. A `gate.resolve` whose `gate_id` derives from a kernel checkpoint
has no gates-table row and is denied `gate_not_found` (404); the kernel checkpoint stays
pending.

The `checkpoint.resolved` / `checkpoint.rejected` / `checkpoint.vote` journal types
remain declared (referenced by the `gate` wait-condition matcher and the `gate_queue`
projection) but are no longer emitted by the kernel.

**While checkpoint pending:** implementations MAY reject competing state mutations with
`checkpoint_pending`.

### 5.6 `journal` (domain logic)

- Build `JournalEntry` from all outcomes.
- Denials use the **same append path** as successes (K5).
- No fan-out inside transaction.

### 5.7 `fanout` (post-commit coordinator)

Dispatches committed entries to waiters, reactions, projections, notify port. Fan-out **never blocks commit**; blocking clients wait via NotifyPort/`wait.poll` after commit returns internally.

### 5.8 `waiters`

- `registerWait(condition, scope, aggregate?, delivery_mode, bound_command_id?)`.
- Durable wait rows + in-memory index (index is cache; reconnect reads durable row).
- TTL expiry → resolve with timeout snapshot.

**Delivery modes:** `sse` | `long_poll` | `callback` | `in_process`.

### 5.9 `reactions`

- Registry + matcher + dedup + partition queue + delivery log.
- `reaction.replay` redispatches without re-appending source entry.

### 5.10 `projections`

- Incremental handlers; `rebuild(from_seq)` replays journal.

---

## 6. Ports (complete list)

### Driving

| Port | Responsibility |
|------|----------------|
| `CommandPort` | `execute(command): CommandResult` |
| `QueryPort` | `query(query): QueryResult` |

### Driven

| Port | Responsibility |
|------|----------------|
| `PolicyPort` | Authority decision (pre-load; optional post-load) |
| `RulesPort` | Load rule artifacts |
| `ConditionPort` | `evaluate`, `matchActor`, `matchAssignee` |
| `SchemaPort` | JSON Schema validation for metadata/payload |
| `ConvergencePort` | Evaluate convergence rules on terminal enter |
| `PersistencePort` | TX: append journal, CAS snapshot, checkpoints, waits, dedup |
| `ActionPort` | Async side effects |
| `NotifyPort` | Push to blocking clients |
| `ClockPort` | Testable time |
| `IdPort` | Testable IDs |
| `BlobPort` | Optional large payloads (`payload_ref`) |

### PersistencePort (minimum contract)

```typescript
interface PersistencePort {
  runInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

interface Transaction {
  appendJournal(entry: JournalEntryDraft): Promise<AllocatedSeq>;
  upsertSnapshotIfRevision(aggregate: Aggregate, expectedRevision: number): Promise<"ok" | "conflict">;
  upsertCheckpoint(checkpoint: Checkpoint): Promise<void>;
  casCheckpointStatus(id: string, expected: Status, targetStatus: Status): Promise<boolean>;
  insertIdempotency(command_id: string, result: CommandResult): Promise<"inserted" | "exists">;
  getIdempotency(command_id: string): Promise<CommandResult | null>;
  // dedup, projections, wait rows — same TX when journal-coupled
}
```

Swapping persistence requires passing the **adapter conformance suite** (§18.4).

### ActionPort (R5 — async side effects)

```typescript
interface ActionPort {
  invoke(
    action: ActionSpec,
    ctx: { entry: JournalEntry; reaction_id: string; attempt_no: number }
  ): Promise<{ outcome: "success" | "failure"; detail?: Record<string, unknown> }>;
}
```

Invoked only post-commit from reaction worker (K8). Full contract in [runtime-kernel-impl-phases-r4-r7.md](./runtime-kernel-impl-phases-r4-r7.md) R5.

---

## 7. Rule artifact (minimal schema)

Kernel accepts **RuleArtifact v1**. Unknown top-level blocks ignored.

```json
{
  "schema_version": "1.0",
  "id": "string",
  "version": "string",
  "initial_state": "string",
  "terminal_states": ["string"],
  "metadata_schema": {},
  "states": [{ "id": "string", "kind": "active | terminal | archived" }],
  "transitions": [{
    "id": "string",
    "from": "string",
    "to": "string",
    "event": "string",
    "actors": ["string"],
    "condition": "string | null",
    "checkpoint": {
      "quorum": "any | all | count",
      "count": 0,
      "assignees": ["string"]
    } | null,
    "emit": ["string"]
  }],
  "events": {
    "declarations": [{ "type": "string", "schema": {} }]
  },
  "convergence": {
    "evaluate_on": ["enter:terminal_state_id"],
    "rules": []
  },
  "checkpoints": {
    "assignee_resolver": "string"
  }
}
```

- `event` on transition = trigger name (Studio Contract v2 compatible).
- `checkpoint` = pre-commit interrupt (Studio: `gate`).
- `actors` / `assignees` = opaque patterns → `ConditionPort`.
- `events.declarations` = allowlist for `event.append`; if absent, policy decides.
- `state.kind` drives `aggregate.status` on enter.
- `convergence` = optional; evaluated via `ConvergencePort` on configured state enter.

---

## 8. Aggregate model

```typescript
interface Aggregate {
  aggregate_id: string;
  scope_id: string;
  rule_ref: RuleRef;
  state: string;
  metadata: Record<string, unknown>;
  revision: number;
  status: "active" | "terminal" | "archived";
  created_at: string;
  updated_at: string;
}
```

**Pin rule ref at create.** **`aggregate.archive`:** must match a declared transition to a terminal/archived state, or a dedicated terminal transition in artifact — not a silent status bypass.

**Terminal states:** no outbound transitions unless artifact explicitly allows.

---

## 9. Journal entry envelope

```typescript
interface JournalEntry {
  seq: number;
  scope_seq?: number;       // optional; product audit ordering
  aggregate_seq?: number;   // optional
  entry_id: string;
  kind: "command" | "event" | "system";
  outcome: "success" | "denial";
  scope_id: string;
  aggregate_id?: string;
  actor_id: string;
  credential_id: string;
  command_id?: string;
  ts: string;
  type: string;
  payload: Record<string, unknown>;
  payload_ref?: string;
  ext?: Record<string, unknown>;  // federation origin, harness — not business payload
  denial?: {
    code: string;
    message: string;
    retryable: boolean;
    context?: Record<string, unknown>; // legal_transitions_for_actor[], etc.
  };
  causation?: { entry_id: string };
  correlation?: { command_id: string };
}
```

### Snapshot fold (for replay tests)

Reconstruct aggregate state by replaying journal where:

1. `outcome === "success"` AND `type` matches state-mutating kinds (`transition.applied`, `aggregate.created`, …).
2. Skip denials, `checkpoint.vote`, pure `event.append` (unless artifact ties append to state).
3. Apply metadata patches and revision increments in entry order.

Property test **Snapshot = fold(journal)** uses this definition (K9).

---

## 10. Command catalog

| Command | Effect |
|---------|--------|
| `aggregate.create` | New aggregate + journal |
| `aggregate.archive` | Terminal transition per artifact |
| `state.transition` | Executor; may return `checkpoint_pending` (202) |
| `event.append` | Append if declared in artifact and policy allows |
| `wait.register` / `wait.cancel` | Sync waiter |
| `reaction.register` / `reaction.disable` | Async reaction |
| `reaction.replay` | `{ reaction_id, source_entry_id, bypass_dedup?, reason }` |

### Queries

`aggregate.get` · `journal.tail` · `journal.subscribe` · `wait.poll` · `projection.get` · `checkpoint.list`

---

## 11. Normative command flow

```
1. ADAPTER → Command
2. COMMAND handler:
     a. Idempotency: if command_id seen → return stored result (K12)
     b. PolicyPort.evaluate (pre-load)
     c. If blocking: registerWait(W, bound_command_id=C) FIRST
     d. Dispatch executor | checkpoint | event appender
     e. Optional: PolicyPort.evaluate (post-load) if adapter enabled
3. EXECUTOR (advisory):
     load aggregate, match transition, checkpoint?, build result
4. PERSISTENCE transaction:
     a. Allocate seq (+ optional scope_seq / aggregate_seq)
     b. INSERT journal entry (success OR denial — always)
     c. IF success + state change: upsertSnapshotIfRevision(expected_revision)
        → conflict: abort TX, retry as denial transition_stale / revision_conflict
     d. IF checkpoint created: upsert checkpoint row (same TX)
     e. INSERT idempotency record WITH full CommandResult envelope
     f. COMMIT
5. FANOUT (strictly after COMMIT):
     a. If bound wait + denial/failure → resolve wait with denial immediately (K14)
     b. Match other waiters → NotifyPort
     c. Reaction matcher → queue
     d. Projection dispatch
6. RETURN result
```

**Prohibited:** skipping step 4 for denials. **K5/K6:** denials append; fan-out follows.

---

## 12. Waiters (sync plane)

### Wait condition union

```typescript
type WaitCondition =
  | { type: "state"; state: string }
  | { type: "entry"; entry_type: string; match?: Record<string, unknown> }
  | { type: "checkpoint"; checkpoint_id?: string; resolution?: "approved" | "rejected" }
  | { type: "artifact"; rule_set_key: string; min_version?: string }
  | { type: "compound"; all_of?: WaitCondition[]; any_of?: WaitCondition[] };
```

`compound.all_of` maintains **per-waiter partial progress** across multiple journal entries (not O(1) single-entry match).

### Subscribe-before-signal

```
registerWait(W, bound_command_id=C) → execute(C) → hold until match OR bound denial OR timeout
```

If command `C` commits a denial, fan-out resolves bound wait immediately with denial envelope (K14).

---

## 13. Reactions (async plane)

```typescript
interface ReactionSpec {
  reaction_id: string;
  scope_id: string;
  filter: {
    entry_types?: string[];
    source_scope_id?: string;
    aggregate_id?: string;
  };
  action: ActionSpec;
  dedup: {
    required: boolean;
    key_extractor: "entry_id" | "json_path" | "custom";
    key_path?: string;
    window_seconds: number;
  };
  partition: { key: "scope" | "aggregate" | "scope:aggregate" | "reaction" };
}
```

**Dedup precedence:** configured key_path → entry.dedup_key → entry_id (warn if fallback).

**Registration watermark:** reactions match entries with `seq >= registered_at_seq` only (no retroactive fire unless `reaction.replay`).

**Delivery log:** `(entry_id, reaction_id, attempt_no, dedup_key, outcome)` — immutable lineage (K17).

---

## 14. Projections

Handlers: pure over `(entry, prior state via ctx)`. Rebuild replays from `from_seq`. Idempotent by `(name, seq)`.

---

## 15. Kernel invariants

| # | Invariant |
|---|-----------|
| K1 | No mutation without `(scope_id, actor_id, credential_id)` |
| K2 | Authority via PolicyPort; kernel never parses role/assignee pattern syntax |
| K3 | Transitions vs pinned RuleRef |
| K4 | Journal append + snapshot CAS + journal-coupled rows in **one transaction** |
| K5 | Denials append to journal |
| K6 | Fan-out only post-commit |
| K7 | Sync wait registered before causing mutation when blocking |
| K8 | Async reactions never inside write transaction |
| K9 | Projections rebuildable from journal (+ fold definition §9) |
| K10 | Optimistic concurrency via commit-time revision CAS |
| K11 | Checkpoint pending = no aggregate state change (kernel retains only checkpoint creation; advancement is owned by the orchestration gate service, not the kernel) |
| K12 | Idempotent commands: same `command_id` → same result |
| K13 | *(removed — checkpoint resolution is no longer a kernel command; see §5.5.1)* |
| K14 | Bound wait resolves immediately on bound command denial |
| K15 | Every committed `seq` eventually fan-outs after crash (outbox/recovery) |
| K16 | Journal replay compatibility: kernel N reads N-1 entries semantically |
| K17 | Async delivery attempts have immutable lineage tuple |
| K18 | Dedup prevents extra side effects within window across retries |
| K19 | `payload_ref` read/write requires PolicyPort + BlobPort authorization |
| K20 | Imported entries preserve origin + causation in `ext` (product federation) |

### Durable store taxonomy (K4 extension)

| Store | Class | TX-coupled to journal? |
|-------|-------|------------------------|
| Journal | canonical | — |
| Snapshot | journal-derived | yes, on state change |
| Checkpoint registry | journal-derived | yes |
| Wait rows (durable) | independent-durable | register command may journal |
| Dedup ledger | independent-durable | with reaction dispatch |
| Delivery log | independent-durable | append after action |
| Projections | journal-derived | incremental post-commit |

---

## 16. Extension points

| Extension | Port |
|-----------|------|
| RBAC, scopes, blob ACL | `PolicyPort` (+ post-load) |
| CEL, Rego guards | `ConditionPort` |
| Metadata/payload schema | `SchemaPort` |
| Convergence DSL | `ConvergencePort` |
| Federation routing | Product module: reactions + `ext` on ingress |
| Evolution promote | RulesPort upstream; evolution FSM may be hosted as aggregates |
| Wire protocols | Driving adapters |

---

## 17. Error model

| Code | Meaning |
|------|---------|
| `policy_denied` | Policy rejected |
| `revision_conflict` | CAS failed |
| `transition_denied` | No match; includes `legal_transitions_for_actor[]` |
| `transition_stale` | Checkpoint resolve but state moved |
| `checkpoint_pending` | Awaiting approval (202) |
| `checkpoint_denied` | Resolve rejected |
| `checkpoint_already_resolved` | Concurrent resolve lost |
| `validation_denied` | Schema fail |
| `idempotency_replay` | Duplicate command_id |

Adapters map to HTTP/MCP codes.

---

## 18. Testing strategy

### Unit (in-memory PersistencePort)

Transition match, checkpoint quorum, denial journal shape, CAS conflict, wait match, compound partial progress.

### Property-based

| Property | Invariant |
|----------|-----------|
| Journal monotonicity | seq strict increase |
| Snapshot = fold(journal) | K9 |
| Idempotency | K12 |
| Bound wait + denial | K14 |
| Dedup | K18 |
| Commit → fan-out | K15 (with crash injector) |

### Integration

TX atomicity, WAL recovery, concurrent CAS, projection rebuild = incremental, adapter conformance (K21: same stream → same outcomes across persistence backends).

### CI gates

K1–K20 property suite · replay golden · ≥90% branch on executor/journal/waiters/reactions · no I/O imports in kernel · RuleArtifact N/N-1 fixtures (K16).

---

## 19. Observability

Required per command: `seq`, `type`, `outcome`, `scope_id`, `command_id`, `duration_ms`.

Required async: `dedup_hit`, `dedup_key`, `attempt_no`, `reaction_id`, `queue_lag`, `delivery_outcome`.

Required recovery: `fanout_backlog`, `unprocessed_seq_max`, `projection_lag`.

Tracing: command → policy → rules → persist → fanout → action.

---

## 20. Implementation phases (reordered)

| Phase | Deliverable | Exit criteria |
|-------|-------------|---------------|
| **R0** | `@murrmure/runtime-contracts` + fold definition + property suite | K1–K6, K10–K12 property tests |
| **R1** | In-memory `PersistencePort` + CAS + conformance suite stub | CAS + TX semantics locked |
| **R2** | Executor + checkpoint creation + denial append path | 202/409/403 + K11 |
| **R3** | Waiters + bound-command + in-process delivery | K7, K14 |
| **R4** | SQLite `PersistencePort` + WAL + outbox recovery | K4, K15 integration |
| **R5** | Reactions + dedup + delivery log + replay | K17, K18 |
| **R6** | Projections rebuild + RuleArtifact N/N-1 | K9, K16 |
| **R7** | HTTP adapter + daemon conformance | End-to-end |

**Studio product layers begin after R6** (projections + compatibility green), not R5 alone.

> **Numbering note:** R1 = in-memory persistence (locks port contract fast). R4 = durable SQLite (drops behind same `PersistencePort`). Pre-review numbering had durable persistence at R1 — reversed by the 2026-06-20 review (fix #11). See [runtime-kernel-review-2026-06-20.md](./runtime-kernel-review-2026-06-20.md).

---

## 21. Relationship to Studio Hub Core V2

| Studio V2 | Kernel |
|-----------|--------|
| Space | `scope_id` + PolicyPort |
| Instance | Aggregate |
| Contract v2 | RuleArtifact v1 (+ product extensions in unknown blocks) |
| Gate | Checkpoint |
| Grant / Member / scopes | PolicyPort |
| Actor.kind | `CommandContext.actor_kind` hint |
| Trigger | Reaction |
| Trigger dedup / replay | §13 dedup + `reaction.replay` |
| MCP tools | Adapter → CommandPort |
| Wait contract type | `WaitCondition.artifact` |
| Enriched 409 | `denial.context.legal_transitions_for_actor[]` |
| Federation module | Uses Reaction outbound queue + `event.append` ingress + `JournalEntry.ext` |
| Evolution pipeline | RulesPort upstream; may host FSM as aggregates |
| CapabilityInstall | Product layer on RulesPort |
| Blob | BlobPort + PolicyPort |
| Convergence | `ConvergencePort` + artifact block |
| Event declarations | `events.declarations` |
| Relay | Wire adapter only |
| Shell / UI | Outside kernel |

`@murrmure/hub-core` = **this kernel + Studio policy/adapters/federation module**.

---

## 22. Stability contract

- `@murrmure/runtime-contracts` major bump on port or envelope break.
- `@murrmure/runtime-kernel` major bump on invariant or fold definition break.
- RuleArtifact: kernel supports **N and N-1** `schema_version`; CI enforces (K16).
- Journal: forward-compatible optional fields only; never mutate/delete rows.
- Additive port methods allowed minor bump; removals major.

---

## 23–28. Future spec sections (outlines)

| Section | Contents |
|---------|----------|
| **§23 Port semantics matrix** | Required/optional methods per port, error contracts |
| **§24 Failure & recovery matrix** | Crash point per §11 step, outbox scanner |
| **§25 Evolution lifecycle hooks** | Promote/notify/live activation contract with RulesPort |
| **§26 Federation envelope** | `ext` schema, origin trust, relay dedup |
| **§27 Blob ACL & retention** | K19 detail, tombstone, GC |
| **§28 Observability SLOs** | Alert thresholds, incident reconstruction queries |

---

## Related

- [runtime-kernel-impl.md](./runtime-kernel-impl.md) — agent work order (Node, R0–R3)
- [runtime-kernel-structure.md](./runtime-kernel-structure.md) — package/file layout and build order
- [runtime-kernel-review-2026-06-20.md](./runtime-kernel-review-2026-06-20.md) — 3-agent review synthesis
- [hub-core-v2.md](./hub-core-v2.md) — Studio product instantiation
- [hub-core-validation-2026-06-20.md](./hub-core-validation-2026-06-20.md) — journey validation
