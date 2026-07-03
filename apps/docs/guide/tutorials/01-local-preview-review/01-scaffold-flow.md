# Part 1 — Scaffold `preview-review`

Create a v2 indexed flow from the **`hello-gate`** template, or clone the reference example tree.

## Option A — Clone the example (fastest)

```bash
git clone <murrmure-repo>
cd agentStudio/examples/flows/preview-review-v2
```

You get the normative tree under `murrmure/` (flows, views, actions, scripts). Skip to [Part 2](./02-install-and-connect).

## Option B — Scaffold in your project

```bash
mkdir -p ~/work/preview-review && cd ~/work/preview-review
mrmr space init
mrmr space flow init preview-review --template hello-gate
```

This creates:

```text
murrmure/
  flows/preview-review/flow.manifest.yaml
  views/preview-review/
  views/preview-review-intake/
  scripts/preview-review-build.mjs
  actions.yaml
  executors.yaml
  hooks.yaml
```

Each file includes a one-line **role** comment at the top.

## Understand the flow graph

The scaffold matches the [reference workflow spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/plans/product/plan/06-reference-workflow-preview-review.md):

```text
intake checkpoint → build invoke → review checkpoint ⇄ build → done invoke
```

Key manifest fields:

| Step | Kind | Purpose |
|------|------|---------|
| `intake` | `checkpoint` + view `preview-review-intake` | Human enters reviewer + preview URL |
| `build` | `invoke` → `run_preview_agent` | Agent/build script applies feedback |
| `review` | `checkpoint` + view `preview-review` | Human validates or requests changes |
| `done` | `invoke` → `mark_validated` | Terminal bookkeeping |

**`on_resolve`** on the review checkpoint branches the run:

- `output.outcome: validated` → `done`
- `output.outcome: changes_required` → `build` (loop)

## Customize views (optional)

Views use `@murrmure/view-sdk/app`:

```tsx
import { createViewMount } from "@murrmure/view-sdk/app";
import { App } from "./App";

createViewMount({ App });
```

Iterate locally:

```bash
mrmr view dev preview-review-intake
mrmr view dev preview-review
```

See [View SDK reference](../../../reference/view-sdk).

## Build script

`murrmure/scripts/preview-review-build.mjs` reads `MURRMURE_INPUT` and `MURRMURE_INVOKE_PARAMS` (including prior checkpoint comment output from the review step).

## Checkpoint

You have a complete `murrmure/` tree ready to build and apply.

## Next

[Part 2 — Apply and connect →](./02-install-and-connect)
