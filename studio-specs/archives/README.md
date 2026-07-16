# Archives — historical only

> **Do not implement from here.** These documents are an audit trail. They never
> override [current/](../current/). Where an archived doc has a live successor,
> the normative version is under `current/`.

## Buckets

| Path | Contents |
|------|----------|
| [build-orders/](./build-orders/) | Original phased build orders (capability-runtime, feature-spec, triggers, cross-space), journey traceability, phase-2 acceptance, and the original HANDOFF/README snapshots. Definition-of-done merged into `current/**` domain specs and `current/build-capability/acceptance.md`. |
| [execution/](./execution/) | Execution plans: `cdk-master-plan.md` (former CDK `plan.md`), `react-dev-kit-sim-plan.md` (former `14-react-dev-kit-and-sim-plan.md`). |
| [reviews/](./reviews/) | Multi-agent reviews: `REVIEW-2026-06-20.md`, `build-capability-REVIEW-2026-06-20.md`. |
| [plans/](./plans/) | Executed product plans: `cli-dx-v1.md`, `npm-publish-v1.md`, `murrmure-desktop-v1.md`; v2 rev-1 drafts in [plans/product/](./plans/product/). |
| [superseded/](./superseded/) | Replaced designs: `bundled-catalog-migration.md` (the bundled catalog → CDK push migration, now superseded by the CDK-only model); `tutorials/` (v2 tutorials `01-local-preview-review`, `02-multi-agent-brief`, `03-daily-brief-trigger`, superseded by Tutorial v3 `1a` — Task 15 Lane C). |

## Successors

| Archived | Normative successor |
|----------|---------------------|
| `build-orders/01-capability-runtime.md` | [current/capability-runtime/spec.md](../current/capability-runtime/spec.md) |
| `build-orders/02-feature-spec.md` | [current/capabilities/feature-spec.md](../current/capabilities/feature-spec.md) |
| `build-orders/03-triggers.md` | [current/triggers/spec.md](../current/triggers/spec.md) |
| `build-orders/04-cross-space.md` | [current/cross-space/spec.md](../current/cross-space/spec.md) |
| `execution/cdk-master-plan.md` | [current/build-capability/](../current/build-capability/) |
| `superseded/bundled-catalog-migration.md` | [build-capability/README.md](../current/build-capability/README.md) (CDK + space index) |
| `superseded/config-shell-v1.md` | Retired Configure UI spec |
| `superseded/tutorials/01-local-preview-review/` · `02-multi-agent-brief/` · `03-daily-brief-trigger/` | [Tutorial v3 `1a`](../../apps/docs/guide/tutorials/01-local-preview-review-v3/) — `apps/docs/guide/tutorials/01-local-preview-review-v3/` (clean protocol; v2 runtime removed in Task 15 Lane A) |
| `plans/murrmure-desktop-v1.md` | [current/desktop/spec.md](../current/desktop/spec.md) |
| `archives/plans/product/space-flow-protocol-v2.spec-rev-1.md` | [current/product/spec.md](../current/product/spec.md) |
| `archives/plans/product/space-flow-protocol-v2.architecture.md` | [current/product/architecture.md](../current/product/architecture.md) |
| `archives/plans/product/plan-delta-rev1.md` | Historical; see [plans/product/plan/](../plans/product/plan/) |
| *(removed 2026-07-03)* `plans/product/*` redirect stubs | Superseded by `current/product/` + `plans/product/plan/` only |
