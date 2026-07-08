# Failure: `mrmr space view init` scaffolds unpublished `@murrmure/view-sdk@^0.1.0`

## Summary

Tutorial Part 6 (`06-build-views.md`) instructs users to run `mrmr space view init` and then `npm install` inside the scaffolded view directory. The scaffold template pins `@murrmure/view-sdk@^0.1.0`, but the public npm registry only publishes **0.2.0** and **0.2.1**. `npm install` fails with `ETARGET` / `notarget`, blocking the local preview-review tutorial at the first view build step.

## Context

- **Repo / space:** `/spaces/spc_my_space`
- **Failure type:** `integration_failure`
- **Workflow:** Tutorial 1 — Local preview review, Part 6 — Build the views
- **Step:** Intake view — Step 1 (scaffold + `npm install`)
- **Commands:**
  ```bash
  mrmr space view init preview-review-intake
  cd murrmure/views/preview-review-intake
  npm install
  ```
- **Environment:** External space repo following the tutorial; dependencies resolved from the public npm registry (not monorepo `workspace:*` links).

## Evidence

**npm error:**

```
npm error notarget No matching version found for @murrmure/view-sdk@^0.1.0
```

**Published versions on npm** (`npm view @murrmure/view-sdk versions`):

```json
["0.2.0", "0.2.1"]
```

**Scaffold source** — CLI view template still pins `^0.1.0`:

- `packages/cli/templates/views/vite-react/package.json` → `"@murrmure/view-sdk": "^0.1.0"`
- Same pin in example flows: `examples/flows/preview-review-v2/murrmure/views/*/package.json`, `examples/flows/daily-brief-v2/murrmure/views/daily-brief/package.json`
- CLI skill reference: `packages/cli/skill/reference/views.md` documents `"@murrmure/view-sdk": "^0.1.0"`

**Monorepo package version** is already ahead of the scaffold pin:

- `packages/view-sdk/package.json` → `"version": "0.2.1"`

**Docs repro path:** `apps/docs/guide/tutorials/01-local-preview-review/06-build-views.md` — Intake view, Step 1.

**Root cause:** `0.1.x` was never published (or was yanked); first public releases are `0.2.0` / `0.2.1`. The scaffold and tutorial were not updated when the package shipped.

## Murrmure improvement

1. **Update the view scaffold template** (`packages/cli/templates/views/vite-react/package.json`) to pin a published range, e.g. `"@murrmure/view-sdk": "^0.2.1"` (or `^0.2.0` if minor flexibility is preferred).
2. **Align examples and docs** — bump `package.json` pins in `examples/flows/*` and any skill/reference snippets that still say `^0.1.0`.
3. **Add a docs-proof or CLI test** that scaffolds a view and runs `npm install` (or at minimum asserts the template `package.json` version satisfies `npm view @murrmure/view-sdk version`), so scaffold drift from the registry cannot ship again.
4. **Optional DX:** have `mrmr space view init` print the resolved SDK version or run `npm install` as a post-scaffold step with a clear error if the pin is unsatisfiable.

## Source

- Event: `murrmure.feedback.failure`
- Emitter: `/spaces/spc_my_space`
- Session: `ses_01KWYANYHQ5MA6NHNKME53WJMT`
- Run: `run_01KWYANYHRQ2XGMTE21NWN146T`
- Docs: `apps/docs/guide/tutorials/01-local-preview-review/06-build-views.md` (Step 1)
