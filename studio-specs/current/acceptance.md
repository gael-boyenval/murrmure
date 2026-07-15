# Acceptance — current (in-scope DoD)

Merged definition of done for the local-first platform. Every in-scope row has a
golden fixture under [fixtures/](./fixtures/) and a vitest.

Deferred rows (cloud CL0, cross-space XS1 federation) are **not** here — see
[../plans/README.md](../plans/README.md).

## Murrmure v2 backlog closed (B1–B8)

Symptom IDs from [plan/index.md § Gaps](../plans/product/plan/index.md) — all shipped in phases 01–08.

| ID | Symptom | Phase | Fixture | Test |
|----|---------|-------|---------|------|
| B1 | ~~Checkpoint steps dispatch~~ — removed (Task 15 Lane A) | 03 → 15 | removed; superseded by `step:resolve` | `packages/hub-core/test/unit/flow-engine/step-resolve.test.ts` |
| B2 | `{{steps.*}}` templates | 03 | `fixtures/flow-engine/step-output-chaining.json` | `packages/hub-core/test/unit/flow-engine/step-output.test.ts` |
| B3 | `MURRMURE_INPUT` on shell_spawn | 03 | `fixtures/flow-engine/murrmure-input-env.json` | `packages/hub-core/test/unit/flow-engine/step-resolve.test.ts` — see [Tutorial v3 (TV3)](#tutorial-v3-progressive-conformance-tv3) |
| B4 | ViewCanvasHost at checkpoints | 05 | — (inline context) | `packages/shell-web/src/components/ViewCanvasHost.test.tsx` |
| B5 | Apply lint capabilities | 01 | `fixtures/space-apply/unsupported-step-kind.json` | `packages/cli/test/space-apply.test.ts` |
| B6 | `space flow init` scaffold | 04 | — (snapshot tree) | `packages/cli/test/space-flow-init.test.ts` |
| B7 | Split murrmure skills | 07 | `skill-agent/` + `skill-developer/` | `packages/cli/test/skill-install-variants.test.ts` |
| B8 | Setup wizard | 08 | `fixtures/cli/wizard-onboard-smoke.json` | `packages/cli/test/wizard/setup.test.ts` |

Additional phase 01 fixture: `fixtures/space-apply/checkpoint-on-resolve-missing.json`.

> **B1 — checkpoint dispatch removed (Task 15 Lane A/C).** Declarative
> checkpoint auto-dispatch is gone; the `checkpoint.test.ts` suite and the
> `declarative-gate-chain.json` + `gate-loop-on-resolve.json` fixtures are
> retired. Step resolution uses the clean `step:resolve` contract
> (`murrmure_resolve_step` / `mrmr step resolve`) — see
> [Tutorial v3 progressive conformance (TV3)](#tutorial-v3-progressive-conformance-tv3)
> and `packages/hub-core/test/unit/flow-engine/step-resolve.test.ts`.

## Phase 10 — Docs & proof

| Artifact | Proves | Test |
|----------|--------|------|
| `studio-specs/current/fixtures/spaces/minimal-mrmr/` | CI strict apply on minimal handlers tree | `packages/cli/test/docs-proof.test.ts` (10-U5) |
| `test-utils/spaces/preview-review-v2/` | Reference workflow R1–R6 | `packages/cli/test/preview-review-v2-example.test.ts` |
| `test-utils/spaces/team-brief-v2/` | Tutorial 2 tree (CI) | `packages/cli/test/docs-proof.test.ts` |
| `test-utils/spaces/daily-brief-v2/` | Tutorial 3 tree (CI) | `packages/cli/test/docs-proof.test.ts` |
| `test-utils/spaces/hello-authoring/` | Minimal handlers space (CI) | `packages/cli/test/docs-proof.test.ts` |
| Human ↔ skill known-gaps sync | 10-U4 | `pnpm check:known-gaps` |
| Zero retired install guidance in `apps/docs/` | 10-U6 | `pnpm check:fdk-docs` |
| Clean first boot and production import boundaries | Tutorial v3 Task 01 | `pnpm check:clean-state` |
| Tutorial pages (8 — v3 tutorial + tutorials index) | 10-T4 + TV3-F | `packages/cli/test/docs-proof.test.ts` |

## Flow runtime (CR)

| Fixture | Proves | Test |
|---------|--------|------|
| `fixtures/flow-runtime/install-policy-violation.json` | Agent apply on human_only → `INSTALL_POLICY_VIOLATION` | `hub-daemon/test/http/flow-runtime/install-policy-violation.test.ts` |
| `fixtures/flow-runtime/promote-tool-refresh.json` | Live apply pushes `tools_changed`; catalog refresh | `…/flow-runtime/promote-tool-refresh.test.ts` |
| `fixtures/flow-runtime/grant-scoped-tool-list.json` | Grant ACL filters MCP catalog | `…/flow-runtime/grant-scoped-tool-list.test.ts` |
| `fixtures/flow-runtime/reconnect-outbox-replay.json` | Control-bus replay after reconnect | `…/flow-runtime/reconnect-outbox-replay.test.ts` |

## Triggers (TR)

| Fixture | Proves | Test |
|---------|--------|------|
| `on: event:` handler delivery + dedup by fingerprint | `event:emit` (`spec.published`) → handler delivery; duplicate fingerprint deduped | `…/hooks/dedup.test.ts` |
| retired `mcp_wake` registration rejected | `from-template` + custom `mcp_wake`/legacy alias actions → 422 `TRIGGER_ACTION_RETIRED` | `…/triggers/dedup-spec-publish.test.ts` |
| event catalog | Event-type catalog endpoint | `…/triggers/event-catalog.test.ts` |
| trigger register (retired `mcp_wake` rejected) | Custom `mcp_wake` / `wake_mcp_agent` / `tool` → 422 | `…/config/trigger-register.test.ts` |

Historical fixtures (retired `mcp_wake` wire — kept as removal records only; the `POST /v1/mcp/wake` wire is 404 and registration is rejected, Task 15 Lane C):

- `fixtures/triggers/spec-published-wake-dev.json`
- `fixtures/triggers/dedup-spec-publish.json`
- `fixtures/config/trigger-backend-frontend.json`
- `fixtures/e2e/phase2-full-chain.json`

New spaces declare `on: event:` handlers in `.mrmr/space/handlers.yaml` + `murrmure_emit_event` — see [triggers/spec.md](./triggers/spec.md) TR-min/TR-full.

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
| promote breaking gate | Breaking promote → human gate | `…/config/promote-breaking-gate.test.ts` |
| shared-config (BC6b) | `shared.json` project registry routes | `…/studio/shared-config.test.ts` |

## Security

| Concern | Proves | Test |
|---------|--------|------|
| Mount collisions | `ROUTE_PREFIX_COLLISION`, `MCP_TOOL_COLLISION` | `…/security/mount-collision-worker-env.test.ts` |
| Worker env sanitization | No hub secrets leak into worker env | `…/security/mount-collision-worker-env.test.ts` |
| UI blob traversal | `..` path traversal blocked on UI route | `…/flow-runtime/phase2-full-chain.test.ts` |

## Reference workflow — preview-review-v2 (RW)

Layered verification per [decision 10](../plans/product/plan/decisions/10-reference-workflow-verification-layered.md).
Test tree: `test-utils/spaces/preview-review-v2/`.

| ID | Fixture / artifact | Proves | Layer | Test |
|----|-------------------|--------|-------|------|
| R1 | `test-utils/spaces/preview-review-v2/` + `fixtures/reference-workflow/preview-review-v2-apply.json` | Normative tree passes `space apply --strict` | CI | `packages/cli/test/preview-review-v2-example.test.ts` |
| R3 | shell ViewCanvasHost | ViewCanvasHost at input-required (gate) in primary region (not drawer) | CI | `packages/shell-web/src/components/ViewCanvasHost.test.tsx` |
| R4 | `test-utils/spaces/preview-review-v2/` + `step:resolve` contract | Request changes → build reruns (review loop) | CI + manual | `packages/cli/test/preview-review-v2-example.test.ts` + release checklist **10-T1** |
| R5 | `test-utils/spaces/preview-review-v2/` + `step:resolve` contract | Validated → terminal completed | CI + manual | `packages/cli/test/preview-review-v2-example.test.ts` + release checklist **10-T1** |
| R4/R5 | `fixtures/flow-engine/step-output-chaining.json` | `{{steps.*}}` in handler params | CI | `packages/hub-core/test/unit/flow-engine/step-output.test.ts` |
| R6 | example + workflow grep | Zero legacy install commands in reference workflow | CI | `packages/cli/test/preview-review-v2-example.test.ts` |
| R2 | Tutorial 1 walkthrough | Non-contributor scaffold → Run Desktop | manual | release checklist **10-T1** |
| R3/R4 | Tutorial 1 visual | ViewCanvasHost + round-trip UX | manual | release checklist **10-T1** |
| R2–R4 | Playwright Desktop | Full human path automation | backlog | post-v2 |

## Tutorial v3 progressive conformance (TV3)

Tutorial v3 is a living product surface and the canonical manual end-to-end
acceptance path. Its executable source is
`test-utils/spaces/tutorial-v3/`, with progressive snapshots after Parts 2, 3,
5, and 6.

| ID | Fixture / record | Proves | Layer |
|----|------------------|--------|-------|
| TV3-2 | `part-2/snapshot.json` | Trigger-only resolver-agnostic intake flow | contract, CLI, HTTP |
| TV3-3 | `part-3/snapshot.json` | Space-owned View resolver and exact intake app | handler, View, shell |
| TV3-5 | `part-5/snapshot.json` | Safe copy plus versioned agent assignment | handler, MCP |
| TV3-6 | `part-6/snapshot.json` | Run-ID archive and allowlisted commit | repository |
| TV3-F | `fences.json` | Registered Markdown fences match canonical fixture content | docs-proof |
| TV3-M | `manual-acceptance.schema.json` + `manual-acceptance.template.json` | Review evidence is complete and comparable | manual/release |

Requirements:

- Every behavior-defining registered fence has a stable unique ID. Missing or
  duplicate IDs, missing fixture targets, and content drift fail docs-proof.
- YAML and JSON compare as canonical structures; shell, TypeScript, TSX, and
  executable text compare byte-for-byte.
- Every tutorial beat maps in `tutorial-beats.json` to an executable assertion
  or a named packaged-only check. Deterministic packaged behavior belongs in CI;
  signed/notarized installation, real credential-store states, actual upgrade,
  and real integration reload/verification remain signed-release evidence.
- Pending behavior suites are structurally present and skipped with their owning
  build-task ID. Expected failures are not acceptance evidence.
- Each manual record includes task, tutorial chapters, environment, product
  build, commands, run IDs, evidence, result, and blockers.
- The release acceptance artifact template (`manual-acceptance.template.json`)
  validates against `manual-acceptance.schema.json` in CI and pre-fills the
  signed-release-only evidence kinds.
- Feature slices rerun the smallest affected contiguous tutorial path. Release
  acceptance runs Parts 1–6 verbatim from a clean checkout, including paths with
  spaces and apostrophes.

## Gate

Ship when all rows above are green via `pnpm test`, `pnpm test:acceptance`, and `pnpm check:docs-proof`.
