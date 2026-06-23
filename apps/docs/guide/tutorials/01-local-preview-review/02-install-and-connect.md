# Part 2 — Install and connect

Push `preview-review` to a local self-hosted hub, evolve it to **live**, and connect one coding agent over MCP.
The goal is to make the flow callable by both the human shell and the agent runtime.

## 1) Connect the browser shell to your local hub

From the shell UI:

1. Open `/connect`
2. Enter hub URL (for example `http://127.0.0.1:8787`)
3. Enter bootstrap/admin token
4. Open `/setup` and complete first-run setup

After setup, continue in **Configure** for the space used in this tutorial.

Why this step: flow installs, grants, and runtime review happen in the shell UI, so your browser must trust the same hub instance you use in CLI.

## 2) Set SDK CLI auth for flow commands

```bash
export MURRMURE_HUB_URL=http://127.0.0.1:8787
export MURRMURE_TOKEN=tok_your_admin_or_install_grant
export MURRMURE_SPACE_ID=spc_ui_sandbox

mrmr flow doctor --json
```

You can also store these in `~/.murrmure/hubs/shared.json`.

Why this step: every `mrmr flow ...` command in this part resolves auth and target space from these environment variables.

## 3) Push `preview-review` as draft

From `~/work/preview-review-tutorial/workflows/preview-review`:

```bash
mrmr flow validate . --json
mrmr flow build .
mrmr flow push --space spc_ui_sandbox --json
```

Push writes `.push-state.json` in the stage directory.  
Record `install_id` (for example `ins_...`).

Why this step: push uploads artifacts and registers a draft install, but draft installs are not yet exposed to MCP agents.

## 4) Run the evolution flow to live

Use **Configure → [space] → Flows → [preview-review install]**:

1. Validate
2. Test
3. Promote
4. **Apply live** (CLI — see note below)

::: info Apply live
The Configure UI has **Validate**, **Test**, and **Promote** only. **Apply live** is CLI today:

```bash
mrmr flow apply --space $SPACE --install $INSTALL --json
```

Promote updates evolution state; **apply** spawns the worker and registers MCP tools. See [Flow evolution pipeline](../../flow-evolution).
:::

Equivalent CLI flow:

```bash
INSTALL=ins_...
SPACE=spc_ui_sandbox

mrmr flow validate --space $SPACE --install $INSTALL --json
mrmr flow test --space $SPACE --install $INSTALL --json
mrmr flow promote --space $SPACE --install $INSTALL --json
mrmr flow apply --space $SPACE --install $INSTALL --json
```

Only **live** installs publish flow MCP tools for the space.

Why this step: promote/apply is the boundary between "uploaded artifact" and "runtime-available contract + tools".

## 5) Mint one agent grant token

In **Configure → [space] → Agent grants → Mint grant**:

- Template: `Worker`
- Harness: `cursor-local` (or your local harness name)
- Flow ACL includes `preview-review`

Copy the minted token (`tok_...`).

Why this step: the token scopes what the agent can call; without ACL for `preview-review`, MCP discovery will not include your tools.

## 6) Configure MCP client for the coding agent

Example `mcp.json`:

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "http://127.0.0.1:8787",
        "MURRMURE_HUB_TOKEN": "tok_...",
        "MURRMURE_SPACE_ID": "spc_ui_sandbox"
      }
    }
  }
}
```

Reload MCP, then verify with:

- `get_space_state`
- `contract_versions`

If both return valid JSON, connectivity is healthy.

Why this step: these are low-risk read calls that prove URL, token, and space scoping are all correct before you start the workflow loop.

## 7) Confirm runtime readiness

Before running the loop:

| Check | Expected |
|------|----------|
| Flow install | `preview-review` is `live` in your target space |
| Agent tools | `create_preview_review_session`, `wait_for_human_review`, `signal_changes_applied` are visible |
| Human shell | Runtime/Instances opens without auth errors |
| Preview URL | Local preview is reachable (example `http://127.0.0.1:5173`) |

If bundled `review-loop` is also present in the space, ignore it for this tutorial; use only `preview-review`.

Why this step: most "tool not found" or "wait never resolves" issues come from environment mismatches, not flow code.

## Next

[Part 3 — Run the feedback loop →](./03-run-feedback-loop)
