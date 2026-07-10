# Part 1 — Build orchestrator flow

Initialize the orchestrator space and write the `team-brief` flow manifest and handlers by hand.

## 1) Initialize orchestrator space

```bash
mkdir -p ~/work/orchestrator && cd ~/work/orchestrator
mrmr space init
rm -rf .mrmr/flows/example
mkdir -p .mrmr/flows/team-brief
```

Edit `.mrmr/space/space.yaml`:

```yaml
slug: orchestrator
```

See [Tutorial 1 — Setup wizard](../01-local-preview-review/02-setup-wizard) if you need a refresher on `.mrmr/` layout.

## 2) Flow manifest

Create `.mrmr/flows/team-brief/flow.manifest.yaml`:

```yaml
apiVersion: murrmure.flow/v1
name: team-brief
description: Multi-agent brief orchestrator

triggers:
  manual: true

start:
  manual: true

steps:
  - id: open
    description: Orchestrator initializes brief state.
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: publish
      failed:
        schema: { type: object }
        next: null
        fail_run: true

  - id: publish
    description: Human publishes — hub emits brief.published.
    presentation:
      assignees: ["human:*"]
    branches:
      published:
        schema: { type: object }
        next: done
      cancel:
        schema: { type: object }
        next: null
        fail_run: true

  - id: done
    description: Orchestrator signals publish complete.
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
| **open** | agent | Handler initializes brief state |
| **publish** | human | Any human in space resolves via operator chrome |
| **done** | agent | Handler completes orchestrator side after publish |

The **publish** step uses built-in human assignee (`human:*`). A custom publish view can replace operator chrome later; the coordination pattern is what matters here.

## 3) Handlers

`.mrmr/space/handlers.yaml`:

```yaml
version: 1

handlers:
  - id: team-brief-open
    contract_keys: [team-brief.open]
    on: step.opened
    type: shell_spawn
    complete: explicit
    command: echo '{"brief_id":"brf_local"}'
    prompt: |
      Initialize brief (stub). Then:
      `murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "open", branch: "completed" })`
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000

  - id: team-brief-done
    contract_keys: [team-brief.done]
    on: step.opened
    type: shell_spawn
    complete: explicit
    command: echo '{"done":true}'
    prompt: |
      Signal publish complete (stub). Then:
      `murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "done", branch: "completed" })`
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000

  - id: brief-published-wake
    contract_keys: []
    on:
      event:
        type: brief.published
    type: shell_spawn
    complete: auto
    command: echo '{"wake":"handle_brief_published"}'
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000
```

**Handlers are indexed on apply.** When a human resolves **publish**, the hub emits `brief.published`. The event handler runs `shell_spawn`, delivering wake `handle_brief_published` to agents listening on dev space.

Contract keys follow `{flow_ref}.{step_id}` — here `team-brief.open` and `team-brief.done`. Event handlers use `contract_keys: []`.

Replace echo stubs with real scripts as you harden the workflow.

## 4) Do not apply yet

Knowledge and dev spaces need grants before cross-space wakes work reliably. Part 2 links all three spaces.

## Checkpoint

- [ ] `team-brief` manifest with open → publish → done (step contracts only)
- [ ] `handlers.yaml` covers agent steps and `brief.published` event
- [ ] No `executor.action`, `invoke:`, or `gate:` in manifest

## Next

[Part 2 — Admin setup →](./02-admin-setup)
