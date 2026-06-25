# Plans — deferred scope

> **Not normative.** Nothing here is CI-gated. Designs in `plans/` are deferred or
> in-flight; on conflict, [current/](../current/) always wins. An item becomes
> normative only when moved into `current/` with a green fixture and a vitest.

## Index

| Plan | Scope | Status |
|------|-------|--------|
| [cli-dx-v1 (archived)](../archives/plans/cli-dx-v1.md) | `@murrmure/cli`: citty, full help, hub config parity, scope preflight, auth commands | **Executed** (2026-06-24) — see [cli/spec.md](../current/cli/spec.md) |
| [npm-publish-v1 (archived)](../archives/plans/npm-publish-v1.md) | Murrmure v1: `@murrmure/cli` + `@murrmure/flow-dev-kit`, `/flows/` wire, bundle+source push | **Executed** (2026-06-23) — see [ADR-001](../ADR/ADR-001-murrmure-publish.md) |
| [cloud/](./cloud/) | Hosted shell: cloud BFF, session auth, cloud-admin first space | Deferred — local-first v1 ships first |
| [cross-space-xs1/](./cross-space-xs1/) | Federation relay, `query_policy` editor, `context_fetch@1`, `openapi_diff_ref@1` | Deferred — after XS0 |
| [desktop/murrmure-desktop-v1 (archived)](../archives/plans/murrmure-desktop-v1.md) | Electrobun app: single URL, hub serves shell, daemon lifecycle, flows unchanged | **Executed** (2026-06-24) — see [desktop/spec.md](../current/desktop/spec.md), [ADR-002](../ADR/ADR-002-desktop-single-url.md) |

## Deferred product backlog

Items called out in `current/**` "Out" sections that are intentionally not built
in v1 (no separate plan doc yet): flow marketplace, gate delegation UI,
cron/scheduled trigger UI, contract graph editor, OAuth/multi-tenant IdP. Add a
`plans/product/` doc here if any of these is picked up.

## Worker debundle

The host-bridge work required to move `feature-spec` and `review-loop` from
in-process mounts to worker bundles is specified normatively (as a target
contract) in
[current/build-capability/12-worker-runtime-and-host-bridge.md](../current/build-capability/12-worker-runtime-and-host-bridge.md);
its "required for debundle" checklist is the tracking list.
