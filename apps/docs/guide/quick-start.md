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
3. **Scaffold** — `murrmure/` init, link, apply (indexes the starter **example** flow)
4. **Skill** — install `murrmure` Cursor skill in the repo
5. **Grant** — mint agent token + paste-ready `.cursor/mcp.json` snippet

**Already have `murrmure/`?** Use the shorter path:

```bash
mrmr space onboard
```

**CI / agents** — no Clack prompts:

```bash
mrmr setup --yes --json          # full first-run
mrmr space onboard --yes --json  # existing murrmure/
```

## 3) Run your flow

In **Murrmure Desktop** → space home → **Run** on the indexed flow (e.g. **example**).

- Indexed flows come from `murrmure/flows/` via `mrmr space apply`
- Checkpoint steps with `view_ref` open in **ViewCanvasHost** (full canvas custom view)
- Shell chrome (flowchart, gate inbox) is **operator/admin mode** — not the primary human path when a view is specified

CLI alternative:

```bash
mrmr flow run flw_flows_example --input '{}' --space spc_ui_sandbox
```

## Verify

```bash
mrmr space status        # flows ≥ 1
mrmr doctor              # hub + auth smoke
mrmr space doctor        # murrmure/ drift + MCP hints
```

Ask your connected agent:

> Call `murrmure_space_status` and summarize what you see.

## Next steps

- Build a real workflow from scratch: [Tutorial 1 — Local preview review](./tutorials/01-local-preview-review/)
- [Creating flows](./creating-flows) · [All tutorials](./tutorials/)
- [Murrmure Desktop](./desktop) · [Connect your agent](./agents-mcp)

## Done

You opened Desktop, ran `mrmr setup`, and started a run that lands in your flow's custom view canvas when checkpoints pause.
