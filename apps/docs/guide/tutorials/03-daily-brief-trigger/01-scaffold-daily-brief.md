# Part 1 — Scaffold `daily-brief`

```bash
mkdir -p ~/work/daily-brief && cd ~/work/daily-brief
mrmr space init
mrmr space flow init daily-brief --template hello-gate
mrmr space view init daily-brief
```

Or clone [`examples/flows/daily-brief-v2/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/daily-brief-v2/).

## Manifest shape

Replace hello-gate steps with trigger → agent → review:

```yaml
steps:
  - id: trigger
    checkpoint:
      view: daily-brief
      on_resolve:
        default: { goto: agent }
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
  - id: done
    invoke:
      space: "{{origin_space}}"
      action: submit_brief_output
```

## View (ViewCanvasHost)

Use `@murrmure/view-sdk/app` — `useViewSubmit()` for **Run daily brief** button. See example `App.tsx`.

```bash
mrmr view dev daily-brief
```

## Next

[Part 2 — Apply and register hooks →](./02-push-and-trigger)
