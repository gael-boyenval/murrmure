# Quick start: create an empty space

Goal: open Desktop, create one named empty space, and connect local tools through
the bundled bridge.

If architecture is new, skim [How Murrmure fits together](./how-it-fits-together) first (2 minutes).

## 1) Open Murrmure Desktop

Install and launch Desktop — see [Murrmure Desktop](./desktop).

- **Packaged:** `pnpm desktop:build` and open the artifact
- **Contributors:** `pnpm desktop:dev:hmr` — native window + shell HMR + hub on `http://127.0.0.1:8787`

Desktop injects the bootstrap token automatically. You land on **`/spaces/new`**
with no spaces, persisted contracts, catalog entries, or demo flows.

## 2) Run the setup wizard

From your project directory (or an empty folder):

```bash
npm install -g @murrmure/cli
mrmr setup
```

The wizard walks through:

1. **Space** — confirm the folder-derived display name and editable slug; the Hub assigns a separate immutable ID
2. **Scaffold** — `.mrmr/` init, link, apply (optional example flow — say **No** if you are authoring your own)
3. **Skill** — install split Cursor skills (`murrmure-agent` + `murrmure-developer` when authoring)
4. **Connection** — consent, select one or more contexts, then reload and verify

Setup uses the already-running Desktop Hub authorization. If you accept the
connection step, it creates one `tutorial-builder/v1` connection, stores its
credential in macOS Keychain, and installs the same connection ID in every
selected context. It never writes token material to project or MCP files.

**CI / agents** — no Clack prompts:

```bash
mrmr setup --yes --json          # full first-run
mrmr connection create --space spc_… --json # explicit local connection
```

## 3) Add and run a flow

In **Murrmure Desktop** → space home → **Run** on the indexed flow (e.g. **example**).

- Indexed flows come from `.mrmr/flows/` via `mrmr space apply`
- Checkpoint steps with `presentation.view` open in **ViewCanvasHost** (full canvas custom view)
- Shell chrome (flowchart, gate inbox) is **operator/admin mode** — not the primary human path when a view is specified

CLI alternative:

```bash
mrmr flow run flw_flows_example --input '{}' --space spc_…
```

## Verify

```bash
mrmr space status        # flows ≥ 1
mrmr doctor              # hub + auth smoke
mrmr space doctor        # .mrmr/ drift + handler coverage + MCP hints
```

Reload selected tools and call `murrmure_space_status`.

## Next steps

- Learn the concepts: [Tutorial 1a — First flow (v3)](./tutorials/01-local-preview-review-v3/) (6 parts)
- Build the full workflow: [Tutorial 1b — Local preview review](./tutorials/01-local-preview-review/)
- [Creating flows](./creating-flows) · [Space handlers](./space-handlers) · [All tutorials](./tutorials/)
- [Murrmure Desktop](./desktop) · [Connect your agent](./agents-mcp)

## Done

You opened Desktop, created one consistently named empty space, and connected
local tools without installing a separate bridge.
