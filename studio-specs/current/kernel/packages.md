---
topic: Runtime kernel — package and file structure
date: 2026-06-20
status: architectural guide
parent: runtime-kernel.md
purpose: >
  How to split packages, files, and responsibilities for @runtime/kernel implementation.
  Build order and robustness rules for architects and implementers.
---

# Runtime kernel — structure & build approach

Implementation layout for the engine defined in [runtime-kernel.md](./runtime-kernel.md). **Kernel only** — no Studio, MCP, or federation modules here.

---

## 1. Package split (strict dependency graph)

```
@runtime/contracts     ← types + port interfaces only (zero logic, zero I/O)
       ↑
@runtime/kernel        ← pure domain (no I/O imports)
       ↑
@runtime/persistence   ← driven adapters (in-memory, SQLite, …)
       ↑
@runtime/daemon        ← optional thin wiring, config, health

Outside kernel repo until R6:
  @runtime/adapter-http
  @runtime/adapter-inproc
  …
```

| Package | Owns | Must never |
|---------|------|------------|
| `contracts` | Wire types, port interfaces, error codes, journal fold definition | Import kernel or persistence |
| `kernel` | Command flow, executor, checkpoints, journal builder, fanout, waiters, reactions, projections logic | Import SQLite, HTTP, fs, process |
| `persistence` | TX, journal append, snapshot CAS, dedup store, projection storage | Contain domain transition rules |
| `daemon` | Port wiring, config load, lifecycle | Domain logic |

**CI gate:** static import analysis — `kernel` may import only `contracts`.

---

## 2. `@runtime/contracts` file layout

```
packages/contracts/
  src/
    entities/
      aggregate.ts
      journal-entry.ts
      rule-artifact.ts
      checkpoint.ts
      reaction-spec.ts
      wait-condition.ts
    commands/
      aggregate-create.ts
      aggregate-archive.ts
      state-transition.ts
      checkpoint-resolve.ts
      event-append.ts
      wait-register.ts
      wait-cancel.ts
      reaction-register.ts
      reaction-disable.ts
      reaction-replay.ts
    queries/
      aggregate-get.ts
      journal-tail.ts
      wait-poll.ts
      projection-get.ts
      checkpoint-list.ts
    ports/
      policy-port.ts
      rules-port.ts
      condition-port.ts
      schema-port.ts
      convergence-port.ts
      persistence-port.ts
      action-port.ts
      notify-port.ts
      blob-port.ts
      clock-port.ts
      id-port.ts
      command-port.ts
      query-port.ts
    errors/
      denial-codes.ts
      command-result.ts
    journal/
      fold.ts              ← snapshot = fold(journal) definition (K9)
    index.ts
  package.json
```

**Rule:** one command/query per file. Ports are interfaces + input/output types only.

---

## 3. `@runtime/kernel` file layout

```
packages/kernel/
  src/
    command/
      handler.ts           ← normative §11 orchestration
      idempotency.ts       ← command_id lookup + store
      context.ts           ← CommandContext assembly
    executor/
      match.ts             ← transition matching (from, event, actors via port)
      apply.ts             ← state + metadata compute
      legal-next.ts          ← legal_transitions_for_actor for denials
      convergence-hook.ts  ← terminal enter → ConvergencePort
    checkpoint/
      lifecycle.ts         ← pending → vote → resolved/rejected
      resolve.ts           ← quorum evaluation, terminal CAS
      store-logic.ts       ← domain rules only; persistence via port
    journal/
      build-entry.ts       ← envelope from execution/denial outcomes
      entry-types.ts       ← type string constants
    fanout/
      dispatch.ts          ← post-commit router (K6)
      outbox.ts            ← K15 recovery cursor logic
    waiters/
      registry.ts          ← register, cancel, TTL
      match.ts             ← condition union + compound progress
      bound-command.ts     ← K14 bound wait + denial resolve
    reactions/
      registry.ts
      matcher.ts
      dedup.ts
      queue.ts             ← partition FIFO
      delivery-log.ts
      replay.ts
    projections/
      dispatcher.ts
      rebuild.ts
    kernel.ts              ← compose deps, expose CommandPort / QueryPort
    index.ts
  test/
    unit/                  ← per-module, in-memory PersistencePort fake
    property/              ← fast-check K1–K20
    conformance/           ← golden RuleArtifact fixtures
  package.json
```

### Module communication rules

```
command/handler  →  executor | checkpoint | journal/build-entry
                 →  policy (port)
                 →  persistence (port, TX)
                 →  fanout/dispatch (post-commit only)

executor         →  rules, condition, schema, convergence (ports)
                 →  never → waiters, reactions, fanout directly

fanout/dispatch  →  waiters/match, reactions/matcher, projections/dispatcher, notify (port)
                 →  never → persistence TX

waiters, reactions, projections  →  never import each other
```

**No god files.** `command/handler.ts` orchestrates; it does not implement matching or quorum logic inline.

---

## 4. `@runtime/persistence` file layout

```
packages/persistence/
  src/
    memory/
      transaction.ts       ← in-memory TX for R0–R3 tests
      store.ts
    sqlite/
      transaction.ts
      journal.ts
      snapshots.ts         ← CAS upsert
      checkpoints.ts
      waits.ts
      dedup.ts
      delivery-log.ts
      projections.ts
      migrate.ts
    conformance/
      suite.ts             ← shared tests any adapter must pass (K21)
    index.ts
  test/
    integration/           ← crash, WAL, concurrent CAS
  package.json
```

**Rule:** persistence implements `PersistencePort` from contracts only. Domain never imports these files.

---

## 5. `@runtime/daemon` (optional, late)

```
packages/daemon/
  src/
    wire.ts                ← inject port implementations
    config.ts
    health.ts
    main.ts
  package.json
```

Thin composition root. No business logic.

---

## 6. Build approach (architect order)

| Step | Deliverable | Exit gate |
|------|-------------|-----------|
| 1 | `contracts` — ports, entities, fold | Types compile; fold spec documented |
| 2 | `persistence/memory` + conformance stub | CAS + TX fake works |
| 3 | `kernel/executor` + `journal/build-entry` | Golden rule fixtures pass |
| 4 | `kernel/command/handler` | §11 flow; denials append; revision CAS |
| 5 | `kernel/fanout` in-process | K6, K15 stub |
| 6 | `kernel/waiters` | K7, K14 property tests |
| 7 | `kernel/reactions` | K17, K18 property tests |
| 8 | `persistence/sqlite` | Conformance suite = memory results |
| 9 | `kernel/projections` | Rebuild = incremental |
| 10 | `adapter-http` (outside or R6) | Maps to CommandPort |

**Do not parallelize executor and persistence.** Lock `PersistencePort` method signatures before executor commit path is final.

**Studio product layers start after step 9** (R6 in current impl numbering — projections + compatibility green).

---

## 7. Testing placement

| Layer | Location | What |
|-------|----------|------|
| Unit | `kernel/test/unit/` | match, quorum, denial shape, wait match |
| Property | `kernel/test/property/` | fold equivalence, idempotency, dedup, K14 |
| Port conformance | `persistence/conformance/` | same command stream → same journal/snapshot |
| Integration | `persistence/test/integration/` | crash recovery, concurrent writers |
| Golden rules | `kernel/test/conformance/` | RuleArtifact fixtures → outcomes |

No domain scenario tests in kernel repo (review loops, etc.).

---

## 8. Robustness principles

1. **Ports are the only extension surface** — policy, conditions, schema, convergence plug in via adapters.
2. **One conformance suite per port** — swap persistence without forking kernel.
3. **Property tests on K1–K20** — not journey tests.
4. **Journal fold lives in contracts** — rebuild semantics are spec, not implementation detail.
5. **Fan-out never in TX** — fanout module has no `runInTransaction` import.
6. **Checkpoint and snapshot CAS in same TX** as journal append when state changes.

---

## 9. Anti-patterns (do not)

| Anti-pattern | Why |
|--------------|-----|
| Ports + logic in same file | Breaks code generation and adapter mocking |
| Start with SQLite | Hides TX/CAS bugs until late |
| CEL, roles, HTTP in kernel | Product leakage; use ConditionPort / PolicyPort |
| `sync` / `async` as module names | JS reserved/confusion — use `waiters` / `reactions` |
| MCP/Studio adapters in kernel repo | Blurs boundary; delays kernel stability |
| Cross-import waiters ↔ reactions | Couples planes; route via fanout only |

---

## 10. Relationship to specs

| Doc | Role |
|-----|------|
| [runtime-kernel.md](./runtime-kernel.md) | What the engine does — behavior, invariants, ports |
| This file | How to lay out code and build it |
| [runtime-kernel-review-2026-06-20.md](./runtime-kernel-review-2026-06-20.md) | Review fixes applied to spec |
| [hub-core-v2.md](./hub-core-v2.md) | Studio layer on top (separate repo path when built) |

---

## Related

- [runtime-kernel.md](./runtime-kernel.md)
- [README](./README.md)
