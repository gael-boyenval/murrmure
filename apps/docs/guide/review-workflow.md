# Review workflow (v3 step contracts)

Canonical human/agent preview review on **indexed flows**. Walkthrough: [Tutorial 1b — Local preview review](./tutorials/01-local-preview-review/).

Normative spec: [reference workflow spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/plans/product/plan/06-reference-workflow-preview-review.md).

## Overview

```text
intake → write_spec → build (build-loop ⇄ build.review) → archive → commit
```

Humans work in a space-bound `view_resolver` through **ViewCanvasHost**.

## Setup

```bash
cd .mrmr/views/preview-review-intake && npm install && npm run build
cd ../preview-review && npm install && npm run build
cd ../..
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply --strict
mrmr connection create --space spc_ui_sandbox
```

Handlers in `.mrmr/space/handlers.yaml` own agent steps (`feature_write_spec`, `feature_build`, …) via **`on::key`** (`contract_keys` is prompt-scope only).

## Parent-owned nested build

1. Desktop **Run** on **preview-review**
2. Intake view — attach spec file
3. Parent `build` opens `build.build-loop` with
   **`murrmure_open_child_step`** and yields.
4. The child resolves with `preview_url`; a fresh parent assignment receives
   `returned_child`.
5. Parent opens `build.review` and yields to the human View.
6. Feedback resumes the parent for another build iteration; validation resumes
   it for parent resolution.

## Session and run ids

| Id | Role |
|----|------|
| `ses_…` | Session — journal, notifications, Desktop title |
| `run_…` | Single flow execution; pauses at human steps |
| Resolve wire | `{ branch, payload, artifacts_out? }` via **`murrmure_resolve_step`** or **`mrmr step resolve`** |

## Agent tools (platform MCP)

| Step | Tool |
|------|------|
| Open one declared child | `murrmure_open_child_step` |
| Complete agent step | `murrmure_resolve_step` |
| Read contract | `active-step-contract.json` or `murrmure_list_step_contracts` |
| List handlers | `murrmure_list_handlers` |

## Tutorial

Full walkthrough: [Tutorial 1 — Local preview review](./tutorials/01-local-preview-review/).

## Related

- [Space handlers](./space-handlers)
- [View SDK](../reference/view-sdk)
- [MCP tools](../reference/mcp-tools)
