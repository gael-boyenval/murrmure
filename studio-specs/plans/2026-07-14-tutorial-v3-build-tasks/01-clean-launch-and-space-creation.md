# 01 — Launch clean and create a named space

**Status:** Ready  
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

## Done gate

- A fresh packaged or development launch has zero seeded product state.
- A user creates the exact tutorial space with one confirmed name and slug.
- `space init` remains offline and credential-free.
- Tests install fixtures explicitly.
- No active code, current spec, user doc, skill, scaffold, or test depends on seed/FDK state.

