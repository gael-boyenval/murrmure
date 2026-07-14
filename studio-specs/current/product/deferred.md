# Deferred product scope (intentionally not built)

**Status:** normative non-goals  
**Active implementation spec:** [plans/product/plan/index.md](../../plans/product/plan/index.md)  
**Shipped behavior:** [spec.md](./spec.md)

Items here are **deliberate non-goals or future slices**, not bugs. For **known gaps** (manifest features that compile but the engine does not dispatch yet), see the [active plan](../../plans/product/plan/index.md) and [known-gaps](../../../apps/docs/guide/known-gaps.md).

> **North star:** nothing below defers **custom views as the primary human interface**. `gate.requires_view` + **ViewCanvasHost** are required — [plan phase 06](../../plans/product/plan/06-gate-requires-view.md). Deferred here = hub registry infrastructure and admin-shell polish only.

---

## Protocol / engine

| Item | Rationale |
|------|-----------|
| Gate quorum (`resolve_mode` beyond `any_one`) | v2 uses any-one assignee resolution only |
| In-hub queue runtime (Temporal-like) | External poll workers only — [executor-queue-poll.md](../bridges/executor-queue-poll.md) |
| Dynamic matrix from prior step output mid-run | Matrix resolved at step entry from `input` today; step-output matrix deferred |
| A2A as core wire protocol | Optional adapter only; not normative Murrmure API |

---

## Product / UX

| Item | Rationale |
|------|-----------|
| Hub view registry / view entity | Views stay clients; `view_ref` on flow index only. View canvas ships in plan phase 06 — not deferred |
| Flow marketplace | Not v2 scope |
| Gate delegation UI | Not v2 scope |
| Cron / schedule trigger **UI** | Hub scheduler runs; no separate schedule editor |
| Contract graph editor | Not v2 scope |
| OAuth / multi-tenant IdP | Local-first grants only |
| Admin-shell UI polish backlog (Storybook critique) | Shell is admin/operator chrome — lower priority than view canvas |

---

## Historical drafts (archived)

Promoted to `current/product/` 2026-06-30. Full rev-1 text only in archive:

| Archive | Normative replacement |
|---------|----------------------|
| [archives/plans/product/space-flow-protocol-v2.spec-rev-1.md](../../archives/plans/product/space-flow-protocol-v2.spec-rev-1.md) | [spec.md](./spec.md) |
| [archives/plans/product/space-flow-protocol-v2.architecture.md](../../archives/plans/product/space-flow-protocol-v2.architecture.md) | [architecture.md](./architecture.md) |
| [archives/plans/product/plan-delta-rev1.md](../../archives/plans/product/plan-delta-rev1.md) | Historical; v2 core shipped — [plan/](../../plans/product/plan/) |

---

## Related

- **Active spec (unshipped):** [plans/product/plan/](../../plans/product/plan/)
- **Reference workflow:** [10-reference-workflow-preview-review.md](../../plans/product/plan/10-reference-workflow-preview-review.md)
