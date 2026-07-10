# Quick start (3 steps)

Goal: open Desktop, run one CLI wizard, then **Run** — checkpoint steps open your flow's **custom view** in **ViewCanvasHost**, not shell admin chrome.

If architecture is new, skim [How Murrmure fits together](./how-it-fits-together) first (2 minutes).

## 1) Open Murrmure Desktop

Install and launch Desktop — see [Murrmure Desktop](./desktop).

- **Packaged:** `pnpm desktop:build` and open the artifact
- **Contributors:** `pnpm desktop:dev:hmr` — native window + shell HMR + hub on `http://127.0.0.1:8787`

Desktop injects the bootstrap token automatically. You land on **`/spaces/new`** — no signup, no `/connect` paste.

## 2) Run the setup wizard

From your project directory (or an empty folder):

```bash
npm install -g @murrmure/cli @murrmure/mcp-bridge
mrmr setup
```

The wizard walks through:

1. **Connect** — hub URL + token (Desktop bootstrap works: `mrmr login --hub-url http://127.0.0.1:8787`)
2. **Spaces** — create `ui-sandbox` / `ui-production` (optional)
3. **Scaffold** — `.mrmr/` init, link, apply (optional example flow — say **No** if you are authoring your own)
4. **Skill** — install split Cursor skills (`murrmure-agent` + `murrmure-developer` when authoring)
5. **Grant** — mint agent token + paste-ready `.cursor/mcp.json` snippet

**Already have `.mrmr/`?** Use the shorter path:

```bash
mrmr space onboard
```

**CI / agents** — no Clack prompts:

```bash
mrmr setup --yes --json          # full first-run
mrmr space onboard --yes --json  # existing .mrmr/
```

## 3) Run your flow

In **Murrmure Desktop** → space home → **Run** on the indexed flow (e.g. **example**).

- Indexed flows come from `.mrmr/flows/` via `mrmr space apply`
- Checkpoint steps with `presentation.view` open in **ViewCanvasHost** (full canvas custom view)
- Shell chrome (flowchart, gate inbox) is **operator/admin mode** — not the primary human path when a view is specified

CLI alternative:

```bash
mrmr flow run flw_flows_example --input '{}' --space spc_ui_sandbox
```

## Verify

```bash
mrmr space status        # flows ≥ 1
mrmr doctor              # hub + auth smoke
mrmr space doctor        # .mrmr/ drift + handler coverage + MCP hints
```

Ask your connected agent:

> Call `murrmure_space_status` and summarize what you see.

## Next steps

- Learn the concepts: [Tutorial 1a — First flow (v3)](./tutorials/01-local-preview-review-v3/) (3 parts)
- Build the full workflow: [Tutorial 1b — Local preview review](./tutorials/01-local-preview-review/)
- [Creating flows](./creating-flows) · [Space handlers](./space-handlers) · [All tutorials](./tutorials/)
- [Murrmure Desktop](./desktop) · [Connect your agent](./agents-mcp)

## Done

You opened Desktop, ran `mrmr setup`, and started a run that lands in your flow's custom view canvas when checkpoints pause.
