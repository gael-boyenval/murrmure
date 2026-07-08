# Gates & human steps (v2.2)

Flow human checkpoints use **step contracts** — not legacy `checkpoint:` blocks or gate MCP tools.

## Manifest (human step)

```yaml
steps:
  - id: build
    orchestration: engine-routed
    executor: { action: feature_build, params: { … } }
    steps:
      - id: build-loop
        branches:
          completed: { schema: { … }, goto: review }
      - id: review
        presentation:
          view: preview-review
          assignees: ["{{input.reviewer}}"]
        branches:
          validated: { schema: { type: object }, complete: parent }
          changes_required:
            schema: { type: object, properties: { comments: { type: array } } }
            continue: parent
            goto: build-loop
          cancel: { schema: { type: object }, fail: true }
```

## Resolve wire (v2.2)

Agents and views complete steps via **`murrmure_resolve_step`**:

```json
{
  "branch": "validated",
  "payload": {}
}
```

Human views call `submit(params, artifacts?)` → same resolve handler.

## Human path

1. Engine opens step → run status `input-required` when `presentation.view` is set
2. Shell mounts **ViewCanvasHost** with view bundle (full primary canvas)
3. View calls `submit(params)` → `POST /v1/runs/{id}/steps/{step_id}/resolve`
4. Manifest `branches` routes advance the run

Built-in gate forms are fallback when view bundle is missing — admin/debug only.

## Agent path

```
murrmure_resolve_step   # complete owned agent/human-resolvable steps
murrmure_wait_for_run   # long-poll until run advances or terminal
```

Requires `step:resolve` for resolve; `space:read` for wait.

Re-read **`active-step-contract.json`** after transitions in long shell sessions.

## Orchestration validate gate (operator)

`murrmure_attach_orchestration` creates gate type `orchestration.validate` — human approves ephemeral graph before bind via HTTP gate resolve (operator shell). See [orchestration-attach.md](orchestration-attach.md).

See [views.md](views.md), [flows.md](flows.md), [mcp.md](mcp.md).
