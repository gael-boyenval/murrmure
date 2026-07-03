# Tutorial 1 — Local preview review

One coding agent and one human reviewer collaborate through an indexed **preview-review** flow in `murrmure/`. Checkpoint steps open your **custom views** in **ViewCanvasHost** (full primary-region canvas) — not shell admin chrome.

**Example tree:** [`examples/flows/preview-review-v2/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/preview-review-v2) (normative spec: [reference workflow spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/plans/product/plan/06-reference-workflow-preview-review.md)).

## Tutorial goal

Build and run a minimal review loop on a local hub:

- Human completes intake in a custom view
- Agent runs a build action between rounds
- Human reviews preview in **ViewCanvasHost** until validated
- Engine branches via `checkpoint.on_resolve` (`changes_required` → build, `validated` → done)

## How to use this tutorial

Follow the parts in order:

1. **Part 1** — scaffold `murrmure/` with `mrmr space flow init` (or clone the example tree)
2. **Part 2** — build views, `mrmr space apply --strict`, link space, mint agent grant
3. **Part 3** — run the loop in Desktop; optional **§B** documents agent-owned orchestration with `murrmure_wait_for_gate`

## What you will build

| Piece | Role |
|-------|------|
| **`preview-review` flow** | `flow.manifest.yaml` — intake → build → review loop |
| **Custom views** | `preview-review-intake` + `preview-review` in `murrmure/views/` |
| **Indexed actions** | `run_preview_agent`, `mark_validated` in `murrmure/actions.yaml` |
| **One linked space** | `mrmr space link` + `mrmr space apply` |
| **Agent grant** | MCP token with `flow:run` for build steps |

## Checkpoints vs runs (v2 vocabulary)

| Term | Meaning |
|------|---------|
| **Session** (`ses_…`) | Human-visible correlation container (title, journal, Desktop route) |
| **Run** (`run_…`) | One execution of the flow graph; pauses at **checkpoint** steps |
| **Checkpoint** | Run status `input-required`; resolve with `{ disposition: "continue" \| "cancel", output }` |
| **ViewCanvasHost** | Shell embeds `view_ref` in the primary region — your React UI, not built-in gate forms |

## Pages in this tutorial

1. [Part 1 — Scaffold `preview-review`](./01-scaffold-flow)
2. [Part 2 — Apply and connect](./02-install-and-connect)
3. [Part 3 — Run the feedback loop](./03-run-feedback-loop) (includes **§B** agent-owned loop)

## Prerequisites

- Node.js 20+
- Murrmure Desktop running locally (see [Desktop guide](../../desktop))
- `@murrmure/cli` — `npm install -g @murrmure/cli`
- Completed [Quick start](../../quick-start) or empty folder with `mrmr setup`

## Next

[Part 1 — Scaffold `preview-review` →](./01-scaffold-flow)
