# Studio — developer handoff

**Copy this entire directory.** Everything the implementer needs is inside.

---

## Already built (phase 1 — do not rebuild)

Kernel, hub, product shell, config UI, review-loop capability — live in the codebase.

---

## What to build (phase 2)

Read **[build/README.md](./build/README.md)** — order, done-when, out of scope.

| Step | Build order | Technical spec | Wire bridge |
|------|-------------|----------------|-------------|
| 1 | [build/01-capability-runtime.md](./build/01-capability-runtime.md) | [capability-runtime/spec.md](./capability-runtime/spec.md) | [bridges/capability-runtime.md](./bridges/capability-runtime.md) |
| 2 | [build/02-feature-spec.md](./build/02-feature-spec.md) | [capabilities/feature-spec.md](./capabilities/feature-spec.md) | [bridges/feature-spec.md](./bridges/feature-spec.md) |
| 3 | [build/03-triggers.md](./build/03-triggers.md) | [triggers/spec.md](./triggers/spec.md) | [bridges/triggers.md](./bridges/triggers.md) |
| 4 | [build/04-cross-space.md](./build/04-cross-space.md) | [cross-space/spec.md](./cross-space/spec.md) | [bridges/cross-space.md](./bridges/cross-space.md) |
| 5 | [build/05-cloud-shell.md](./build/05-cloud-shell.md) | [cloud/spec.md](./cloud/spec.md) | [bridges/cloud-shell.md](./bridges/cloud-shell.md) |

**Acceptance:** [build/acceptance.md](./build/acceptance.md) — all fixtures green.

**Context (optional):** [build/journey-traceability.md](./build/journey-traceability.md) — why each layer exists.

---

## Phase 1 reference (already shipped — for extension points only)

| Domain | Spec | Bridge |
|--------|------|--------|
| Product + review | [product/spec.md](./product/spec.md) | [bridges/product.md](./bridges/product.md) |
| Config shell | [config/spec.md](./config/spec.md) | [bridges/config.md](./bridges/config.md) |
| Hub | [hub/architecture.md](./hub/architecture.md) | [hub/contracts.md](./hub/contracts.md) |

Full index: [technical-index.md](./technical-index.md)

---

## Done when

1. All fixtures in `build/acceptance.md` pass
2. E2E: [fixtures/e2e/phase2-full-chain.json](./fixtures/e2e/phase2-full-chain.json) green once
3. E2E story in `build/journey-traceability.md` runs without Slack/curl

---

## Assumptions (what is outside this folder)

| External | Why optional |
|----------|--------------|
| [`inputs/studio/`](../../inputs/studio/) | Product journeys and personas — context only |
| [`research/studio/`](../studio/) | Archive ADRs, hardening reviews |
| Codebase | Phase 1 already implemented |

**Doc precedence (conflicts):** `*/spec.md` > `bridges/` > `build/` > `fixtures/` (examples).

Review fixes applied: see [REVIEW-2026-06-20.md](./REVIEW-2026-06-20.md#applied-fixes).
