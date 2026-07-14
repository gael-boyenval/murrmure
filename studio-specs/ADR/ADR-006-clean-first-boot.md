# ADR-006 — Clean first boot and explicit fixtures

**Status:** Accepted  
**Date:** 2026-07-14  
**Owners:** Hub, Desktop, CLI

## Context

Hub startup historically pinned demo contracts, Desktop packaged those fixtures,
and the CLI exposed a small built-in package catalog. That made development
examples appear to be product state, coupled tests to startup side effects, and
prevented a first-time user from distinguishing their own space from bundled
demo data.

Space IDs were also derived from slugs. Slugs are user-facing and editable, so
they cannot safely serve as immutable protocol identity.

## Decision

1. Fresh Hub storage contains no spaces, pinned contracts, flow installs, or
   indexed flows.
2. Hub and Desktop binaries compile product schemas but do not package or pin
   demo contracts.
3. Production code does not import `fixtures/` or `test-utils/`. Tests request
   and pin individual fixtures explicitly from `test-utils/`.
4. The built-in package catalog is removed. Installing a capability requires an
   explicit bundle.
5. Space IDs are opaque `spc_<ULID>` values. The display name and slug remain
   user-facing metadata and do not determine identity.
6. `mrmr setup` creates and links one confirmed named space. It does not mint a
   grant, token, or local agent connection; connection onboarding is a separate
   operation.
7. `mrmr space init` is local-only. It writes `.mrmr/` scaffolding without
   contacting Hub or creating credentials.
8. This cutover has no seed migration, compatibility reader, or dual storage
   path. Operators who used development builds perform the documented one-time
   local reset.

## Consequences

- First launch accurately represents empty product state.
- Tests become deterministic because their contract dependencies are explicit.
- Space links persist an immutable ID independently of editable naming.
- Existing development databases may retain old state until the operator
  performs the reset; production does not infer, rewrite, or migrate it.
- Connection creation remains outside Tutorial v3 Task 01 and is owned by the
  later connection-onboarding slice.

## Enforcement

- Fresh-Hub and packaged-Desktop tests assert zero product state.
- Packaging tests reject bundled Hub contracts.
- `pnpm check:clean-state` rejects production fixture imports, seed catalogs,
  bundled contract paths, and active retired FDK vocabulary.

