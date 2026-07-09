# How Murrmure fits together

Murrmure coordinates humans and agents on the same workflows (reviews, specs, approvals) with clear handoffs and audit history.

If you remember one thing: **humans use Murrmure Desktop, operators use the CLI, agents use MCP, and all three meet at the hub**.

## The components at a glance

| Component | Who uses it | Install required? | Main job |
|-----------|-------------|-------------------|----------|
| **Murrmure Desktop** | Humans (reviewers, leads) | Desktop app | Observer shell — sessions, gates, audit |
| **Hub** (local sidecar in Desktop) | Shared backend | Bundled with Desktop | Stores spaces, journal events, flows, grants, and policy |
| **`@murrmure/mcp-bridge`** | Agent operators (Cursor/Claude) | Yes | `murrmure-mcp` stdio bridge for MCP clients |
| **`@murrmure/cli`** (platform) | CLI operators / CI | Yes for setup | `mrmr space`, `mrmr grant mint`, `mrmr space apply`, audit, automation |
| **`@murrmure/view-sdk`** | View authors | Optional | `createViewMount`, view dev loop — scaffold with `mrmr space view init` |

## Runtime data flow

```text
Human in Murrmure Desktop (observer shell)
  - review/spec canvases, gates, notifications
                 |
                 | http://127.0.0.1:8787 (local hub)
                 v
                 Hub
        - journal + audit trail
        - spaces + install policy
        - grants + token auth
        - flow lifecycle
                 ^
                | MCP via @murrmure/mcp-bridge
                 |
Agent in Cursor/Claude
  - create sessions/specs
  - wait for handoffs
  - invoke actions

CLI operator (terminal)
  - mrmr space / grant mint / flow apply
  - same hub APIs as Desktop webview
```

## Where flows fit

Authors define **indexed flows** in `murrmure/flows/` and index them with **`mrmr space apply`**.

When indexed, a flow provides:

1. **Declarative steps** — `invoke`, `checkpoint`, branching via `on_resolve`
2. **Custom views** at checkpoint steps — rendered in **ViewCanvasHost** (full primary-region canvas)
3. **Platform MCP tools** — `murrmure_invoke_action`, gate/run waits (filtered by grant capabilities)

Shell chrome (space home, flowchart, gate inbox) is **operator/admin mode** — not the primary human path when a checkpoint specifies a view.

## What a normal setup looks like

1. Open **Murrmure Desktop** — bootstrap auth lands you on `/spaces/new`
2. Run **`mrmr space link --create`** and **`mrmr space apply`** to install flows
3. Run **`mrmr grant mint`** for each agent
4. Agent operator exports `MURRMURE_HUB_TOKEN` from `mrmr grant mint` and uses thin MCP config (`command: "murrmure-mcp"`)
5. Agent and humans collaborate on the same session through hub-mediated handoffs

## Grants, tokens, and MCP targeting

- A **grant** defines what one agent can do.
- Minting a grant returns a one-time token (`tok_...`) for that agent.
- Token claims define space identity and ACL for MCP tools.
- Tool visibility is filtered by grant scopes, live flows in that space, and flow ACL restrictions.

Recommended practice: one token per agent process, use `mrmr grant use --space ...` to switch active local grant pointers, and keep separate tokens for local/CI/prod workers.

## When to use each npm package

- Use **`@murrmure/cli`** with **`mrmr setup`** / **`mrmr space apply`** to scaffold and index flows in `murrmure/`.
- Use **`@murrmure/view-sdk`** (via `mrmr space view init`) for checkpoint custom views.
- Human reviewers use **Desktop only** — checkpoint views open in **ViewCanvasHost**.

## Glossary

| Term | Meaning |
|------|---------|
| **Hub** | Murrmure backend that holds spaces, journal events, flows, and grants. Runs locally inside Desktop. |
| **Space** | Project boundary (`spc_...`) where flows are installed and sessions run. |
| **Grant** | Scoped permission definition for an agent identity; minting produces a token. |
| **Flow** | Workflow manifest in `murrmure/flows/` indexed per space via apply |
| **Session / Run** | Correlation container and one flow execution; checkpoints pause runs |
| **ViewCanvasHost** | Shell region that embeds custom checkpoint views (primary human UX) |
| **Gate** | Human approval checkpoint (imperative API or declarative checkpoint step) |

## Next

- [Murrmure Desktop](./desktop)
- [Installation and dependencies](./installation)
- [Connect your agent](./agents-mcp)
- [Quick start](./quick-start)
