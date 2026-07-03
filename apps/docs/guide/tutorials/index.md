# Tutorials

Hands-on walkthroughs for **v2 indexed flows** in `murrmure/`. Each tutorial uses `mrmr space apply`, custom views in **ViewCanvasHost**, and MCP platform tools — no worker install pipeline.

Each tutorial links to an **`examples/flows/*-v2/`** tree validated in CI with `mrmr space apply --strict`.

## Choose a tutorial

| | Tutorial | Example tree | You learn |
|---|----------|--------------|-----------|
| **1** | [Local preview review](./01-local-preview-review/) | [`preview-review-v2`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/preview-review-v2) | Agent + human · preview loop · `on_resolve` branching |
| **2** | [Multi-agent brief](./02-multi-agent-brief/) | [`team-brief-v2`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/team-brief-v2) | Three spaces · hooks wake · cross-space query |
| **3** | [Daily brief trigger](./03-daily-brief-trigger/) | [`daily-brief-v2`](https://github.com/gael-boyenval/murrmure/tree/main/examples/flows/daily-brief-v2) | Canvas action · event · agent wake · human review |

Recommended order: **1 → 2 → 3**.

## Before you start

- Node.js 20+ and Murrmure Desktop (or hub at `http://127.0.0.1:8787`)
- `@murrmure/cli` — see [Quick start](../quick-start) (`mrmr setup`)
- [How it fits together](../how-it-fits-together) — two-minute architecture read

For the full authoring reference (every manifest field and CLI flag), see the [Flows tutorial](../flows-tutorial).

## v2 vocabulary (shared)

| Layer | Pending | Resolved |
|-------|---------|----------|
| **Run checkpoint** | Run `input-required` at checkpoint step | Resolve with `{ disposition, output }` |
| **Agent wait** | `murrmure_wait_for_gate` returns pending | Returns resolved payload after human acts |
| **Trigger delivery** | Hook matched, delivery in flight | Terminal: `success`, `failed`, or `deduped` |
| **Human view** | Buttons enabled in **ViewCanvasHost** | View `submit()` → checkpoint resolve |

See each tutorial overview for workflow-specific states and tool names.
