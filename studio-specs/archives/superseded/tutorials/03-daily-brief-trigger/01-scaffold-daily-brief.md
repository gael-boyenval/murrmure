# Part 1 — Initialize and write the flow

Create the space, remove the placeholder flow, and author the `daily-brief` manifest and handlers.

## 1) Initialize space

```bash
mkdir -p ~/work/daily-brief && cd ~/work/daily-brief
mrmr space init
rm -rf .mrmr/flows/example
mkdir -p .mrmr/flows/daily-brief
```

Edit `.mrmr/space/space.yaml`:

```yaml
slug: daily-brief
```

## 2) Flow manifest

Create `.mrmr/flows/daily-brief/flow.manifest.yaml`:

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
    description: Human clicks Run daily brief in view.
    presentation:
      view: daily-brief
    branches:
      continue:
        schema: { type: object }
        next: agent
      cancel:
        schema: { type: object }
        next: null
        fail_run: true

  - id: agent
    description: Agent gathers data after brief.requested wake.
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: review
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: review
    description: Human reviews agent output in same view.
    presentation:
      view: daily-brief
    branches:
      approved:
        schema: { type: object }
        next: done
      cancel:
        schema: { type: object }
        next: null
        fail_run: true

  - id: done
    description: Record final brief output artifact.
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: null
      failed:
        schema: { type: object }
        next: null
        fail_run: true
```

| Step | Role | Purpose |
|------|------|---------|
| **trigger** | human | View submit resolves with `continue` — emits `brief.requested` |
| **agent** | agent | Handler wake + agent resolves when data gathered |
| **review** | human | Same view id; human approves output |
| **done** | agent | Handler records final output |

The same view id (`daily-brief`) serves both presentation steps — use `useViewContext()` to distinguish trigger vs review (different step id in context).

## 3) Handlers (stubs)

`.mrmr/space/handlers.yaml`:

```yaml
version: 1

handlers:
  - id: daily-brief-agent
    on: step.opened::daily-brief.agent
    type: shell_spawn
    complete: explicit
    command: echo '{"wake":"handle_brief_requested"}'
    prompt: |
      Wake handle_brief_requested (stub). Gather data, then:
      `murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "agent", branch: "completed" })`
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000

  - id: daily-brief-done
    on: step.opened::daily-brief.done
    type: shell_spawn
    complete: explicit
    command: echo '{"format":"markdown","body":"# Daily brief\\n\\n(stub)"}'
    prompt: |
      Record output (stub). Then:
      `murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "done", branch: "completed" })`
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000

  - id: brief-requested-wake
    contract_keys: []
    on:
      event:
        type: brief.requested
    type: shell_spawn
    complete: auto
    command: echo '{"wake":"handle_brief_requested"}'
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000
```

Replace stubs with real agent commands as you harden the workflow.

## Checkpoint

- [ ] Manifest has four steps; trigger and review reference view `daily-brief`
- [ ] Handlers cover agent steps and `brief.requested` event
- [ ] No `checkpoint:`, `invoke:`, or `executor.action` in manifest

## Next

[Part 2 — Build view, handlers, apply →](./02-push-and-trigger)
