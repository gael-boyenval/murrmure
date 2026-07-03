# Acceptance — current (in-scope DoD)

Merged definition of done for the local-first platform. Every in-scope row has a
golden fixture under [fixtures/](./fixtures/) and a vitest. CDK author-flow
acceptance is in [build-capability/acceptance.md](./build-capability/acceptance.md).

Deferred rows (cloud CL0, cross-space XS1 federation) are **not** here — see
[../plans/README.md](../plans/README.md).

## Murrmure v2 backlog closed (B1–B8)

Symptom IDs from [plan/index.md § Gaps](../plans/product/plan/index.md) — all shipped in phases 01–08.

| ID | Symptom | Phase | Fixture | Test |
|----|---------|-------|---------|------|
| B1 | Checkpoint steps dispatch | 03 | `fixtures/flow-engine/declarative-gate-chain.json` | `packages/hub-core/test/unit/flow-engine/checkpoint.test.ts` |
| B2 | `{{steps.*}}` templates | 03 | `fixtures/flow-engine/step-output-chaining.json` | `packages/hub-core/test/unit/flow-engine/checkpoint.test.ts` |
| B3 | `MURRMURE_INPUT` on shell_spawn | 03 | `fixtures/flow-engine/murrmure-input-env.json` | `packages/hub-core/test/unit/flow-engine/checkpoint.test.ts` |
| B4 | ViewCanvasHost at checkpoints | 05 | `fixtures/flow-engine/gate-requires-view.json` | `packages/shell-web/src/components/ViewCanvasHost.test.tsx` |
| B5 | Apply lint capabilities | 01 | `fixtures/space-apply/unsupported-step-kind.json` | `packages/cli/test/space-apply.test.ts` |
| B6 | `space flow init` scaffold | 04 | `fixtures/space-flow-init-hello-gate.json` | `packages/cli/test/space-flow-init.test.ts` |
| B7 | Unified murrmure skill | 07 | skill tree in `packages/cli/skill/` | `packages/cli/test/skill-install.test.ts` |
| B8 | Setup wizard | 08 | `fixtures/cli/wizard-onboard-smoke.json` | `packages/cli/test/wizard/setup.test.ts` |

Additional phase 01 fixture: `fixtures/space-apply/checkpoint-on-resolve-missing.json`.

## Phase 10 — Docs & proof

| Artifact | Proves | Test |
|----------|--------|------|
| `demo-space/murrmure/` | CI strict apply on linked demo tree | `.github/workflows/ci.yml` demo-space step |
| `examples/flows/preview-review-v2/` | Tutorial 1 + R1–R6 | `packages/cli/test/preview-review-v2-example.test.ts` |
| `examples/flows/team-brief-v2/` | Tutorial 2 tree | `packages/cli/test/docs-proof.test.ts` |
| `examples/flows/daily-brief-v2/` | Tutorial 3 tree | `packages/cli/test/docs-proof.test.ts` |
| `examples/flows/hello-authoring/` | Flows tutorial tree | `packages/cli/test/docs-proof.test.ts` |
| Human ↔ skill known-gaps sync | 10-U4 | `pnpm check:known-gaps` |
| Zero FDK in `apps/docs/` | 10-U6 | `pnpm check:fdk-docs` |
| Tutorial pages (16) | 10-T4 | `packages/cli/test/docs-proof.test.ts` |

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

## Reference workflow — preview-review-v2 (RW)

Layered verification per [decision 10](../plans/product/plan/decisions/10-reference-workflow-verification-layered.md).
Example tree: [`examples/flows/preview-review-v2/`](../../examples/flows/preview-review-v2/).

| ID | Fixture / artifact | Proves | Layer | Test |
|----|-------------------|--------|-------|------|
| R1 | `examples/flows/preview-review-v2/` + `fixtures/reference-workflow/preview-review-v2-apply.json` | Normative tree passes `space apply --strict` | CI | `packages/cli/test/preview-review-v2-example.test.ts` |
| R3 | shell ViewCanvasHost | Checkpoint view in primary region (not drawer) | CI | `packages/shell-web/src/components/ViewCanvasHost.test.tsx` |
| R4 | `fixtures/flow-engine/gate-loop-on-resolve.json` | Request changes → build reruns (engine half) | CI | `packages/hub-core/test/unit/flow-engine/checkpoint.test.ts` |
| R5 | `fixtures/flow-engine/declarative-gate-chain.json` | Validated → terminal completed | CI | `packages/hub-core/test/unit/flow-engine/checkpoint.test.ts` |
| R4/R5 | `fixtures/flow-engine/step-output-chaining.json` | `{{steps.*}}` in invoke params | CI | `packages/hub-core/test/unit/flow-engine/checkpoint.test.ts` |
| R6 | example + workflow grep | Zero legacy install commands in reference workflow | CI | `packages/cli/test/preview-review-v2-example.test.ts` |
| R2 | Tutorial 1 walkthrough | Non-contributor scaffold → Run Desktop | manual | release checklist **10-T1** |
| R3/R4 | Tutorial 1 visual | ViewCanvasHost + round-trip UX | manual | release checklist **10-T1** |
| R2–R4 | Playwright Desktop | Full human path automation | backlog | post-v2 |

## Gate

Ship when all rows above are green via `pnpm test`, `pnpm test:acceptance`, and `pnpm check:docs-proof`.
