# Phase 09-pre — FDK test disposition inventory

**Status:** ✅ complete — **gate satisfied for phase 09 merge planning**  
**Execution order:** **9-pre** (after 06 example tree green; before 09 deletion PR)  
**Decision:** [11 FDK test disposition](./decisions/11-fdk-test-disposition-inventory.md)  
**Parent phase:** [09-fdk-deletion.md](./09-fdk-deletion.md)  
**Inventory run:** 2026-07-03 (`rg` over `packages/hub-daemon/test`, `packages/cli/test`, `packages/flow-dev-kit/test`)

---

## Purpose

Phase **09** deletes FDK worker runtime and many hub-daemon tests covering mount/bundle/install paths. **No deletion PR merges** without a **100% filled** per-test disposition table — especially **security** rows ([plan-review-3](./plan-review-3.md)).

---

## Required artifact

This file is the **single source**. Table below is the P1 inventory output.

### Disposition values

| Value | Meaning |
|-------|---------|
| **`delete`** | FDK-only; no v2 equivalent needed |
| **`port`** | v2 test exists or lands in same PR (replacement path **required**) |
| **`drop-documented`** | Intentionally no v2 test (rationale **required**) |
| **`keep`** | Not an FDK-primary test; retained post-09 (rationale required when listed) |

### Security rule

Tests covering mount collision, worker environment sanitization, install policy, or grant-scoped tool surfaces **must not** be deleted with disposition `delete` alone — require **`port`** (with path) or **`drop-documented`** (reviewed rationale).

---

## Inventory commands (P1)

Primary grep (spec):

```bash
rg -l 'MountRegistry|FlowWorkerPool|cdk-install|example-install|flow push|bundle-ingest' \
  packages/hub-daemon/test packages/cli/test
```

Extended grep (helpers + CLI FDK modules):

```bash
rg -l 'buildFlowRoot|initFlow|ingestFlowBundle|executeLiveApply|installExampleCapability|installScaffoldCapability|examples/capabilities|validateEvolution|promoteEvolution|templatesRoot|devFlowLoop|computeBundleDigest|buildScaffoldBundle' \
  packages/hub-daemon/test packages/cli/test
```

Package-level FDK tests:

```bash
rg -l 'flow-kit|validateFlowRoot|FlowManifestSchema' packages/flow-dev-kit/test
```

**Out of scope (negative / v2 guard — not disposition targets):**

| File | Why excluded |
|------|----------------|
| `packages/cli/test/preview-review-v2-example.test.ts` | v2 example conformance; grep hits anti-FDK patterns only |
| `packages/cli/test/skill-install.test.ts` | Asserts skill has no FDK references |
| `packages/cli/test/skill-eval/known-gaps-honesty.json` | Skill eval fixture, not a test file |

---

## Disposition table (100% filled)

| Test file / case | Covers (FDK surface) | Disposition | v2 replacement (path) or drop rationale |
|------------------|----------------------|-------------|----------------------------------------|
| `packages/hub-daemon/test/helpers/cdk-install.ts` | CDK scaffold + `buildFlowRoot` staging for bundle ingest | **delete** | Replaced in 09 M3 by space-directory fixture helper (`packages/hub-daemon/test/helpers/space-fixture.ts` — new) |
| `packages/hub-daemon/test/helpers/example-install.ts` | `ingestFlowBundle`, `executeLiveApply`, evolution validate/test | **delete** | Same M3 helper; seeds via `POST /v1/spaces/:id/apply` + indexed flows |
| `packages/hub-daemon/test/helpers/link-scaffold-deps.ts` | Symlinks `@murrmure/flow-kit` into CDK scaffolds | **delete** | View scaffold linking already in `packages/cli/test/helpers/link-view-scaffold-deps.ts` |
| `packages/hub-daemon/test/http/flow-runtime/grant-scoped-tool-list.test.ts` | **security** — MCP catalog filtered by grant `flow_acl` on mounted capability tools | **port** | Extend `packages/hub-daemon/test/http/flows/flow-call-acl.test.ts` + catalog assertions on indexed-flow grants (09a adds `http/mcp/catalog-acl.test.ts` if split needed) |
| `packages/hub-daemon/test/http/flow-runtime/install-policy-violation.test.ts` | **security** — agent `apply` on `human_only` prod → `INSTALL_POLICY_VIOLATION` | **port** | `packages/hub-daemon/test/http/config/deny-install-prod.test.ts` (HTTP install 404) + new apply-policy case in `packages/hub-daemon/test/http/spaces/apply.test.ts` (09a) |
| `packages/hub-daemon/test/http/flow-runtime/phase2-full-chain.test.ts` | **security** — full install chain + UI path traversal (`..%2f`) on `/flows/:id/:ver/ui/*` | **port** | Path traversal: `packages/cli/test/view-dev.test.ts`, `packages/cli/test/space-view-init.test.ts`; static shell: `packages/hub-daemon/test/http/shell-static/shell-static.test.ts`; indexed apply chain: `packages/hub-daemon/test/http/spaces/apply.test.ts` |
| `packages/hub-daemon/test/http/flow-runtime/promote-tool-refresh.test.ts` | FDK live apply version bump → `murrmure/control.tools_changed` | **port** | `packages/cli/test/mcp-control-session.test.ts` (handshake + replay after hook dispatch); re-apply tool refresh covered by space apply + MCP session in 09a |
| `packages/hub-daemon/test/http/flow-runtime/reconnect-outbox-replay.test.ts` | FDK `reconnect-outbox-replay` describe; v2 `mcp-wake` describe | **port** | **Keep** `flow-runtime/mcp-wake` block (already v2 `space apply`); **delete** FDK reconnect describe — replacement: `packages/cli/test/mcp-control-session.test.ts` |
| `packages/hub-daemon/test/http/flow-runtime/rollback-live-mount.test.ts` | **security** — live mount rollback removes tools; revoked tool → `TOOL_NOT_AUTHORIZED` | **drop-documented** | v2 has no `MountRegistry` / live rollback. Versioning is space-index digests via `mrmr space apply`; tool surface comes from indexed actions + grant ACL (`flow-call-acl`, `grant-mint`), not mount rollback |
| `packages/hub-daemon/test/http/flow-runtime/worker-crash-supervision.test.ts` | **security** — `FlowWorkerPool` SIGKILL auto-unmounts capability | **drop-documented** | v2 removes FDK worker pool; executors use shell/MCP spawn (`packages/hub-daemon/test/http/executor/tasks-poll.test.ts`). Crash-isolation threat model is OS process boundary, not in-hub worker supervision |
| `packages/hub-daemon/test/http/feature-spec/happy-path-publish.test.ts` | FDK feature-spec worker publish → `spec.published` | **delete** | v2 preview-review gate flow: `packages/hub-core/test/unit/gates/checkpoint-view.test.ts`, `packages/hub-daemon/test/http/gates/resolve.test.ts`, `examples/flows/preview-review-v2/` + `packages/cli/test/preview-review-v2-example.test.ts` |
| `packages/hub-daemon/test/http/feature-spec/publish-direct-denied.test.ts` | **security** — `publish_direct` guard when `skip_review: false` | **port** | v2 gate checkpoint + resolve: `packages/hub-daemon/test/http/gates/resolve.test.ts`, `packages/hub-core/test/unit/gates/present.test.ts` |
| `packages/hub-daemon/test/http/feature-spec/revise-republish-v2.test.ts` | FDK spec revise/republish via mounted worker API | **delete** | v2 flow step outputs + gate rounds in preview-review fixtures (`examples/flows/preview-review-v2/murrmure/views/*/dev/fixtures/`) |
| `packages/hub-daemon/test/http/feature-spec/spec-summary-query.test.ts` | Cross-space spec summary via FDK worker | **delete** | Cross-space policy: `packages/hub-daemon/test/http/cross-space/xs0-policy.test.ts`; indexed query via space home / journal (no FDK worker query surface) |
| `packages/hub-daemon/test/http/config/first-week-setup.test.ts` | Mixed: v2 health/spaces + FDK install/evolution/grant-on-capability | **port** | **Keep** health/whoami/create-space cases; **delete** install/validate/test evolution cases → `packages/hub-daemon/test/http/spaces/apply.test.ts`, `packages/cli/test/space-apply.test.ts` |
| `packages/hub-daemon/test/http/config/promote-breaking-gate.test.ts` | FDK `promoteEvolution` → `promoted_pending` gate | **delete** | v2 gates on checkpoint resolve: `packages/hub-daemon/test/http/gates/resolve.test.ts`; no evolution promote path |
| `packages/hub-daemon/test/http/config/deny-install-prod.test.ts` | **security** — agent token cannot `POST …/flows/install` on prod | **keep** | Retained post-09: documents removed HTTP install surface (404). Complements apply-policy port from `install-policy-violation` |
| `packages/hub-daemon/test/http/desktop/single-url-flow-smoke.test.ts` | Embedded hub serves shell + FDK `/flows/…/ui/*` + worker `/api/*` on one origin | **port** | `packages/hub-daemon/test/http/shell-static/shell-static.test.ts`, `packages/hub-daemon/test/lifecycle/embedded-lifecycle.test.ts`, `packages/view-sdk/test/host.test.ts`; view canvas routing via indexed views (09a) |
| `packages/hub-daemon/test/http/triggers/event-catalog.test.ts` | Trigger catalog lists `spec.published` from live FDK mount | **port** | `packages/hub-core/test/unit/events/emittable-catalog.test.ts` + rewrite catalog route test to indexed hooks (`packages/hub-daemon/test/http/hooks/delivery.test.ts` pattern, 09a) |
| `packages/hub-daemon/test/http/triggers/spec-published-wake-dev.test.ts` | FDK `spec.published` → cross-space dev wake | **port** | `packages/hub-daemon/test/http/hooks/delivery.test.ts`, `packages/cli/test/mcp-wake-prompt.test.ts`, v2 hook + `murrmure_invoke_action` in `reconnect-outbox-replay` mcp-wake block |
| `packages/cli/test/helpers/link-scaffold-deps.ts` | CDK test symlinks to `@murrmure/flow-kit` | **delete** | Superseded by `packages/cli/test/helpers/link-view-scaffold-deps.ts` |
| `packages/cli/test/cdk-conformance.test.ts` | CDK template validate/build/digest (`templates/flows/*`) | **delete** | `packages/cli/test/preview-review-v2-example.test.ts`, `packages/cli/test/space-flow-init.test.ts`, `packages/cli/test/space-apply.test.ts` |
| `packages/cli/test/validate.test.ts` | `initFlow`, `validateFlowRoot`, `buildFlowRoot` on CDK scaffold | **delete** | `packages/cli/test/space-flow-init.test.ts`, `packages/cli/test/space-view-init.test.ts`, `packages/hub-core/test/unit/index/parse-flow-manifest.test.ts` |
| `packages/cli/test/dev-sim.test.ts` | `devFlowLoop --sim` local FDK sim server | **delete** | v2 view dev: `packages/cli/test/view-dev.test.ts`; no sim install state machine in product |
| `packages/cli/test/build-assets.test.ts` | FDK UI static asset staging in flow build | **delete** | View build asset validation moves to view scaffold tests (`space-view-init`, `view-dev`) |
| `packages/cli/test/digest.test.ts` | FDK bundle digest (`packages/cli/src/digest.ts`) | **delete** | Space apply digests: `packages/hub-core/test/unit/index/apply-index.test.ts`, digest fields in `packages/cli/test/space-apply.test.ts` |
| `packages/flow-dev-kit/test/validate.test.ts` | `@murrmure/flow-kit` manifest validation | **delete** | Package deleted in 09d; flow manifest parsing covered by `packages/hub-core/test/unit/flow-engine/manifest.test.ts` and `packages/hub-core/test/unit/index/parse-flow-manifest.test.ts` |

**Table completion:** **27 / 27** inventory rows filled (**100%**).  
**Security rows:** **7** — all **`port`** (5) or **`drop-documented`** (2); none bare **`delete`**.

---

## Summary by disposition

| Disposition | Count | Notes |
|-------------|------:|-------|
| **delete** | 14 | FDK-only surfaces; replacements named where non-security |
| **port** | 10 | v2 paths exist or land in 09a |
| **drop-documented** | 2 | Worker pool / live-mount threat models removed with FDK |
| **keep** | 1 | `deny-install-prod` — regression on removed install HTTP route |

---

## Merge gate (normative)

Phase **09** PR **must not merge** unless:

1. ✅ This table is **100% filled** for every test file under `packages/hub-daemon/test/**` and `packages/cli/test/**` that imports or exercises FDK/mount/bundle/worker paths (plus `packages/flow-dev-kit/test/**`).
2. ✅ Every row tagged **`security`** has disposition **`port`** or **`drop-documented`** (not empty, not bare `delete`).
3. ⬜ CI green: `pnpm test` / `pnpm test:acceptance` after deletions (**executes in phase 09**, not 09-pre).

**09-pre gate:** items 1–2 satisfied by this document. Item 3 is the phase 09 deletion PR verification step.

---

## Phase 09 execution notes (M3)

1. Add `packages/hub-daemon/test/helpers/space-fixture.ts` (or equivalent) before deleting `example-install.ts` / `cdk-install.ts`.
2. Split `reconnect-outbox-replay.test.ts`: retain v2 `mcp-wake` describe; drop FDK reconnect describe.
3. Split `first-week-setup.test.ts`: retain v2 smoke tests; drop FDK install/evolution tests.
4. Do **not** delete `packages/flow-dev-kit/` until 09d (after view-sdk `/react` port verified).

---

*End of phase 09-pre.*
