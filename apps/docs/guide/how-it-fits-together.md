# How Murrmure fits together

Murrmure coordinates humans and agents on the same workflows (reviews, specs, approvals) with clear handoffs and audit history.

If you remember one thing: **humans use Murrmure Desktop, operators use the CLI, agents use MCP, and all three meet at the hub**.

## The components at a glance

| Component | Who uses it | Install required? | Main job |
|-----------|-------------|-------------------|----------|
| **Murrmure Desktop** | Humans (reviewers, leads) | Desktop app | Observer shell — sessions, gates, audit |
| **Hub** (local sidecar in Desktop) | Shared backend | Bundled with Desktop | Stores spaces, journal events, flows, grants, and policy |
| **`@murrmure/mcp-bridge`** | Agent operators (Cursor/Claude) | Yes | `murrmure-mcp` stdio bridge for MCP clients |
| **`@murrmure/cli`** (platform) | CLI operators / CI | Yes for setup | `mrmr space`, `mrmr connection`, `mrmr space apply`, audit, automation |
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
        - flow lifecycle + handler dispatch
                 ^
                | MCP via @murrmure/mcp-bridge
                 |
Agent in Cursor/Claude
  - create sessions/runs
  - murrmure_resolve_step at agent steps
  - murrmure_wait_for_run at human steps

CLI operator (terminal)
  - mrmr space / grant mint / space apply
  - mrmr step resolve (shell handler complete: cli)
  - same hub APIs as Desktop webview
```

## Where flows fit

Authors define **indexed flows** in `.mrmr/flows/` and **handlers** in `.mrmr/space/handlers.yaml`, then index with **`mrmr space apply`**.

When indexed, a flow provides:

1. **Declarative steps** — unified step contracts (`branches`, `presentation`, nested `steps`)
2. **Custom views** at human steps — rendered in **ViewCanvasHost** (full primary-region canvas)
3. **Handler dispatch** — handlers bind steps via **`on::key`** (`on: step.opened::{flow_name}.{step_id}`); `contract_keys` is prompt-scope only. Agents complete with **`murrmure_resolve_step`**

Shell chrome (space home, flowchart, gate inbox) is **operator/admin mode** — not the primary human path when a space-owned view is bound to the step.

## What a normal setup looks like

1. Open **Murrmure Desktop** — bootstrap auth lands you on `/spaces/new`
2. Run **`mrmr space link --create`** and **`mrmr space apply`** to index flows + handlers
3. Run **`mrmr connection create`** once per machine/trust boundary
4. Select one or more integration contexts; each receives the stable launcher and the same connection ID, never a token
5. Agent and humans collaborate on the same session through hub-mediated handoffs

## Grants, tokens, and MCP targeting

- A **grant** defines what one agent can do.
- Minting a grant returns a one-time token (`tok_...`) for that agent.
- Token claims define space identity and ACL for MCP tools.
- Tool visibility is filtered by grant scopes, live flows in that space, and flow ACL restrictions.

Recommended practice: one persistent connection per machine/trust boundary,
`mrmr connection activate` for local selection, and separate connections for
CI/team/production boundaries.

## When to use each npm package

- Use **`@murrmure/cli`** with **`mrmr setup`** / **`mrmr space apply`** to scaffold and index `.mrmr/`.
- Use **`@murrmure/view-sdk`** (via `mrmr space view init`) for checkpoint custom views.
- Human reviewers use **Desktop only** — checkpoint views open in **ViewCanvasHost**.

## Glossary

| Term | Meaning |
|------|---------|
| **Hub** | Murrmure backend that holds spaces, journal events, flows, and grants. Runs locally inside Desktop. |
| **Space** | Project boundary (`spc_...`) where flows are installed and sessions run. |
| **Grant** | Scoped permission definition for an agent identity; minting produces a token. |
| **Flow** | Workflow manifest in `.mrmr/flows/` indexed per space via apply |
| **Handler** | Space-owned execution binding in `handlers.yaml`, bound by `on::key` (`contract_keys` is prompt-scope) |
| **Session / Run** | Correlation container and one flow execution; human steps pause runs |
| **ViewCanvasHost** | Shell region that embeds custom checkpoint views (primary human UX) |
| **Gate** | Human approval checkpoint (imperative API or orchestration attach) |

## Next

- [Murrmure Desktop](./desktop)
- [Installation and dependencies](./installation)
- [Space handlers](./space-handlers)
- [Connect your agent](./agents-mcp)
- [Quick start](./quick-start)
