# Acceptance — current (in-scope DoD)

Merged definition of done for the local-first platform. Every in-scope row has a
golden fixture under [fixtures/](./fixtures/) and a vitest. CDK author-flow
acceptance is in [build-capability/acceptance.md](./build-capability/acceptance.md).

Deferred rows (cloud CL0, cross-space XS1 federation) are **not** here — see
[../plans/README.md](../plans/README.md).

## Flow runtime (CR)

| Fixture | Proves | Test |
|---------|--------|------|
| `fixtures/flow-runtime/install-policy-violation.json` | Agent apply on human_only → `INSTALL_POLICY_VIOLATION` | `hub-daemon/test/http/flow-runtime/install-policy-violation.test.ts` |
| `fixtures/flow-runtime/promote-tool-refresh.json` | Live apply pushes `tools_changed`; catalog refresh | `…/flow-runtime/promote-tool-refresh.test.ts` |
| `fixtures/flow-runtime/grant-scoped-tool-list.json` | Grant ACL filters MCP catalog | `…/flow-runtime/grant-scoped-tool-list.test.ts` |
| `fixtures/flow-runtime/reconnect-outbox-replay.json` | Control-bus replay after reconnect | `…/flow-runtime/reconnect-outbox-replay.test.ts` |
| `fixtures/flow-runtime/rollback-live-mount.json` | Rollback restores prior mount; pinned contracts | `…/flow-runtime/rollback-live-mount.test.ts` |
| `fixtures/e2e/phase2-full-chain.json` | FDK bundle push → install → validate → test → apply → live worker | `…/flow-runtime/phase2-full-chain.test.ts` |

## Feature-spec reference capability (FS)

| Fixture | Proves | Test |
|---------|--------|------|
| `fixtures/feature-spec/happy-path-publish.json` | Spec publish flow | `…/feature-spec/happy-path-publish.test.ts` |
| `fixtures/feature-spec/publish-direct-denied.json` | Direct publish denied (gate) | `…/feature-spec/publish-direct-denied.test.ts` |
| `fixtures/feature-spec/revise-republish-v2.json` | Revise + republish v2 | `…/feature-spec/revise-republish-v2.test.ts` |
| `fixtures/feature-spec/spec-summary-query.json` | `spec_summary@1` query answered (FS0/XS0) | `…/feature-spec/spec-summary-query.test.ts` |

## Triggers (TR)

| Fixture | Proves | Test |
|---------|--------|------|
| `fixtures/triggers/spec-published-wake-dev.json` | Trigger wakes dev agent | `…/triggers/spec-published-wake-dev.test.ts` |
| `fixtures/triggers/dedup-spec-publish.json` | Delivery dedup by fingerprint | `…/triggers/dedup-spec-publish.test.ts` |
| event catalog | Event-type catalog endpoint | `…/triggers/event-catalog.test.ts` |
| trigger register | Async trigger registration | `…/config/trigger-register.test.ts` |

## Cross-space XS0 (same hub)

| Scenario | Proves | Test |
|----------|--------|------|
| `spec_summary@1` ask → answer | Typed ask returns summary (no `body_ref`) + `_attribution` | `…/feature-spec/spec-summary-query.test.ts` |
| Disallowed source → `QUERY_POLICY_DENIED` | Inbound allowlist enforced | `…/cross-space/xs0-policy.test.ts` |
| Unsupported query type → 400 | `openapi_diff_ref@1` not served in XS0 (XS1) | `…/cross-space/xs0-policy.test.ts` |

> `openapi_diff_ref@1`, `context_fetch@1`, async answer + `ANSWER_TIMEOUT`, and
> federation are deferred — see [../plans/cross-space-xs1/](../plans/cross-space-xs1/).
> The fixtures `fixtures/cross-space/same-hub-ask-answer.json` and
> `query-failed-timeout.json` describe that XS1 target shape.

## Config and setup

| Fixture | Proves | Test |
|---------|--------|------|
| deny install on prod | Prod install gate | `…/config/deny-install-prod.test.ts` |
| first-week setup | Setup wizard flow | `…/config/first-week-setup.test.ts` |
| promote breaking gate | Breaking promote → human gate | `…/config/promote-breaking-gate.test.ts` |
| shared-config (BC6b) | `shared.json` project registry routes | `…/studio/shared-config.test.ts` |

## Security

| Concern | Proves | Test |
|---------|--------|------|
| Mount collisions | `ROUTE_PREFIX_COLLISION`, `MCP_TOOL_COLLISION` | `…/security/mount-collision-worker-env.test.ts` |
| Worker env sanitization | No hub secrets leak into worker env | `…/security/mount-collision-worker-env.test.ts` |
| UI blob traversal | `..` path traversal blocked on UI route | `…/flow-runtime/phase2-full-chain.test.ts` |

## CDK author flow

See [build-capability/acceptance.md](./build-capability/acceptance.md). Conformance
(validate + deterministic build digest) and `dev --sim` are covered by
`capability-sdk/test/cdk-conformance.test.ts`, `validate.test.ts`, `dev-sim.test.ts`.

## Gate

Ship when all rows above are green via `pnpm test` and `pnpm test:acceptance`.
