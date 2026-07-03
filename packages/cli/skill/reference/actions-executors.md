# Actions & executors

Actions are **named callables** indexed from `murrmure/actions.yaml`. Each action references an executor that defines how the hub reaches the work.

## actions.yaml

```yaml
version: 1
actions:
  run_preview_agent:
    executor: shell
    command: node murrmure/scripts/preview-review-build.mjs
    timeout_ms: 600_000
    response_schema: murrmure.schemas/preview.v1.json

  cursor_review:
    executor: cursor-mcp
    timeout_ms: 600_000
```

Hub responsibilities: index names, validate params as opaque JSON, enforce timeout/idempotency, journal lifecycle. Hub **never** interprets business meaning of params.

## executors.yaml

```yaml
version: 1
executors:
  shell:
    type: shell_spawn

  cursor-mcp:
    type: mcp_session
    required_scopes: [space:enter, action:invoke]
```

| Type | Semantics | Reachability |
|------|-----------|--------------|
| `shell_spawn` | One-shot command in linked space root | Process lifecycle |
| `mcp_session` | Long-lived MCP with grants | Last heartbeat |
| `queue_poll` | External worker polls task offers | Poll timestamp within TTL |
| `remote_hub` | Federation relay to peer hub | Remote health + ack |

## Invoke from flows

```yaml
steps:
  - id: build
    invoke:
      space: "{{origin_space}}"
      action: run_preview_agent
      params:
        preview_url: "{{input.preview_url}}"
        feedback: "{{steps.review.output.comments}}"
```

Templates like `{{steps.id.output.field}}` resolve after the referenced step completes.

## Headless invoke (agents)

```
murrmure_invoke_action
  action: run_preview_agent
  session_id: ses_…
  run_id: run_…
  step_id: action:run_preview_agent
  params: { … }
```

## shell_spawn environment

Injected on every dispatch:

| Variable | Content |
|----------|---------|
| `MURRMURE_ACTION` | Action name |
| `MURRMURE_SPACE_ID` | Space id |
| `MURRMURE_RUN_ID` | Run id |
| `MURRMURE_SESSION_ID` | Session id |
| `MURRMURE_STEP_ID` | Step id |
| `MURRMURE_INVOKE_PARAMS` | JSON resolved params |
| `MURRMURE_INPUT` | JSON `exec_context.input` |

Preflight fails with `EXECUTOR_UNAVAILABLE` when the executor is unreachable.

See [space-directory.md](space-directory.md), [mcp.md](mcp.md).
