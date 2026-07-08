# Review workflow (v2.2 step contracts)

Canonical human/agent preview review on **indexed flows** — example: [`preview-review-v2`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/preview-review-v2).

Normative spec: [reference workflow spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/plans/product/plan/06-reference-workflow-preview-review.md).

## Overview

```text
intake → write_spec → build (build-loop ⇄ build.review) → archive → commit
```

Humans work in **ViewCanvasHost** at human steps (`presentation.view`). Shell chrome is **operator/admin mode**.

## Setup

```bash
cd examples/flows/preview-review-v2/murrmure/views/preview-review-intake && npm install && npm run build
cd ../preview-review && npm install && npm run build
cd ../../..
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply --strict
mrmr grant mint --space spc_ui_sandbox --capabilities flow:run,flow:read,step:resolve,action:invoke,space:read
```

## Engine-routed nested build

1. Desktop **Run** on **preview-review**
2. Intake view — attach spec file
3. **`feature_build`** shell spawn (one session)
4. Agent resolves **`build.build-loop`** with `preview_url`
5. Engine opens **`build.review`** — human validates or sends feedback
6. Feedback → engine reopens **`build.build-loop`** in same agent session

## Session and run ids

| Id | Role |
|----|------|
| `ses_…` | Session — journal, notifications, Desktop title |
| `run_…` | Single flow execution; pauses at human steps |
| Resolve wire | `{ branch, payload, artifacts_out? }` via **`murrmure_resolve_step`** |

## Agent tools (platform MCP)

| Step | Tool |
|------|------|
| Complete agent step | `murrmure_resolve_step` |
| Wait for human / run advance | `murrmure_wait_for_run` |
| Read contract | `active-step-contract.json` or `murrmure_list_step_contracts` |

## Tutorial

Full walkthrough: [Tutorial 1 — Local preview review](./tutorials/01-local-preview-review/).

## Related

- [View SDK](../reference/view-sdk)
- [MCP tools](../reference/mcp-tools)
