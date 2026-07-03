# Flows tutorial — author a complete v2 workflow

Author an indexed flow from scratch in `murrmure/` — manifest, actions, optional views, hooks — then index with **`mrmr space apply`**.

**Example tree:** [`examples/flows/hello-authoring/`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/hello-authoring)

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

## Part 1 — Scaffold

```bash
mkdir -p ~/work/my-flow && cd ~/work/my-flow
mrmr space init
mrmr space flow init hello --template hello-invoke   # or hello-gate for checkpoints
```

Templates live in `@murrmure/cli` — see [Creating flows](./creating-flows).

## Part 2 — Flow manifest

```yaml
apiVersion: murrmure.flow/v1
name: hello
description: Single invoke step

triggers:
  manual: true

steps:
  - id: hello
    invoke:
      space: "{{origin_space}}"
      action: hello_hello
```

Step kinds: `invoke`, `checkpoint`, `start_flow` (see skill `flow-authoring.md`).

## Part 3 — Actions + executors

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

`murrmure/executors.yaml` binds `shell` → `shell_spawn`.

Scripts receive `MURRMURE_INPUT`, `MURRMURE_INVOKE_PARAMS`, run/session/step ids — see [Environment](../reference/environment).

## Part 4 — Optional checkpoint views

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

## Part 5 — Hooks (optional)

`murrmure/hooks.yaml` maps events → indexed actions. Re-apply after edits:

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
mrmr grant mint --space spc_ui_sandbox --capabilities flow:run,flow:read
mrmr skill install    # optional — installs murrmure agent skill
```

Agents use platform MCP tools (`murrmure_invoke_action`, gate/run waits) — see [Agents MCP](./agents-mcp).

## CLI reference

| Command | Purpose |
|---------|---------|
| `mrmr space init` | Create `murrmure/` root |
| `mrmr space flow init <id> --template hello-gate\|hello-invoke` | Scaffold flow + views/scripts |
| `mrmr space view init <id>` | Scaffold Vite+React view |
| `mrmr space apply [--strict]` | Index flows/actions/views/hooks |
| `mrmr view dev <id>` | Desktop dev route + fixtures |
| `mrmr flow run <flow_id>` | Start run from CLI |
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
| Checkpoint shows shell form | Missing view dist or wrong `view_ref` |

See [Known gaps](./known-gaps) and [Troubleshooting](./troubleshooting).
