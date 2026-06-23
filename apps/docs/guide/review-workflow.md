# Review workflow

The **Review loop** capability is Studio's reference human/agent loop: preview, comments, Finish, structured handoff.

Install it from **Configure → Capabilities** and promote to **`live`**. Mint a **Worker** grant for your agent.

## States

| State | Who acts |
|-------|----------|
| `awaiting_review` | Human reviews, comments, **Finish review** |
| `awaiting_agent` | Agent applies feedback |
| `changes_made` | Human reviews updated preview |
| `converged` | Review complete |
| `production_approved` | Production gate approved (terminal) |

## Round 1

1. **Agent (MCP)** — **`create_review_session`** with preview URL
2. **Human (browser)** — **Runtime → Instances → Open review** (or session URL)
3. Comment, **Finish review**
4. **Agent (MCP)** — **`wait_for_review`** returns `comments[]`; state `awaiting_agent`

## Round 2+

1. **Agent** — fix code, update preview URL via MCP, **`transition`** with `agent_done`
2. **Human** — review again, **Finish** → **`converged`** when satisfied

## Production gate

From **`converged`**, request production approval. A **gate** appears under **Runtime → Gates**; approver clicks **Approve** → `production_approved`.

## Session link

Copy from the browser address bar:

```
/spaces/spc_…/sessions/ins_…
```

Cloud may prefix with `/w/<workspace>/`. `session_key` equals instance id (`ins_…`).

## Comments

Stored in session metadata. Agents read them from **`wait_for_review`** or **`get_session`** — not from chat exports.

## Who does what

| Action | Browser | MCP |
|--------|---------|-----|
| Create session | — | **`create_review_session`** |
| Comment / Finish | Review canvas | — |
| Wait for human | — | **`wait_for_review`** |
| Apply fixes | — | **`transition`**, patch session |

No curl required.

## Next

- [Browser app](./browser)
- [Connect your agent](./agents-mcp)
- [Quick start](./quick-start)
