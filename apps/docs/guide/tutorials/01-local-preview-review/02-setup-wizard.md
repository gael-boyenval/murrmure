# Part 2 — Setup wizard

Connect the CLI, scaffold `murrmure/`, install the **platform skill**, and wire **MCP** so Cursor can talk to the hub.

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
| **Init** | Creates `murrmure/` skeleton | Home for flows, actions, views |
| **Link** | Binds this folder → space id | Hub knows which disk path is this space |
| **Apply** | Indexes `murrmure/` (empty flows OK for now) | Desktop **Run** appears after you add a flow |
| **Skill** | `mrmr skill install` | **Platform** skill — Murrmure tools, gates, runs |
| **Grant** | Mints agent token + MCP JSON snippet | Cursor gets hub access |

### MCP snippet — purpose

Paste into `.cursor/mcp.json`:

| Variable | Purpose |
|----------|---------|
| `command: "murrmure-mcp"` | Launches the MCP bridge |
| `MURRMURE_HUB_TOKEN` | Agent identity (space and ACL come from token claims) |

Reload Cursor. Test: *“Call murrmure_space_status.”*

Grant must include **`action:invoke`**, **`step:resolve`**, and **`space:read`**.

### Platform skill — purpose

Teaches Cursor **protocol** behavior:

- How to read run / session ids
- **`murrmure_resolve_step`** for flow step completion
- **`murrmure_wait_for_run`** while humans review
- **`active-step-contract.json`** contract file loop

It does **not** define your feature build loop — that comes in Part 3 (`agent.md` + **feature-build** space skill).

## Step 3 — Prepare flow folder

Remove the placeholder flow from init:

```bash
rm -rf murrmure/flows/example
mkdir -p murrmure/flows/preview-review
```

Edit `murrmure/space.yaml`:

```yaml
slug: my-feature-site
```

## Already onboarded?

```bash
mrmr space onboard
mrmr skill install
mrmr grant mint --space spc_… --capabilities flow:run,flow:read,action:invoke,gate:resolve,journal:read,space:read --label cursor
```

## Checkpoint

- [ ] `murrmure/` exists
- [ ] Space linked — `mrmr space status` shows `spc_…`
- [ ] MCP works in Cursor (`murrmure_space_status`)
- [ ] Platform skill installed

## Next

[Part 3 — Agent layer →](./03-agent-md-and-skills)
