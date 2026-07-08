# Creating a flow

::: tip Start here
**New workflows** use a **`murrmure/`** directory indexed with **`mrmr space apply`**.

→ **[Tutorial 1 — Local preview review](./tutorials/01-local-preview-review/)** — build from `mrmr space init`, write manifest/actions/views by hand, run checkpoint loop in **ViewCanvasHost**.

→ **[Known gaps](./known-gaps)** — deferred product surface.
:::

This page is a short index. The full walkthrough lives in Tutorial 1.

---

## Authoring path (no shortcuts)

```bash
mkdir -p ~/work/my-flow && cd ~/work/my-flow
mrmr space init
# remove flows/example — write your own under flows/{name}/
# edit actions.yaml, executors.yaml, flow.manifest.yaml
mrmr space view init my-view    # if you need checkpoint UI
cd murrmure/views/my-view && npm install && npm run build
cd ../../..
mrmr space link --path . --create
mrmr space apply --strict
mrmr grant mint --space spc_… --capabilities flow:run,flow:read,action:invoke
```

See [Tutorial 1 — Create the repo](./tutorials/01-local-preview-review/01-create-the-repo) and [Flow manifest](./tutorials/01-local-preview-review/05-flow-manifest) for the full walkthrough.

## Step contracts (v2.2)

New flows use a **unified step shape** (`branches`, optional `executor`, optional `presentation`, optional nested `steps`) instead of separate `invoke:` / `checkpoint:` blocks.

- **Normative bridge:** [step-contract.md](https://github.com/murrmure/agentStudio/blob/main/studio-specs/current/bridges/step-contract.md) (monorepo `studio-specs/current/bridges/step-contract.md`)
- **Apply:** `mrmr space apply` compiles a **StepContractCatalog** and prints a digest; `--strict` rejects legacy manifests and unknown `{{murrmure.*}}` tokens.
- **Runtime:** step resolve API ships in VS-2; until then catalog compile is the VS-1 deliverable.

```yaml
# excerpt — see bridge for full nested preview-review manifest
steps:
  - id: intake
    presentation: { view: preview-review-intake }
    branches:
      continue: { schema: { type: object }, next: write_spec }
      cancel: { schema: { type: object }, next: null, fail_run: true }
```

## What you build (v2)

| Piece | Location |
|-------|----------|
| Flow manifest | `murrmure/flows/{name}/flow.manifest.yaml` |
| Actions | `murrmure/actions.yaml` |
| Executors | `murrmure/executors.yaml` |
| Build scripts | `murrmure/scripts/{name}-*.mjs` |
| Checkpoint views | `murrmure/views/{id}/` (Vite+React + `view.manifest.yaml`) |
| Hooks | `murrmure/hooks.yaml` |

Checkpoint steps with `view` open in **ViewCanvasHost** — see [View SDK](../reference/view-sdk).

## Related

- [Tutorial: local preview-review](./tutorials/01-local-preview-review/) — **full guide**
- [Flows tutorial](./flows-tutorial) — complete authoring reference
- [Agent skill](./agent-skill) — Cursor skill install
- [Admin commands (CLI)](./configuration) — hooks + apply
- [CLI](./cli) — platform CLI
- [HTTP API](../reference/http-api) — apply, runtime, gates
