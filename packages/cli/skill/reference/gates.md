# Gates & checkpoints

Murrmure v2 uses **checkpoint steps** — not a separate gate authoring model. A checkpoint creates a pending gate and pauses the run until resolved.

## Manifest

```yaml
steps:
  - id: review
    checkpoint:
      view: preview-review
      assignees: ["{{input.reviewer}}"]
      payload_ref: "{{steps.build.output.artifact_ref}}"
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
        default: { goto: done }
        cancel: { fail: true }
```

Apply lint requires explicit `default` and `cancel` on every checkpoint `on_resolve`.

## Resolve wire (v2)

```json
{
  "disposition": "continue",
  "output": { "outcome": "validated", "comments": "LGTM" }
}
```

| disposition | Meaning |
|-------------|---------|
| `continue` | Advance per `on_resolve` routing |
| `cancel` | Fail run (or route via `cancel: { fail: true }`) |

**Request changes** = `disposition: "continue"` with `output.outcome: changes_required` — not cancel.

Legacy HTTP accepts `decision` + `form_values`; hub maps to v2 wire at the boundary.

First checkpoint (step index 0) shallow-merges `output` into `exec_context.input` unless `merge_input: false`.

## Human path

1. Engine pauses at checkpoint → run status `input-required`
2. Shell mounts **ViewCanvasHost** with view bundle (full primary canvas)
3. View calls `submit(params)` → shell maps to `{ disposition, output }` → resolve API
4. `on_resolve` evaluates `when` / `values` / `default` / `cancel` → next step

Built-in `GateResolvePanel` is fallback when view bundle is missing — admin/debug only.

## Agent path

```
murrmure_wait_for_gate   # long-poll pending gate on run_id
murrmure_resolve_gate    # POST /v1/gates/{id}/resolve
```

Requires `gate:resolve` capability for resolve; `space:read` for wait.

## MCP orchestration validate gate

`murrmure_attach_orchestration` creates gate type `orchestration.validate` — human approves ephemeral graph before bind. See [orchestration-attach.md](orchestration-attach.md).

See [views.md](views.md), [flow-authoring.md](flow-authoring.md), [mcp.md](mcp.md).
