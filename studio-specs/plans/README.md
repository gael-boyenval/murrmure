# Plans — deferred scope

> **Not normative.** Nothing here is CI-gated. Designs in `plans/` are deferred or
> in-flight; on conflict, [current/](../current/) always wins. An item becomes
> normative only when moved into `current/` with a green fixture and a vitest.

## Index

| Plan | Scope | Why deferred | Promote when |
|------|-------|--------------|--------------|
| [npm-publish-v1.md](./npm-publish-v1.md) | **Murrmure v1:** full rebrand; cli + flow-dev-kit; push bundle+source | **Gate 2 approved** | Phase A → first publish |
| [cloud/](./cloud/) | Hosted shell: cloud BFF, session auth, cloud-admin first space | Local-first v1 ships first | After local-first v1 is stable |
| [cross-space-xs1/](./cross-space-xs1/) | Federation relay, `query_policy` editor, `context_fetch@1`, `openapi_diff_ref@1` | Builds on XS0 + needs hub S3 relay | After XS0 is green and relay is in scope |

## Deferred product backlog

Items called out in `current/**` "Out" sections that are intentionally not built
in v1 (no separate plan doc yet): capability marketplace, gate delegation UI,
cron/scheduled trigger UI, contract graph editor, OAuth/multi-tenant IdP. Add a
`plans/product/` doc here if any of these is picked up.

## Worker debundle

The host-bridge work required to move `feature-spec` and `review-loop` from
in-process mounts to worker bundles is specified normatively (as a target
contract) in
[current/build-capability/12-worker-runtime-and-host-bridge.md](../current/build-capability/12-worker-runtime-and-host-bridge.md);
its "required for debundle" checklist is the tracking list.
