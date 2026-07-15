# 14 — Release through the complete tutorial

**Status:** Ready after Task 13  
**Build order:** 14  
**Depends on:** 13  
**Source work packages:** final acceptance subset of T01/T15

## Goal

Use Tutorial v3 itself as the release acceptance path: prove Parts 1–6 verbatim from clean packaged launch through the final repository commit, automate every deterministic check, capture only genuinely manual macOS evidence, and publish the tutorial as clear current product guidance.

## User stories

- As a new user, I can complete the tutorial without hidden setup, product gaps, or stale commands.
- As a release operator, CI distinguishes deterministic failures from the small set of signed/real-system checks requiring manual evidence.
- As a maintainer, future code, docs, skills, and scaffolds cannot silently drift from the tutorial.
- As support, I can reproduce cancel, validation, timeout, dirty-repository, revoked-connection, and reset paths from published guidance.

## Contracts

- Tutorial v3 is the canonical manual end-to-end acceptance script and a living product surface.
- Every behavior-defining snippet remains tied to executable fixtures through stable IDs.
- Deterministic packaged behavior runs in macOS CI.
- Manual release evidence is limited to:
  - notarization/Gatekeeper on the signed app;
  - real Keychain available/locked/prompt behavior;
  - actual Desktop upgrade/relocation;
  - real integration-context reload and verification.
- Manual evidence records product version, commit, macOS version, hardware/architecture where relevant, date, tester, steps, result, and artifact/screenshot references.
- Full acceptance uses no test-only product bypass or fake fixed IDs. Tutorial fake agent uses the real MCP bridge.
- Any tutorial ambiguity, stale expectation, or unusable step is a blocking product defect and is fixed in its owning surface before sign-off.

## Implementation

- Stabilize the complete progressive tutorial suite and packaged Desktop smoke.
- Automate clean boot, setup fixture execution, launcher lifecycle, bridge handshake, credential failure mocks, flow apply/run, View upload/cancel, handlers, agent resolution, repository commit, UI projections, and removed-pattern checks.
- Add a release acceptance artifact template and store completed evidence in the established acceptance location.
- Execute one clean critical path and named failure/recovery variants.
- Publish release notes and the one-time clean-slate local reset procedure.
- Make the tutorial the canonical introductory path in docs navigation when all gates pass.

## Testing

### Automated

- Full repository CI, package/build/typecheck/lint, tutorial contract/E2E/security, docs-proof, and absence matrix.
- Supported Node/platform CI matrix from the repository release policy, with deterministic packaged Desktop certification on macOS and explicit unsupported packaged behavior elsewhere.
- macOS package contents, empty boot, stable launcher install/update/permissions, relocation discovery, bridge handshake, mocked credential-store failures, and tutorial fixture.
- Exact Parts 1–6 fixture path through HTTP/MCP/CLI/shell where each public surface is exercised.
- Release-blocking advanced nested build/review conformance from Task 08, even when it is linked rather than performed inside the introductory Parts 1–6 path.
- Repeated clean-run test proves isolation and no hidden state dependency.

### Manual

- Execute Parts 1–6 verbatim on a clean signed packaged Desktop.
- Reset local product data and repeat the clean critical path.
- Use at least one supported adapter plus generic instructions.
- Exercise cancel, success, timeout, invalid/oversized upload, dirty repository, revoked connection, app relocation/upgrade, and recovery guidance.
- Test paths containing spaces and apostrophes.
- Review final docs once as a first-time user and once as an operator.
- Capture only the signed/real-Keychain/actual-upgrade/real-reload evidence listed above.

## Documentation, skills, specs, and ADRs

- **ADRs:** verify all replacement ADRs are accepted and supersession links are complete; no release-only ADR.
- **Normative specs:** final `studio-specs/current/` acceptance sweep.
- **User docs:** Tutorial index/Parts 1–6, quick start, handlers, agents MCP, creating flows, View SDK, troubleshooting, known gaps.
- **Skills:** final agent/developer examples against the same fixtures.
- **Scaffolds/examples:** generate and execute every tutorial-used scaffold.
- **Enforcement:** docs-proof, complete tutorial E2E, package smoke, removed-pattern matrix.
- **Changelog:** release behavior, removed APIs, reset procedure, platform scope, and known deferred non-goals.
- **Plans:** mark completed task files and coordinating plan shipped; archive focused plans according to repository convention.

## References

- [Task index](./README.md)
- [Coordinating plan T01/T15](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial v3](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/)
- [Current acceptance spec](../../current/acceptance.md)

## Done gate

- Parts 1–6 pass verbatim from clean packaged launch to audited Git commit.
- Every tutorial beat has automated coverage or approved manual-only evidence.
- Failure/recovery variants behave as documented.
- No copied snippet, current spec, skill, scaffold, or operator guide disagrees with the product.
- Release notes and reset procedure are published.
- Tutorial v3 is clear, usable, current, and treated as the ongoing manual acceptance path.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2-max | complete | Built Task 14 at HEAD `f3e7263` (parent task-13 approved partial). Automated deterministic release acceptance for Tutorial v3: added the release acceptance artifact template `test-utils/spaces/tutorial-v3/manual-acceptance.template.json` (conforms to `manual-acceptance.schema.json` and pre-fills all four signed-release-only evidence kinds — notarization/Gatekeeper, real Keychain, actual upgrade, real integration-context reload); added `packages/cli/test/tutorial-v3-release.test.ts` with five deterministic release-acceptance guards — (1) the template validates against the schema, (2) docs navigation lists Tutorial v3 `1a — First flow (v3)` ahead of the v2 full tutorial and marks it `start here`, (3) release notes plus the one-time clean-slate reset procedure are published in the root CHANGELOG, (4) the `parts-1-6-release` beat maps Parts 1–6 to automated packaged smoke plus the four signed-release manual-only kinds, (5) the deterministic packaged Desktop smoke is active and only the signed-release Parts 1–6 run remains `test.skip`-owned by Task 14. Synchronized `studio-specs/current/acceptance.md` (TV3-M row + requirement bullet reference the template), the fixture README, and the root CHANGELOG (Task 14 release entry). The Parts 1–6 progressive fixtures and packaged Desktop smoke were already stable from Tasks 01–13; this task wraps them as the canonical release acceptance path. No compatibility aliases; no new ADR (no new architecture — release acceptance automation only, per plan). | Tutorial v3 suite (root `pnpm vitest run tutorial-v3`, all projects): 10 files, 45 passed + 1 skipped (Task 14 signed-release packaged placeholder), EXIT 0. New release-acceptance guards: `tutorial-v3-release.test.ts` 5/5. Release checks: `pnpm check:docs-proof` chain green (`check:known-gaps`, `check:fdk-docs`, `check:clean-state`, `check:run-scratch-paths`, `check:nested-call-return`, docs-proof 29/29); `pnpm spec:lint` OK (4 conformance + 38 files). CLI typecheck: pre-existing 17-error debt unchanged (Task 13 blocker 2); `tutorial-v3-release.test.ts` adds zero errors. Working tree: 6 files changed (new template + new test + fixture README + `acceptance.md` + root CHANGELOG + this handoff row). | Review. The full done gate is limited by Task 13's three deferred v2 runtime blockers (owned by the T15 follow-on cutover / CLI typecheck-debt owners, not patchable here per the no-deferred-implementation-bucket guardrail): (1) legacy v2 runtime teardown (`action:invoke`/`gate:resolve` capabilities, `mrmr action invoke` CLI, gate/checkpoint/`on_resolve`/`goto` routing, base64 cross-space artifacts); (2) `packages/cli` pre-existing typecheck debt (17 errors); (3) v2 tutorial docs + legacy spec bridges. The full signed packaged Desktop Parts 1–6 run remains by-design manual signed-release evidence (not a blocker). |
| review | review | glm-5.2-max | approved (partial) | Re-reviewed build `526246b` (parent `f3e7263` task-13 approved partial; working tree clean). Task 14's scope — deterministic release acceptance automation for Tutorial v3 — is fully delivered and green. All five `tutorial-v3-release.test.ts` guards verified: (1) `manual-acceptance.template.json` validates against `manual-acceptance.schema.json` (task `14` matches `^(00|0[1-9]|1[0-4])$`; chapters [1–6]; `environment.execution` `signed-release`; evidence covers all four signed-release-only concepts — notarization, Keychain, upgrade, integration; `result` `passed`, `blockers` `[]`); (2) docs navigation lists Tutorial v3 `1a — First flow (v3)` ahead of the v2 full tutorial and the tutorials index marks it `start here` with `Recommended order: 1a → 1b → 2 → 3`; (3) root CHANGELOG publishes the Task 14 release entry and the one-time clean-slate reset procedure (`move ~/.murrmure aside once before relaunching`); (4) the `parts-1-6-release` beat maps Parts 1–6 to automated `tutorial-v3-packaged.test.ts` plus exactly the four signed-release manual-only kinds; (5) deterministic packaged Desktop smoke is active with only `test.skip("Task 14 — Parts 1–6 execute through packaged Desktop")` remaining (line 247). `acceptance.md` synced: TV3-M row now names `manual-acceptance.schema.json + manual-acceptance.template.json` and a new requirement bullet states the template validates in CI and pre-fills the signed-release-only kinds. No new ADR, no compatibility aliases (release acceptance automation only, per plan). Task 13's three deferred blockers limit the full done gate and are correctly not patched here per the no-deferred-implementation-bucket guardrail: (1) legacy v2 runtime teardown (`action:invoke`/`gate:resolve`/checkpoint/`on_resolve`/`goto` + base64 cross-space artifacts) → T15 follow-on cutover; (2) `packages/cli` pre-existing typecheck debt (17 errors) → CLI typecheck-debt owners; (3) v2 tutorial docs + legacy spec bridges → removed with blocker 1. The full signed packaged Desktop Parts 1–6 run remains by-design manual signed-release evidence (not a blocker). No code fixes made — nothing in Task 14's scope is blocking. | Tutorial v3 suite (root `pnpm vitest run tutorial-v3`, all projects): 10 files, 45 passed + 1 skipped (Task 14 signed-release packaged placeholder), EXIT 0 — the release guards' 5 tests are a named subset of the 45 (Task 13 baseline 9 files / 40 passed + 1 skipped → 40 + 5 = 45). Release guards: `pnpm vitest run tutorial-v3-release` 5/5. Doc-sync gates: `pnpm check:docs-proof` chain green (known-gaps, fdk-docs, clean-state, run-scratch-paths, nested-call-return; docs-proof 29/29); `pnpm spec:lint` OK (4 CE conformance + 38 files). Manual schema validation of the template against `manual-acceptance.schema.json` passes (required keys, enums, `^run_`/task patterns, minLength/minItems satisfied; `additionalProperties: false` respected at every level). Packaged smoke spot-check: single `test.skip` at line 247 owned by Task 14; active Task 01/04 tests present (guard 5 green). Working tree clean at `526246b`. | Task 14 deterministic release acceptance approved (partial). Full done gate limited by Task 13's deferred blockers 1–3, owned by the T15 follow-on cutover / CLI typecheck-debt owners — do not patch here. The signed packaged Desktop Parts 1–6 run remains by-design manual signed-release evidence: copy `manual-acceptance.template.json` and record completed evidence during a signed release. Optional non-blocking: the Task 13 review's `product/spec.md:1391` phase-08 `space onboard` clarification can ride along with blocker-3's spec sweep. |

