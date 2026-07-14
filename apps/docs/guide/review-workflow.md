# Review workflow (v2.2 step contracts)

Canonical human/agent preview review on **indexed flows**. Walkthrough: [Tutorial 1b — Local preview review](./tutorials/01-local-preview-review/).

Normative spec: [reference workflow spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/plans/product/plan/06-reference-workflow-preview-review.md).

## Overview

```text
intake → write_spec → build (build-loop ⇄ build.review) → archive → commit
```

Humans work in **ViewCanvasHost** at human steps (`presentation.view`). Shell chrome is **operator/admin mode**.

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

## Engine-routed nested build

1. Desktop **Run** on **preview-review**
2. Intake view — attach spec file
3. **`feature_build`** handler dispatches shell spawn (one session; the subprocess stays alive until the parent **build** step resolves — runtime-owned, no authored `kill_on`)
4. Agent resolves **`build.build-loop`** with `preview_url` via **`murrmure_resolve_step`**
5. Engine opens **`build.review`** — human validates or sends feedback
6. Feedback → engine reopens **`build.build-loop`** in same agent session

## Session and run ids

| Id | Role |
|----|------|
| `ses_…` | Session — journal, notifications, Desktop title |
| `run_…` | Single flow execution; pauses at human steps |
| Resolve wire | `{ branch, payload, artifacts_out? }` via **`murrmure_resolve_step`** or **`mrmr step resolve`** |

## Agent tools (platform MCP)

| Step | Tool |
|------|------|
| Complete agent step | `murrmure_resolve_step` |
| Wait for human / run advance | `murrmure_wait_for_run` |
| Read contract | `active-step-contract.json` or `murrmure_list_step_contracts` |
| List handlers | `murrmure_list_handlers` |

## Tutorial

Full walkthrough: [Tutorial 1 — Local preview review](./tutorials/01-local-preview-review/).

## Related

- [Space handlers](./space-handlers)
- [View SDK](../reference/view-sdk)
- [MCP tools](../reference/mcp-tools)
