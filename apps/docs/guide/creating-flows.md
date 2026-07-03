# Creating a flow

::: tip Start here
**New workflows** use a **`murrmure/flows/`** manifest indexed with **`mrmr space apply`**.

→ **[Preview-review tutorial](./tutorials/01-local-preview-review/)** — scaffold with `mrmr space flow init`, apply, run checkpoint loop in **ViewCanvasHost**.

→ **[Known gaps](./known-gaps)** — deferred product surface (empty when v2 backlog ships).
:::

This page is a short index. The full walkthrough lives in the tutorial above.

---

## Quick path — v2 indexed flow

```bash
mrmr space init
mrmr space flow init preview-review --template hello-gate
cd murrmure/views/preview-review && npm install && npm run build
cd ../preview-review-intake && npm install && npm run build
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply --strict
mrmr space status    # confirm flows count updated
```

`hello-gate` scaffolds the [preview-review reference workflow](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/plans/product/plan/06-reference-workflow-preview-review.md): intake checkpoint → build → review loop with `on_resolve` goto.

For a single invoke step without views, use `--template hello-invoke` — see [`hello-authoring`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/hello-authoring).

Mint agent grants with **`--capabilities flow:run,flow:read`**. Run with **`mrmr flow run flw_flows_preview_review`** or Desktop **Run**.

## Standalone view (add-on)

```bash
mrmr space view init my-view
cd murrmure/views/my-view && npm install
mrmr view dev my-view
```

Checkpoint steps with `view_ref` open in **ViewCanvasHost** — see [View SDK](../reference/view-sdk).

## What you build (v2)

| Piece | Location |
|-------|----------|
| Flow manifest | `murrmure/flows/{name}/flow.manifest.yaml` |
| Actions | `murrmure/actions.yaml` |
| Executors | `murrmure/executors.yaml` |
| Build scripts | `murrmure/scripts/{name}-*.mjs` |
| Checkpoint views | `murrmure/views/{id}/` (Vite+React + `view.manifest.yaml`) |
| Hooks | `murrmure/hooks.yaml` |

---

## Related

- [Tutorial: local preview-review](./tutorials/01-local-preview-review/) — **full guide**
- [Flows tutorial](./flows-tutorial) — complete authoring reference
- [Agent skill](./agent-skill) — Cursor skill install
- [Admin commands (CLI)](./configuration) — hooks + apply
- [CLI](./cli) — platform CLI
- [HTTP API](../reference/http-api) — apply, runtime, gates
