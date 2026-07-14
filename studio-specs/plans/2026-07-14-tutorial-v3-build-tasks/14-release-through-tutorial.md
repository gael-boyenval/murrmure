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

