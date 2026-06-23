# Connect your agent (MCP)

Murrmure agents connect through **MCP**. Humans/admins continue using the browser shell.

For normal usage, you should not need curl or raw HTTP calls.

## What MCP gives your agent

- Platform tools like `get_space_state`, `transition`, `wait_for_state`, `emit_event`
- Flow tools when installed and live in the space (for example review/spec tools)
- Space-scoped operation based on `MURRMURE_SPACE_ID`

## Before you start

1. Access to cloud workspace or self-hosted shell
2. Target space exists (`spc_...`)
3. Admin minted a grant token (`tok_...`) in **Configure → Agent grants**
4. Node.js 20+
5. `@murrmure/cli` installed (see [Installation](./installation))

**Flow builders:** install the [Agent skill](./agent-skill) (`mrmr skill install`) so coding agents follow version bumps and the evolution pipeline — separate from MCP hub access.

## 1) Install MCP package

```bash
npm install -g @murrmure/cli
```

## 2) Get connection values

From **Configure → [space] → Agent grants → Mint grant**:

- one-time token (`tok_...`)
- space id (`spc_...`) from the space you want this agent to operate in

For self-hosted first-run setup, `/setup` also shows a prefilled MCP snippet.

## 3) Add MCP config in Cursor/Claude

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "https://api.murrmure.dev",
        "MURRMURE_HUB_TOKEN": "tok_...",
        "MURRMURE_SPACE_ID": "spc_..."
      }
    }
  }
}
```

For self-hosted, set `MURRMURE_HUB_URL` to your hub URL.

### Field reference

| Field | Required | Example | Source |
|------|----------|---------|--------|
| `MURRMURE_HUB_URL` | Yes | `https://api.murrmure.dev` | Cloud default or your self-hosted hub URL |
| `MURRMURE_HUB_TOKEN` | Yes | `tok_...` | Minted grant token |
| `MURRMURE_SPACE_ID` | Yes | `spc_ui_sandbox` | Space detail page / URL context |

**Monorepo dev:** point `command` at `packages/cli/dist/cli.js` with `"args": ["mcp"]` (after `pnpm build`), or use `pnpm --filter @murrmure/cli exec murrmure mcp`.

## 4) Reload client and verify

After saving MCP config, reload the IDE/client.

Ask the agent to call:

- `get_space_state`
- `contract_versions`

If you get valid JSON responses, the connection is healthy.

## How tools appear in MCP

| Condition | Tool availability |
|----------|-------------------|
| Grant has platform scopes | Platform tools appear (`get_space_state`, `transition`, `emit_event`, ...) |
| `review-loop` is live in this space | Review tools appear (`create_review_session`, `wait_for_review`, `get_session`) |
| `feature-spec` is live in this space | Spec tools appear (`open_spec`, `patch_spec_section`, `transition_spec`, ...) |

If a tool is missing, check:
1. correct `MURRMURE_SPACE_ID`
2. flow is **live**
3. token grant/scopes/ACL allow it

## Review tools

Requires **Review loop** live in the space.

| Tool | Use |
|------|-----|
| `create_review_session` | Start review with preview URL |
| `get_session` | Read comments and state |
| `wait_for_review` | Block until human Finish |

Humans open **`/spaces/…/sessions/…`** in the browser — agents create sessions, humans never curl.

## Feature-spec tools

Requires **Feature spec** live in the space.

| Tool | Use |
|------|-----|
| `open_spec` | Create spec instance |
| `patch_spec_section` | Edit a section |
| `add_context_ref` | Attach URL or blob ref (v1.1+) |
| `transition_spec` | e.g. `context_ready` → draft; `revise_spec` when published |
| `get_spec` | Read full spec |
| `publish_spec` | When config allows agent publish |

Humans usually **Publish** from **`/spaces/…/specs/…`** instead of agents calling `publish_spec`.

## Example: review loop

1. Agent: **`create_review_session`** with preview URL
2. Human: open session link → comment → **Finish review**
3. Agent: **`wait_for_review`** → apply fixes → **`transition`** / next round

## Example: feature spec

1. Agent: **`open_spec`**, **`patch_spec_section`**, **`transition_spec`** (`context_ready`)
2. Human: **Runtime → Open spec → Publish**
3. Journal emits **`spec.published`** — may **`mcp_wake`** dev agent if a trigger is registered
4. Dev agent: **`query_ask`** (`spec_summary@1`) for cross-space summary, then **`get_spec`** in source space (with read grant) → write local markdown file

## Cross-space reads

When the dev agent lives in a different space than the orchestrator:

- **`query_ask`** with `query_type: "spec_summary@1"` — summary only, no `body_ref` (requires target space `inbound_allowlist`)
- **`get_spec`** — full spec when the agent holds a read grant on the source space

Prefer triggers + `query_ask` over polling or manual prompts.

## Common issues

| Symptom | Usually means | Fix |
|--------|----------------|-----|
| `TOOL_NOT_AUTHORIZED` | Missing scope or flow not live | Fix grant template/scopes or promote flow |
| 401/403 errors | Token invalid/revoked | Mint a new grant token |
| Expected tools not listed | Wrong space id | Set correct `MURRMURE_SPACE_ID` and reload MCP |
| Works in browser, fails in agent | Browser auth != MCP token auth | Use minted `tok_...`, not browser session |

## Where CLI fits

`@murrmure/cli` is optional for scripts/CI.  
Interactive coding-agent workflows should use MCP as the primary interface.

## Next

- [Agent skill](./agent-skill) — flow authoring checklist for coding agents
- [Installation and dependencies](./installation)
- [Quick start](./quick-start)
- [Browser app](./browser)
- [MCP tools reference](../reference/mcp-tools)
