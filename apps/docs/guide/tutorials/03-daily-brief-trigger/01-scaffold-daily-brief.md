# Part 1 — Initialize and write the flow

Create the space, remove the placeholder flow, and author the `daily-brief` manifest and actions.

## 1) Initialize space

```bash
mkdir -p ~/work/daily-brief && cd ~/work/daily-brief
mrmr space init
rm -rf murrmure/flows/example
mkdir -p murrmure/flows/daily-brief
```

Edit `murrmure/space.yaml`:

```yaml
slug: daily-brief
```

## 2) Flow manifest

Create `murrmure/flows/daily-brief/flow.manifest.yaml`:

```yaml
apiVersion: murrmure.flow/v1
name: daily-brief
description: Daily brief trigger + review loop

triggers:
  manual: true

start:
  manual: true

steps:
  - id: trigger
    checkpoint:
      view: daily-brief
      on_resolve:
        default: { goto: agent }
        cancel: { fail: true }

  - id: agent
    invoke:
      space: "{{origin_space}}"
      action: mcp_wake
      params:
        wake_label: handle_brief_requested

  - id: review
    checkpoint:
      view: daily-brief
      on_resolve:
        default: { goto: done }
        cancel: { fail: true }

  - id: done
    invoke:
      space: "{{origin_space}}"
      action: submit_brief_output
```

| Step | Purpose |
|------|---------|
| **trigger** | Human clicks button in view — resolve emits `brief.requested` |
| **agent** | Invokes wake action so MCP agent starts gathering |
| **review** | Human reads formatted output in same view |
| **done** | Agent (or stub action) records final output |

The same view id (`daily-brief`) serves both checkpoints — use `useViewContext()` to distinguish trigger vs review (different step id in context).

## 3) Executors

`murrmure/executors.yaml`:

```yaml
executors:
  shell:
    binding:
      type: shell_spawn
      executor_id: shell
```

## 4) Actions

`murrmure/actions.yaml`:

```yaml
version: 1
actions:
  mcp_wake:
    executor: shell
    command: node -e "console.log(JSON.stringify({ wake: 'handle_brief_requested' }))"
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000

  submit_brief_output:
    executor: shell
    command: echo '{"format":"markdown","body":"# Daily brief\n\n(stub)"}'
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000
```

Replace stubs with a real script that writes agent-produced markdown. The agent typically invokes `submit_brief_output` via MCP with `{ format, body }` params before **review** opens.

## Checkpoint

- [ ] Manifest has four steps; both checkpoints reference view `daily-brief`
- [ ] Actions defined for wake + output submit

## Next

[Part 2 — Build view, hooks, apply →](./02-push-and-trigger)
