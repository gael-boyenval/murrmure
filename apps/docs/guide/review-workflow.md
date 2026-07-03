# Review workflow (v2 indexed)

Canonical human/agent preview review on **indexed flows** — example: [`preview-review-v2`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/preview-review-v2).

Normative spec: [reference workflow spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/plans/product/plan/06-reference-workflow-preview-review.md).

## Overview

```text
intake checkpoint → build → review checkpoint ⇄ build → done
```

Humans work in **ViewCanvasHost** (custom views at checkpoint steps). Shell chrome is **operator/admin mode**.

## Setup

```bash
cd examples/flows/preview-review-v2/murrmure/views/preview-review-intake && npm install && npm run build
cd ../preview-review && npm install && npm run build
cd ../../..
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply --strict
mrmr grant mint --space spc_ui_sandbox --capabilities flow:run,flow:read
```

## Pattern A — Flow-owned loop

1. Desktop **Run** on **preview-review**
2. Intake view in **ViewCanvasHost** — reviewer + preview URL
3. Build invoke runs `run_preview_agent`
4. Review view — human validates or requests changes
5. `on_resolve` branches: `changes_required` → build; `validated` → done

## Pattern B — Agent-owned loop

Same manifest; agent uses **`murrmure_wait_for_gate`** / **`murrmure_wait_for_run`** between rounds while human uses **ViewCanvasHost**.

## Session and run ids

| Id | Role |
|----|------|
| `ses_…` | Session — journal, notifications, Desktop title |
| `run_…` | Single flow execution; pauses at checkpoints |
| Resolve wire | `{ disposition: "continue" \| "cancel", output: { … } }` |

## Agent tools (platform MCP)

| Step | Tool |
|------|------|
| Invoke build | `murrmure_invoke_action` |
| Wait for human | `murrmure_wait_for_gate` or `murrmure_wait_for_run` |
| Resolve (imperative gates) | `murrmure_resolve_gate` |

## Tutorial

Full walkthrough: [Tutorial 1 — Local preview review](./tutorials/01-local-preview-review/).

## Related

- [View SDK](../reference/view-sdk)
- [Shell routes](./shell-routes) — ViewCanvasHost vs admin chrome
- [Troubleshooting](./troubleshooting)
