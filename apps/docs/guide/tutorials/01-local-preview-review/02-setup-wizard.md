# Part 2 — Setup wizard

Connect the CLI, scaffold `.mrmr/`, install **split platform skills**, and wire **MCP** so Cursor can talk to the hub.

Murrmure Desktop must be running (hub at `http://127.0.0.1:8787`).

## Step 1 — Install CLI

```bash
npm install -g @murrmure/cli
```

## Step 2 — Run setup from the space root

```bash
cd ~/work/my-feature-site
mrmr setup
```

The wizard runs steps in order. Here is **why each exists**:

| Step | What it does | Why you need it |
|------|--------------|-----------------|
| **Connect** | `mrmr login` — hub URL + token | CLI and Desktop share the same hub |
| **Spaces** | Create or pick `spc_…` | Every run belongs to one space |
| **Init** | Creates `.mrmr/` skeleton | Home for flows, handlers, views |
| **Link** | Binds this folder → space id | Hub knows which disk path is this space |
| **Apply** | Indexes `.mrmr/` (empty flows OK for now) | Desktop **Run** appears after you add a flow |
| **Skill** | `mrmr skill install` | Platform skills — Murrmure tools, gates, runs |
| **Grant** | Mints agent token + MCP JSON snippet | Cursor gets hub access |

### MCP snippet — purpose

Paste into `.cursor/mcp.json`:

| Variable | Purpose |
|----------|---------|
| `command: "murrmure-mcp"` | Launches the MCP bridge |
| `MURRMURE_HUB_TOKEN` | Agent identity (space and ACL come from token claims) |

Reload Cursor. Test: *"Call murrmure_space_status."*

Grant must include **`action:invoke`**, **`step:resolve`**, **`space:read`**, and **`journal:read`**. Add **`event:emit`** if your space will emit cross-space events later.

### Split platform skills — purpose

Murrmure ships two skills instead of one monolith:

| Variant | Skill | Teaches |
|---------|-------|---------|
| **agent** | `murrmure-agent` | Runtime loop: `murrmure_resolve_step`, `murrmure_wait_for_run`, step contracts |
| **developer** | `murrmure-developer` | Authoring: `.mrmr/` layout, `handlers.yaml`, `contract_keys`, apply + doctor |

Install both for this tutorial:

```bash
mrmr skill install --variant agent
mrmr skill install --variant developer
```

Or `mrmr skill install --variant all`. The **agent** skill does **not** define your feature build loop — that comes in Part 3 (`agent.md` + **feature-build** space skill).

## Step 3 — Prepare flow folder

Remove the placeholder flow from init:

```bash
rm -rf .mrmr/flows/example
mkdir -p .mrmr/flows/preview-review
```

Edit `.mrmr/space/space.yaml`:

```yaml
apiVersion: murrmure.space/v1
slug: my-feature-site
```

Your `space.yaml` should declare the slug and optional `link:` block once the space is linked — see Part 2 for the full file.

## Already initialized?

```bash
mrmr space link --path . --space spc_…
mrmr space apply
mrmr skill install --variant all
mrmr connection create --space spc_…
```

## Checkpoint

- [ ] `.mrmr/` exists with `space/`, `flows/`, `views/`
- [ ] Space linked — `mrmr space status` shows `spc_…`
- [ ] MCP works in Cursor (`murrmure_space_status`)
- [ ] `murrmure-agent` and `murrmure-developer` skills installed

## Next

[Part 3 — Agent layer →](./03-agent-md-and-skills)
