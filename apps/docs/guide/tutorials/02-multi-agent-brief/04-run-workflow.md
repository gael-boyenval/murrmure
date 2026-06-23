# Part 4 — Run the full workflow

This page is the exact runbook: prompt text, MCP order, and pending/resolved checkpoints.

## 0. Preflight

Before starting:

1. `team-brief` is `live` in `spc_orchestrator`.
2. Trigger exists in `spc_dev` for event `brief.published`.
3. All three Cursor windows are connected (Part 3).

## 1. Orchestrator opens and drafts the brief

Folder: `~/work/orchestrator/`

Prompt:

> Create a brief titled "Guest checkout v1". Add sections for goals, constraints, and open questions. When first draft is ready, move the instance to draft.

Expected MCP sequence:

1. `open_brief` (create instance)
2. `patch_section` (goals)
3. `patch_section` (constraints)
4. `patch_section` (open-questions)
5. `transition` with event `context_ready`

Expected state movement:

- `gathering` (pending) -> `draft` (resolved for drafting phase)

## 2. Knowledge contributes answers (one-line local work)

Folder: `~/work/knowledge-base/`

Prompt:

> Search docs/ADRs for payment and policy constraints for guest checkout, then reply with concise bullets for the orchestrator brief.

Knowledge local work (one line): searches docs, returns concise bullets.

Back in orchestrator window:

1. `patch_section` to merge knowledge findings into constraints/open-questions.

## 3. Dev contributes answers (one-line local work)

Folder: `~/work/dev-project/`

Prompt:

> Search codebase for current checkout/auth behavior and key files, then return concise facts for the orchestrator brief.

Dev local work (one line): searches code paths, returns concise facts.

Back in orchestrator window:

1. `patch_section` to merge dev findings into implementation notes.

## 4. Orchestrator requests human publish and waits

Folder: `~/work/orchestrator/`

Prompt:

> Move this brief to pending publish and wait for me to publish in Runtime.

Expected MCP sequence:

1. `transition` with event `request_publish`
2. `wait_for_publish` with `brief_key`

Expected wait behavior:

- Before human publish: `wait_for_publish` returns `{ "status": "pending" }`
- After human publish: same wait resolves with `{ "status": "resolved", ... }`

State at this point:

- Instance state is `pending_publish` (pending on human action).

## 5. Human clicks Publish in Runtime

Browser clicks:

1. `Runtime -> Orchestrator -> Instances`
2. Open the `Guest checkout v1` brief
3. Verify state badge is `pending_publish`
4. Click `Publish`

Expected results:

1. Instance transitions to `published`
2. Journal emits `brief.published` (spec.published-style contract event)
3. Orchestrator `wait_for_publish` resolves

## 6. Trigger dispatches `mcp_wake` to dev space

Open delivery status:

1. `Configure -> Dev -> Triggers -> Delivery log`
2. Find latest row for `brief.published`

Delivery progression:

- `pending`: accepted but still dispatching
- `failed`: dispatch failed (session/policy/harness issue)
- `resolved` (or `delivered`): wake accepted by dev session

Successful wake details include:

- action type `mcp_wake`
- `wake_label: handle_brief_published`
- payload fields from map (`brief_key`, `title`, `version`, `summary`, `source_space_id`)

## 7. Dev handles wake and fetches summary with `query_ask`

Folder: `~/work/dev-project/`

Prompt:

> Handle the wake payload for handle_brief_published. Call query_ask on the orchestrator space with query_type brief_summary@1 and the brief_key. Then write specs/guest-checkout-v1.md locally.

Expected MCP sequence:

1. `query_ask` with:
   - `target_space_id: "spc_orchestrator"`
   - `query_type: "brief_summary@1"`
   - `params: { "brief_key": "ins_..." }`
2. Receive summary JSON (resolved cross-space read)
3. Dev writes local markdown file (outside Studio control plane)

## Pending vs resolved timeline

| Stage | Pending | Resolved |
|------|---------|----------|
| Draft authoring | Instance in `gathering`/`draft` | Transition `context_ready` completed |
| Publish gate | Instance in `pending_publish` | Human clicked Publish |
| Wait API | `wait_for_publish` status `pending` | `wait_for_publish` status `resolved` |
| Trigger | Delivery row `pending` | Delivery row `resolved` (or `delivered`) |
| Dev fetch | `query_ask` in flight | Summary response returned |

## Next

[Troubleshooting →](./05-troubleshooting)
