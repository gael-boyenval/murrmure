# Plan — Hub clean-slate boot (no seed contracts)

**Date:** 2026-07-10  
**Status:** Planned — not started  
**Goal:** Murrmure Desktop and the hub daemon start from an **empty platform state**: no pre-pinned contracts, no FDK-era package catalog stubs, no bundled demo workflow data. Contracts and flows enter the system only when a user applies a space (`mrmr space apply`) or installs a real bundle.

**Principle (north star):** Murrmure owns the wire; spaces own execution. A first boot is “hub up, zero spaces, zero contracts” until the operator onboards.

---

## Problem

Today the hub **requires** seed data to boot:

| Stub | Location | Effect |
|------|----------|--------|
| Seed contract pin | `packages/hub-daemon/src/main.ts` | Reads `fixtures/hub/contracts/linear-demo-v2.json`, pins `cref_linear_demo` on every start |
| Bundled contracts dir | `apps/desktop/electrobun.config.ts` | Copies `fixtures/hub/contracts/` into `Resources/hub/contracts` in the Desktop app |
| FDK package catalog | `packages/hub-core/src/handlers/config.ts` `PACKAGE_CATALOG` | `review-loop`, `brand-check`, `feature-spec` install without a bundle — maps to deleted/stub contract refs |
| Repo fixture tree | `fixtures/hub/contracts/linear-demo-v2.json` | Used by hub boot, Desktop bundle, integration tests, contract parse tests |

This contradicts the product model: users boot the app, run setup/onboard, create a space, apply their own `.mrmr/` tree. Nothing in `fixtures/` or `test-utils/` should be **production runtime input**.

`linear-demo-v2.json` is a minimal contract v2 toy (`draft → review → done`). It belongs in **`test-utils/`** for CI and manual hub/kernel tests — not in the shipped app.

---

## Target behavior

### First boot (normative)

1. Desktop launches embedded hub → **exit 0**, SQLite migrated, **zero pinned contracts**.
2. Shell loads → operator sees empty / onboarding state (no phantom `brand-check` or `feature-spec` capabilities).
3. First space + flows appear only after guided `mrmr setup` or granular `mrmr space init/link/apply`; `mrmr space onboard` is removed without an alias.
4. `installCapability` without a bundle **rejects unknown flow ids** — no hidden catalog.

No bootstrap contract is operationally required for startup, setup, or apply. Product validation schemas are compiled into the binaries; persisted contracts enter the Hub only through explicit space apply or real bundle installation.

### Tests (normative)

- Integration tests that need `cref_linear_demo` **pin the fixture themselves** (test helper), same pattern as `packages/hub-core/test/integration/helpers.ts` today.
- Hub daemon unit/HTTP tests do **not** assume startup seed contracts unless the test fixture explicitly pins them.
- `linear-demo-v2.json` lives at `test-utils/hub/contracts/linear-demo-v2.json`.

---

## Scope

### In scope

| ID | Work |
|----|------|
| **CS-1** | Remove `pinContract` seed loop from `hub-daemon` `startHubDaemon` |
| **CS-2** | Remove `resolveContractsDir` / bundled contracts path from production hub boot (delete or test-only) |
| **CS-3** | Remove `PACKAGE_CATALOG` and non-bundle `installCapability` catalog branch in `config.ts` |
| **CS-4** | Move `fixtures/hub/contracts/linear-demo-v2.json` → `test-utils/hub/contracts/linear-demo-v2.json`; delete `fixtures/hub/` |
| **CS-5** | Remove Desktop `electrobun.config.ts` copy of `fixtures/hub/contracts` |
| **CS-6** | Repoint all test imports from `fixtures/hub` → `test-utils/hub` |
| **CS-7** | **Stub audit** — grep production packages (`hub-daemon`, `hub-core`, `apps/desktop`, `cli` runtime paths) for hardcoded demo data; document and remove or gate behind test-only config |
| **CS-8** | Update normative docs (`studio-specs/current/hub/contracts.md`, `current/index.md`) and user docs if they still describe seed contracts |
| **CS-9** | Add CI guard: production `packages/` and `apps/desktop/src` must not reference `fixtures/hub` or `test-utils/` paths |
| **CS-10** | FDK purge: archive only historical ADR/shipped-plan rationale with explicit superseded banners; delete FDK pages from `current/` and remove FDK-only production/test/scaffold/skill/user-doc surfaces and active links |

### Out of scope (separate decisions)

- Generating a **per-install bootstrap token** instead of `01JBOOTSTRAPTOKEN00000001` (audit item; may stay for v1 local-first loopback).
- Deleting `studio-specs/current/fixtures/` golden JSON (normative test vectors — not runtime).
- Federation / cloud hosted hub seed policy.

---

## Stub audit checklist (CS-7)

Run at slice start; file findings in this plan or a short `2026-07-10-hub-clean-slate-boot-audit.md` appendix.

| Area | File / pattern | Question |
|------|----------------|----------|
| Hub boot | `main.ts` `bootstrapToken ?? "01JBOOTSTRAPTOKEN00000001"` | Acceptable for local loopback, or mint on first DB create? |
| Desktop session | `apps/desktop/src/session.ts` `DEFAULT_BOOTSTRAP_TOKEN_BARE` | Must match hub seed token — single source of truth? |
| Artifact GC | `artifact-service.ts` `token_id = "01JBOOTSTRAPTOKEN00000001"` | System actor vs bootstrap coupling |
| Config handler | `PACKAGE_CATALOG` | **Delete** (this plan) |
| Config handler | `GRANT_TEMPLATES` | Templates, not stub flows — keep |
| Evolution stubs | `validateEvolution` / `testEvolution` hardcoded `tests_run: 3` | Product stub or placeholder API? |
| Contract diff | `contractDiff` synthetic breaking detection (`3.` major) | Placeholder — document as non-normative |
| Deprecated HTTP | Tests using `contract_ref_id: cref_linear_demo` on instance create | Migrate to test-helper pin |
| Specs drift | `studio-specs/current/capabilities/feature-spec.md`, `bridges/feature-spec.md` | **Delete from current.** Preserve only historical ADR/shipped-plan rationale under archives with superseded/non-normative banners |
| README | `fixtures/hub/` table row | Update to `test-utils/hub/` |

**Audit command (indicative):**

```bash
rg -n 'cref_linear_demo|cref_review_loop|cref_feature_spec|PACKAGE_CATALOG|fixtures/hub|linear-demo-v2|01JBOOTSTRAPTOKEN' \
  packages/hub-daemon/src packages/hub-core/src apps/desktop/src packages/cli/src
```

---

## Implementation slices

### Slice 1 — Remove production seed contracts (CS-1, CS-2, CS-5)

- Delete pin loop in `startHubDaemon`.
- Remove `electrobun.config.ts` contracts copy.
- Smoke: Desktop dev build starts hub without `Resources/hub/contracts` present.
- Fix any startup test that assumed pinned `cref_linear_demo`.

**Done gate:** `pnpm --filter @murrmure/hub-daemon test` green; packaged hub smoke starts with empty contract table.

### Slice 2 — Delete package catalog (CS-3)

- Remove `PACKAGE_CATALOG` and catalog branch in `installCapability`.
- Non-bundle install returns `unknown_package` for all flow ids unless `bundleMeta` is supplied (apply path).
- Update / delete tests that installed `review-loop` or `brand-check` via catalog API.

**Done gate:** No `PACKAGE_CATALOG` in `packages/hub-core`; HTTP install without bundle requires apply digest path.

### Slice 3 — Move fixture to test-utils (CS-4, CS-6)

- `test-utils/hub/contracts/linear-demo-v2.json` (+ `test-utils/README.md` row).
- Update: `hub-core/test/integration/helpers.ts`, `bridge.test.ts`, `contracts.test.ts`, `hub-daemon/test/http-j01.test.ts`, J01 integration tests, any `docs-proof` path assertions.
- Delete `fixtures/hub/`.

**Done gate:** `rg 'fixtures/hub' packages apps/desktop` → 0 (excluding archives).

### Slice 4 — Docs, specs, enforcement (CS-8, CS-9)

- `studio-specs/current/hub/contracts.md` — cite `test-utils/hub/contracts/linear-demo-v2.json` as **non-shipped** parse example only.
- `studio-specs/current/index.md`, root `README.md`.
- Extend `docs-proof` or add `scripts/check-hub-seed-stubs.mjs` for CS-9.
- Delete active FDK capability/bridge/user/skill/scaffold/test surfaces; mark retained historical ADR/shipped-plan records superseded and exclude them from current-guidance search.
- `CHANGELOG.md` operator note: first boot has no bundled workflows.

**Done gate:** doc-sync rule satisfied; CI guard passes.

---

## Acceptance criteria

| ID | Criterion |
|----|-----------|
| **A1** | Fresh hub DB after `startHubDaemon` has **0** rows in contract pin store (or equivalent empty catalog query). |
| **A2** | Murrmure Desktop starts without `Resources/hub/contracts/` in the bundle. |
| **A3** | `POST /v1/spaces/:id/capabilities/install` with `flow_id: brand-check` and no bundle → `unknown_package` (404). |
| **A4** | `test-utils/hub/contracts/linear-demo-v2.json` exists; `fixtures/hub/` does not. |
| **A5** | J01 / bridge / contracts unit tests pass using test-helper pin, not startup seed. |
| **A6** | Stub audit checklist completed; remaining hardcoded tokens documented with owner decision. |
| **A7** | Startup, setup, and first apply succeed with zero bootstrap contracts; tests that need contracts explicitly install fixtures. |
| **A8** | Active code/specs/docs/tests/skills/scaffolds contain no FDK model or links; only explicitly superseded historical rationale remains archived. |

---

## Doc impact

| Layer | Paths |
|-------|-------|
| Normative | `studio-specs/current/hub/contracts.md`, `current/index.md` |
| User docs | Only if any guide still mentions seed contracts or `brand-check` install |
| Examples | None — `test-utils/` is not linked from `apps/docs/` |
| Skills | `skill-developer` if it references `fixtures/hub` |
| Enforcement | `packages/cli/test/docs-proof.test.ts` or new seed-stub script |
| Changelog | `CHANGELOG.md` |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Tests assumed startup pin | Slice 1 fails fast; centralize `pinLinearDemoContract(testDb)` helper |
| Desktop packaged smoke relied on bundled JSON | Replace with “hub starts empty” assertion |
| Hidden callers of catalog install API | Grep + delete tests in Slice 2 |
| Bootstrap token coupling | Audit only in CS-7; do not block CS-1–4 |

---

## Related

- FDK deletion plan noted seed contract removal: `studio-specs/archives/plans/shipped-2026-07/product-plan/09-fdk-deletion.md`
- Desktop bundle decision D15 (seed contracts): `studio-specs/archives/plans/murrmure-desktop-v1.md` — **superseded by this plan**
- `test-utils/` policy: `test-utils/README.md`
- Examples removal: `studio-specs/plans/doc-updates/11-fixtures-examples.md` (historical)
