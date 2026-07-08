# Flows tutorial — author a complete v2 workflow

Author an indexed flow from scratch in `murrmure/` — manifest, actions, optional views, hooks — then index with **`mrmr space apply`**.

For a guided first build, start with [Tutorial 1](./tutorials/01-local-preview-review/). This page is the field reference.

**Worked example in repo:** [`examples/flows/hello-authoring/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/hello-authoring) — compare after you write your own files.

## Who this is for

**Authors** defining workflows in **their own repo** with `@murrmure/cli`.

**Human UX north star:** checkpoint steps with `view_ref` render in **ViewCanvasHost** (full primary-region custom UI). Shell chrome is **operator/admin mode**.

## Space directory layout

```text
murrmure/
  space.yaml
  actions.yaml
  executors.yaml
  hooks.yaml
  flows/{name}/flow.manifest.yaml
  views/{id}/              # optional — checkpoint UI
  scripts/{name}-*.mjs     # optional — shell_spawn targets
```

| File | Role |
|------|------|
| `space.yaml` | Slug hint for `mrmr space link` |
| `actions.yaml` | Named invoke targets |
| `executors.yaml` | Runtime bindings (`shell_spawn`, …) |
| `hooks.yaml` | Event → action map (indexed on apply) |
| `flows/*/flow.manifest.yaml` | Step graph |
| `views/*/` | React checkpoint UI |
| `scripts/` | Node/shell commands for actions |

## Part 1 — Initialize

```bash
mkdir -p ~/work/my-flow && cd ~/work/my-flow
mrmr space init
rm -rf murrmure/flows/example
mkdir -p murrmure/flows/hello murrmure/scripts
```

Do not skip understanding the layout — start [Tutorial 1](./tutorials/01-local-preview-review/).

## Part 2 — Flow manifest

Create `murrmure/flows/hello/flow.manifest.yaml`:

```yaml
apiVersion: murrmure.flow/v1
name: hello
description: Single invoke step

triggers:
  manual: true

start:
  manual: true

steps:
  - id: hello
    invoke:
      space: "{{origin_space}}"
      action: hello_hello
```

Step kinds: `invoke`, `checkpoint`, `gate`, `start_flow`.

Template expressions in manifest params use mustache syntax, for example:

```text
{{origin_space}}
{{input.preview_url}}
{{steps.review.output.comments}}
```

## Part 3 — Actions + executors

`murrmure/executors.yaml`:

```yaml
executors:
  shell:
    binding:
      type: shell_spawn
      executor_id: shell
```

`murrmure/actions.yaml`:

```yaml
version: 1
actions:
  hello_hello:
    executor: shell
    command: node murrmure/scripts/hello-hello.mjs
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000
```

`murrmure/scripts/hello-hello.mjs`:

```javascript
const input = JSON.parse(process.env.MURRMURE_INPUT ?? "{}");
process.stdout.write(JSON.stringify({ greeting: `Hello, ${input.name ?? "author"}!` }));
```

Scripts receive `MURRMURE_INPUT`, `MURRMURE_INVOKE_PARAMS`, run/session/step ids — see [Environment](../reference/environment).

## Part 4 — Checkpoint views

```bash
mrmr space view init my-view
cd murrmure/views/my-view && npm install
mrmr view dev my-view
npm run build
```

Views use `createViewMount` from `@murrmure/view-sdk/app` — see [View SDK](../reference/view-sdk).

Add a checkpoint step:

```yaml
- id: review
  checkpoint:
    view: my-view
    on_resolve:
      default: { goto: next }
      cancel: { fail: true }
```

`submit()` from the view resolves with `{ disposition: "continue", output: payload }`.

## Part 5 — Hooks

`murrmure/hooks.yaml`:

```yaml
version: 1
hooks:
  my_event_hook:
    on:
      event:
        type: my.event
    do:
      - invoke:
          action: my_action
```

Re-apply after edits:

```bash
mrmr space apply --strict
```

## Part 6 — Link, apply, run

```bash
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply --strict
mrmr space status
```

Desktop → **Run**, or:

```bash
mrmr flow run flw_flows_hello --space spc_ui_sandbox --input '{"name":"author"}'
```

## Part 7 — Agent grant

```bash
mrmr grant mint --space spc_ui_sandbox --capabilities flow:run,flow:read,action:invoke
mrmr skill install    # optional — installs murrmure agent skill
```

Agents use platform MCP tools (`murrmure_invoke_action`, gate/run waits) — see [Agents MCP](./agents-mcp).

| Trigger | Mechanism |
|---------|-----------|
| Human Run | Desktop space home |
| CLI | `mrmr flow run` |
| Agent | `murrmure_invoke_action`, flow step invoke |
| Event | `hooks.yaml` → action → optional `mcp_wake` |

## CLI reference

| Command | Purpose |
|---------|---------|
| `mrmr space init` | Create `murrmure/` root |
| `mrmr space view init <id>` | Scaffold Vite+React view package |
| `mrmr space apply [--strict]` | Index flows/actions/views/hooks |
| `mrmr view dev <id>` | Desktop dev route + fixtures |
| `mrmr flow run <flow_id>` | Start run from CLI |
| `mrmr grant mint` | Agent token |
| `mrmr setup` / `mrmr space onboard` | First-run wizards |

Full flag list: [CLI guide](./cli).

## Tutorials

| Track | Link |
|-------|------|
| Preview review loop | [Tutorial 1](./tutorials/01-local-preview-review/) |
| Multi-agent brief | [Tutorial 2](./tutorials/02-multi-agent-brief/) |
| Daily brief trigger | [Tutorial 3](./tutorials/03-daily-brief-trigger/) |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Strict apply fails on view | Build `dist/` in each referenced view |
| Unknown step kind | Only engine-supported kinds — run apply without `--strict` for warnings |
| Checkpoint shows shell form | Missing view dist or wrong view id in manifest |

See [Known gaps](./known-gaps) and [Troubleshooting](./troubleshooting).
