# React dev kit + simulated dev mode — execution plan

**Status:** execution plan (2026-06-21)  
**Parent specs:** [plan.md](./plan.md), [02-sdk.md](./02-sdk.md), [11-dev-loop-reload-protocol.md](./11-dev-loop-reload-protocol.md)

---

## Locked constraints

1. `studio capability init` scaffolds **strict React** only.
2. Generated dependency versions are **exact pins** (no semver ranges).
3. Init output includes scaffolded **visual error-state components**.
4. `studio capability dev --sim` provides a **thin local server** with:
   - simulated shell bridge
   - simulated Studio install state machine
   - simulated Studio instance state machine
5. Scaffold includes Playwright tests runnable against simulated mode.

---

## Milestones

| Milestone | Goal | Primary outputs |
|-----------|------|-----------------|
| M1 | Scaffold contract update | strict React init tree + root `package.json` |
| M2 | Runtime authoring layer | `@studio/capability-dev-kit` package surface |
| M3 | Policy enforcement | validate error codes for semver/dev-kit policy |
| M4 | Simulated runtime | `dev --sim` thin server + state-machine simulator |
| M5 | Testing + docs parity | Playwright scaffold, fixtures, acceptance/docs updates |

---

## Workstream A — `init` strict React scaffold

**Packages/files**

- `packages/capability-sdk/src/init.ts`
- `packages/capability-sdk/bin/studio-capability`
- `packages/capability-sdk/test/*`

**Tasks**

- Emit root `package.json` with exact pins for scaffold dependency set.
- Emit React-first UI files:
  - `ui/src/App.tsx`
  - `ui/src/mount.tsx`
  - `ui/src/components/error/CapabilityErrorBoundary.tsx`
  - `ui/src/components/error/CapabilityErrorState.tsx`
- Emit scripts:
  - `validate:capability`, `build:capability`, `dev:capability`
  - `test:unit`, `test:e2e`
- Add optional `--install` behavior in CLI.

**Exit criteria**

- `studio capability init demo-flow --dir ...` creates fully runnable React project.

---

## Workstream B — `@studio/capability-dev-kit`

**Packages/files**

- `packages/capability-dev-kit/` (new)
- exports for React runtime helpers + bridge utilities

**Tasks**

- Create package with subpath exports:
  - `@studio/capability-dev-kit`
  - `@studio/capability-dev-kit/react`
- Provide helpers used by scaffold:
  - capability provider/context hooks
  - bridge fetch client
  - default error-state components

**Exit criteria**

- Generated scaffold compiles using only public dev-kit exports.

---

## Workstream C — validation policy enforcement

**Packages/files**

- `packages/capability-sdk/src/validate.ts`
- `packages/capability-sdk/src/schema.ts` (if needed)

**Tasks**

- Add dependency policy checks:
  - missing dev-kit dependency
  - non-exact versions for required scaffold deps
  - sdk/dev-kit version mismatch
- Add JSON error codes:
  - `DEVKIT_VERSION_REQUIRED`
  - `DEVKIT_VERSION_NOT_EXACT`
  - `DEVKIT_SDK_VERSION_MISMATCH`

**Exit criteria**

- `studio capability validate . --json` blocks invalid dependency policy cases.

---

## Workstream D — simulated dev runtime (`dev --sim`)

**Packages/files**

- `packages/capability-sdk/src/dev.ts`
- supporting runtime modules under `packages/capability-sdk/src/dev-sim/*` (new)

**Tasks**

- Add `--sim` command path.
- Implement thin local server that:
  - serves simulated shell wrapper
  - relays `hub-fetch` style requests
  - hosts install lifecycle simulator
  - hosts instance lifecycle simulator (revision-aware)
- Add deterministic fixtures for simulated scenarios:
  - live install ready
  - pending review / pending agent
  - invalid transition / revision mismatch

**Exit criteria**

- `studio capability dev --sim` runs without hub and supports local UI/manual testing.

---

## Workstream E — Playwright scaffold + conformance

**Packages/files**

- init template output for `playwright.config.ts`
- scaffold `tests/e2e/*`
- fixtures under `fixtures/build-capability/`

**Tasks**

- Scaffold baseline E2E cases:
  - init render success
  - reload behavior
  - error-state visual rendering
  - state transition against simulator
- Update acceptance and fixture matrix docs.

**Exit criteria**

- `npm run test:e2e` passes against simulated runtime in CI/local.

---

## Suggested implementation order

1. M1 scaffold generation
2. M3 validation policy enforcement
3. M2 dev-kit package and scaffold migration
4. M4 simulated runtime
5. M5 Playwright scaffold + fixtures + docs sync

This order keeps init output and validation coherent before introducing simulator complexity.
