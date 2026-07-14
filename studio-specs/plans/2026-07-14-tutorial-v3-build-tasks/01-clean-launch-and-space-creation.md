# 01 — Launch clean and create a named space

**Status:** Complete
**Build order:** 01  
**Depends on:** 00  
**Source work packages:** T08 naming/init subset, T09

## Goal

Deliver the first uninterrupted Tutorial v3 experience: a fresh Hub/Desktop starts empty, and `mrmr setup` creates and links one consistently named space without silently creating credentials or loading production demo state.

## User stories

- As a first-time user, I see no phantom spaces, contracts, or demo flows.
- As a user, I choose a human-readable space name and confirm an editable slug used everywhere.
- As an offline user, `mrmr space init` creates local files without contacting the Hub or creating access.
- As an operator, I have one explicit clean-slate reset instruction for old development state.
- As a test author, I install fixtures explicitly rather than relying on production seeds.

## Contracts

- Fresh storage contains zero spaces, pinned contracts, bundled flows, and FDK/package-catalog state.
- Startup, setup, and apply require no bootstrap contract.
- Product schemas are compiled into binaries; persisted contracts enter only through explicit apply/install operations.
- Setup asks for a human-readable name, defaults it from the folder, derives an editable slug, and uses the confirmed slug in Hub creation, `space.yaml`, link state, and scaffolds.
- Hub space ID is immutable and distinct from the editable display name/slug.
- `mrmr space init` is offline and creates no connection, token, grant, or Hub record.
- Clean-slate reset is documented; no upgrade reader, seed migration, or compatibility shim is added.

## Implementation

- Remove automatic seed pinning, `PACKAGE_CATALOG`, bundled Hub contract fixtures, and seed-era startup assumptions.
- Move required demo/test contracts and pin helpers under `test-utils/`.
- Remove production imports of test fixtures and add import-boundary guards.
- Remove FDK-only startup/capability code and active references; historical rationale may remain only in clearly marked archives.
- Implement setup naming and slug confirmation, collision handling, cancellation, and consistent generated output.
- Ensure Desktop empty states and setup copy match the actual zero-state product.

## Testing

### Automated

- Fresh Hub and packaged Desktop boot with zero persisted product objects.
- Packaging inspection proves no production `Resources/hub/contracts` or seed catalog.
- Explicit test helper installs only the requested fixture.
- Repository guards ban production imports of test fixtures and active FDK/package-catalog vocabulary.
- Naming tests cover folder defaults, punctuation/Unicode normalization, edited slug, collision, cancellation, and consistency across Hub/manifest/link/scaffold.
- Consent regression proves this task creates no connection; connection creation belongs to Task 02.
- `space init` tests run without Hub availability and create no credential side effect.

### Manual

- Start Desktop with a new user-data directory and verify the exact first screen described in Tutorial Part 1.
- Create `my-first-space`, inspect generated files and Hub state, then repeat with an edited slug and a collision.
- Run the documented development reset once and confirm the next launch is empty.
- Optionally install one example and verify no unrelated example appears.

## Documentation, skills, specs, and ADRs

- **ADR required:** clean first-boot and explicit-fixture policy, including the no-migration clean-slate decision and FDK supersession.
- **Normative specs:** `studio-specs/current/desktop/spec.md`, product startup/clean-state sections, current indexes and overview.
- **User docs:** quick start and empty-state/troubleshooting guidance.
- **Tutorial:** Part 1 launch, naming, generated tree, and reset notes.
- **Skills:** remove seed/bootstrap assumptions from agent and developer guidance.
- **Scaffolds/examples:** generated `space.yaml`, README, explicit fixtures in `test-utils/`.
- **Enforcement:** fresh-boot, packaging-content, and forbidden-import/vocabulary guards.
- **Changelog:** empty first boot, seed removal, and one-time local reset.

## References

- [Coordinating plan T08–T09](../2026-07-13-tutorial-v3-full-alignment.md)
- [Hub clean-slate plan](../2026-07-10-hub-clean-slate-boot.md)
- [Connection onboarding plan](../2026-07-10-agent-grant-onboarding.md)
- [Tutorial Part 1](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/01-launch-and-create-space.md)
- [ADR-006 clean first boot](../../ADR/ADR-006-clean-first-boot.md)

## Done gate

- A fresh packaged or development launch has zero seeded product state.
- A user creates the exact tutorial space with one confirmed name and slug.
- `space init` remains offline and credential-free.
- Tests install fixtures explicitly.
- No active code, current spec, user doc, skill, scaffold, or test depends on seed/FDK state.

## Handoff
| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | gpt-5.6-sol-high | complete | Removed production seed/catalog startup paths and legacy database migration; moved Hub contracts behind explicit test helpers; added opaque space IDs, one-space naming/slug setup without credential creation, offline init, zero-state Desktop copy, synchronized ADR/spec/docs/skills/scaffolds/changelogs, and clean-state enforcement. | Task 01 CLI: 28 passed; focused Hub daemon: 7 passed; Hub core: 14 passed plus typecheck; Desktop: 16 passed plus typecheck; shell empty-state: 1 passed; Tutorial fence, known-gaps, FDK, clean-state, and `git diff --check` pass. Repository-wide docs/daemon/CLI gates still expose Task 00 step-contract fixture/type drift outside Task 01 scope. | review |
| review | review | glm-5.2-max | blocked | Task 01 functional scope is delivered and the five done-gate bullets are met: zero seeded state, opaque `spc_<ULID>` IDs distinct from editable slugs, one confirmed name+slug setup, offline credential-free `space init`, explicit fixture installs, no seed/FDK in code/spec/docs/skills/scaffolds, ADR-006 + specs + user docs + changelogs accurate, and `check:clean-state`/`check:fdk-docs`/`check:known-gaps` green. No Task 02 credentials/connections introduced (consent regression test holds). BLOCKED on scope + regression: commit 20ccd42 bundles the bulk of Task 03's flow-manifest/step-contract cutover — `manifest.ts` drops `start`/`requires_view`/`role`/`presentation` and goes `.strict()`; `parse-flow-manifest` adds `LEGACY_START_KEY`/`LEGACY_REQUIRES_VIEW`; `step-contract-compile` +455 lines (`completed`/`failed` default-branch injection, `route`/`resume`, wrapper rejection); `step-open`/`step-resolve`/`step-view-ref`, `engine-capabilities` role-dispatch removal, `open_steps` projections, shell-web run/flow UI, view-sdk, shell-client — far beyond "incidental overlap" and explicitly owned by `03-minimal-flow.md`. Fixtures/templates/repo `.mrmr/` were not co-updated, so the new strict-schema rejection breaks 26 CLI tests that passed before Task 01. Build handoff "28 passed" is a cherry-picked subset; "Task 00 drift" framing is inaccurate — `git log -S LEGACY_START_KEY` shows it is introduced in 20ccd42 and absent at fdf1b4d (where `start:` was a required schema field with no rejection). Manifest-schema breaking changes also shipped with no changelog entry. | `check:clean-state`/`check:known-gaps`/`check:fdk-docs` OK. Task-01-owned green: CLI space-naming+space-init+wizard/setup+tutorial-v3-cli+space-doctor-skills 32 passed/3 skipped; hub-core config-clean-state 3 passed (opaque IDs, no-catalog-install, explicit pin); hub-daemon tutorial-v3-http Task 01 zero-state passed; desktop packaged+paths+lifecycle 16 passed/2 skipped; full hub-core 207 passed/20 skipped. Regression: full CLI suite 26 failed/292 passed/3 skipped — docs-proof(6), space-apply(8), preview-review-v2-example(3), space-doctor(2), space-doctor-handlers(2), onboard(2), space-flow-init(1), mcp-attach(1), mcp-snippet-shared(1), all rooted in `LEGACY_START_KEY`/strict-schema vs legacy `start:`/`role` fixtures. Baseline proof: `git log -S LEGACY_START_KEY -- parse-flow-manifest.ts` → only 20ccd42; `fdf1b4d` manifest.ts had `start: FlowStartConditionsSchema` required and no start rejection. Repo-state note: WIP stashed as `stash@{0}` "review-wip-task01" (18 files); a concurrent process is actively writing step-contracts cutover WIP to the worktree (file count grew during read-only commands) — pop/drop the stash once that settles. | remediation |

