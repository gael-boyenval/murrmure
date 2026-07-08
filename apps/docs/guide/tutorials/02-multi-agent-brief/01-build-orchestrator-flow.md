# Part 1 — Build orchestrator flow

Initialize the orchestrator space and write the `team-brief` flow, actions, executors, and hooks by hand.

## 1) Initialize orchestrator space

```bash
mkdir -p ~/work/orchestrator && cd ~/work/orchestrator
mrmr space init
rm -rf murrmure/flows/example
mkdir -p murrmure/flows/team-brief
```

Edit `murrmure/space.yaml`:

```yaml
slug: orchestrator
```

See [Tutorial 1 — Setup wizard](../01-local-preview-review/02-setup-wizard) if you need a refresher on `murrmure/` layout.

## 2) Flow manifest

Create `murrmure/flows/team-brief/flow.manifest.yaml`:

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
    invoke:
      space: "{{origin_space}}"
      action: team_brief_open

  - id: publish
    gate:
      assignees: ["human:*"]

  - id: done
    invoke:
      space: "{{origin_space}}"
      action: mcp_wake
      params:
        wake_label: handle_brief_published
```

| Step | Kind | Purpose |
|------|------|---------|
| **open** | `invoke` | Agent/orchestrator initializes brief state |
| **publish** | `gate` | Human publishes in Desktop — emits hub events when resolved |
| **done** | `invoke` | Signals wake label after publish (hook also fires on event) |

The **publish** step uses a built-in gate assignee (`human:*`) — any human in the space can resolve. A custom publish view can replace this in a later iteration; the coordination pattern is what matters here.

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
  team_brief_open:
    executor: shell
    command: echo '{"brief_id":"brf_local"}'
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000

  mcp_wake:
    executor: shell
    command: node -e "console.log(JSON.stringify({ wake: process.env.MURRMURE_INVOKE_PARAMS }))"
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000
```

Replace the echo stubs with real scripts as you harden the workflow. For the tutorial, they prove invoke wiring and journal output.

Orchestrator agents also use MCP patch actions (defined separately or via skill) to edit brief sections between **open** and **publish**.

## 5) Hooks — wake dev agent on publish

`murrmure/hooks.yaml`:

```yaml
version: 1
hooks:
  brief_published_wake:
    on:
      event:
        type: brief.published
    do:
      - invoke:
          action: mcp_wake
          params:
            wake_label: handle_brief_published
```

**Hooks are indexed on apply.** When a human resolves **publish**, the hub emits `brief.published`. The hook invokes `mcp_wake`, which delivers a wake to agents listening for `handle_brief_published` on spaces configured to receive it.

Hooks replace old “trigger register CLI” patterns — everything lives in `murrmure/` and ships with `mrmr space apply`.

## 6) Do not apply yet

Knowledge and dev spaces need grants before cross-space wakes work reliably. Part 2 links all three spaces.

## Checkpoint

- [ ] `team-brief` manifest with open → publish → done
- [ ] `actions.yaml` defines `team_brief_open` and `mcp_wake`
- [ ] `hooks.yaml` maps `brief.published` → `mcp_wake`

## Next

[Part 2 — Admin setup →](./02-admin-setup)
