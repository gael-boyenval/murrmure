# Decision 01 — Publish `@murrmure/view-sdk` to public npm

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § Assumptions #1](../plan-review-1.md), [09-review-synthesis.md §9 Q2](../09-review-synthesis.md)  
**Blocks:** Phase 03b scaffold, 08-T1 (non-contributor tutorial), success metric #2 (view author path)

---

## Context

Phase **03b** introduces the author surface: React view apps in `murrmure/views/*/src/` import `@murrmure/view-sdk/app` (`createViewMount`, `useViewContext`, `useViewSubmit`, etc.). The `mrmr view init` scaffold ships a Vite+React tree whose `package.json` must declare that dependency.

Today `@murrmure/view-sdk` is **monorepo-only**:

- `"private": true` in `packages/view-sdk/package.json`
- Exports only host paths (`.` and `./host`); `./app` is planned in 03b
- In-repo scaffolds can use `"workspace:*"` — that resolves only inside the Murrmure monorepo

The plan targets a **non-contributor author** persona (08-T1, TTFRun ≤ 10 min): someone clones or scaffolds a space, runs `npm install` in `murrmure/views/<id>/`, builds, applies, and sees the view in Desktop. That path **breaks** if the SDK is not installable from a registry outside the workspace.

[09-review-synthesis.md](../09-review-synthesis.md) had logged this as **Q2: Open** — *"monorepo-only for now; external authors copy from scaffold"* — which did not specify how `npm install` resolves the SDK in a standalone space repo.

### Options considered

| Option | Summary | Rejected because |
|--------|---------|------------------|
| **A. Publish to npm** | Public scoped package; scaffold pins semver range | — **Chosen** |
| B. Vendor into each view | Copy SDK source into every scaffold | Drift, no semver, poor DX |
| C. Bundle with CLI/Desktop | `file:` or cache path from Murrmure install | Custom resolution; harder to document |
| D. Monorepo-only MVP | External authors must clone full repo | Contradicts 08-T1 and stated success metrics |
| E. Hybrid (CLI tarball until npm) | Delay publish | Unnecessary given no users and willingness to publish early |

---

## Discussion

**Product owner (2026-07-03):**

- npm publish is acceptable **at any time** — no active users; commit, tag, and publish whenever ready.
- **Publish publicly scoped** to npm as `@murrmure/view-sdk`.
- View scaffold flow: add `@murrmure/view-sdk` to the view's `package.json`, then run **`npm install`** (standard npm workflow).

**Implications agreed implicitly:**

- No `workspace:*` in scaffolds intended for standalone space repos.
- Monorepo development may still use `workspace:*` via pnpm overrides; published scaffolds and examples use registry versions.
- `./app` export must ship on npm alongside host exports (03b scope unchanged; distribution channel now explicit).

---

## Decision

**Publish `@murrmure/view-sdk` to the public npm registry** under the `@murrmure` scope.

### Author workflow (normative)

1. `mrmr view init <view-id>` (or `mrmr space flow init` which includes a view) scaffolds `murrmure/views/<view-id>/` with a `package.json` that includes:

   ```json
   {
     "dependencies": {
       "@murrmure/view-sdk": "^0.1.0"
     }
   }
   ```

   (Exact initial version follows first publish; bump scaffold template when releasing.)

2. Author runs `npm install` (or `pnpm install` / `bun install` if they prefer — npm is the documented default).

3. Author implements the view with `@murrmure/view-sdk/app` imports, runs `npm run build`, then `mrmr space apply`.

### Publish workflow (normative)

- Remove `"private": true` from `packages/view-sdk/package.json` when `./app` is ready (03b DoD).
- Add npm publish to release process: version bump → git tag → `npm publish --access public` for `@murrmure/view-sdk`.
- No need to wait for phase 08; **publish as soon as 03b `./app` surface is green**.
- Breaking protocol changes → semver major/minor per normal npm rules.

### Monorepo vs external

| Context | Dependency resolution |
|---------|------------------------|
| Murrmure monorepo (contributors) | `workspace:*` in root workspace is fine |
| Scaffolded / cloned space repos | `"@murrmure/view-sdk": "^x.y.z"` from npm |
| `examples/flows/*-v2/` fixtures | Pin published version (or `workspace:*` only if example lives inside monorepo) |

---

## Plan impact

Update when executing (not part of this decision file's scope, but required follow-ups):

| Artifact | Change |
|----------|--------|
| [03b-view-sdk.md](../03b-view-sdk.md) | Scaffold `package.json` pins npm version, not `workspace:*`; add publish step to DoD |
| [09-review-synthesis.md](../09-review-synthesis.md) §9 Q2 | Mark **Resolved** → public npm |
| [08-docs-and-proof.md](../08-docs-and-proof.md) | Tutorial 1 documents `npm install` after scaffold |
| `packages/view-sdk/package.json` | Remove `private`, add `"publishConfig": { "access": "public" }`, export `./app` |
| CI | Optional: smoke test `npm pack` / install scaffold in temp dir outside workspace |

---

## Open follow-ups (not re-decided here)

- **View dev loop / HMR** — separate decision (Question 2 in queue).
- **Exact semver at first publish** — `0.1.0` when `./app` ships; align with any existing `@murrmure/*` publish pattern in repo.

---

*End of decision 01.*
