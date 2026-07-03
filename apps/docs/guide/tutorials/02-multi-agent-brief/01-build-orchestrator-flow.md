# Part 1 — Build orchestrator `team-brief`

Scaffold the orchestrator space with an indexed flow and hooks.

## 1) Initialize orchestrator space

```bash
mkdir -p ~/work/orchestrator && cd ~/work/orchestrator
mrmr space init
mrmr space flow init team-brief --template hello-invoke
```

Or clone [`examples/flows/team-brief-v2/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/team-brief-v2) and customize.

## 2) Extend the manifest

Replace the hello-only graph with orchestrator steps (see example tree):

```yaml
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

Human **Publish** in Desktop resolves the `publish` checkpoint and emits `brief.published` for hooks.

## 3) Add hooks

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

## 4) Index actions

Define `team_brief_open`, `mcp_wake`, and any patch actions in `murrmure/actions.yaml` with `shell_spawn` executors (see example tree).

## Next

[Part 2 — Admin setup →](./02-admin-setup)
