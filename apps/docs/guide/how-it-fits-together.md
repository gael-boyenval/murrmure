# How Studio fits together

Studio coordinates humans and agents on the same workflows (reviews, specs, approvals) with clear handoffs and audit history.

If you remember one thing: **humans use the browser, agents use MCP, and both meet at the hub**.

## The components at a glance

| Component | Who uses it | Install required? | Main job |
|-----------|-------------|-------------------|----------|
| **Browser shell** (`app.studio.dev` or your self-hosted shell URL) | Humans and admins | No | UI for Runtime + Configure (spaces, capabilities, grants, reviews, specs, gates) |
| **Hub** (cloud API or self-hosted daemon) | Shared backend | Hosted by Studio or your infra team | Stores spaces, journal events, capabilities, grants, and policy |
| **`@studio/hub-mcp`** | Agent operators (Cursor/Claude/Desktop workers) | Yes | MCP server that exposes Studio tools to agents |
| **`@studio/cli`** | Optional CI/scripts/operators | Optional | Terminal automation (`health`, `audit export`, scripted transitions) |
| **`@studio/capability-sdk`** | Capability builders | Only for builders | Build/validate/push custom capabilities from your own repo |

## Runtime data flow (no diagram tooling)

```text
Human reviewer/admin in browser shell
  - Configure: spaces, capabilities, grants
  - Runtime: review/spec canvases, gates
                 |
                 | HTTPS
                 v
                 Hub
        - journal + audit trail
        - spaces + install policy
        - grants + token auth
        - capability lifecycle
                 ^
                 | MCP via @studio/hub-mcp
                 |
Agent in Cursor/Claude
  - create sessions/specs
  - wait for handoffs
  - transition workflows
```

## Where capabilities fit

Capabilities are installed **per space** (for example `review-loop`, `feature-spec`).

When a capability is **live** in a space, it adds both:

1. **MCP tools** for agents in that space (for example `create_review_session`, `open_spec`)
2. **Canvas UI surfaces** in the browser shell under `/spaces/...`

No live capability in a space = no domain-specific MCP tools for that space.

## What a normal setup looks like

1. Admin creates a space in **Configure**
2. Admin installs capability and promotes it to **live**
3. Admin mints an agent grant token (`tok_...`)
4. Agent operator sets MCP env values:
   - `STUDIO_HUB_URL`
   - `STUDIO_HUB_TOKEN`
   - `STUDIO_SPACE_ID`
5. Agent and humans collaborate on the same instance (`ins_...`) through hub-mediated handoffs

## Grants, tokens, and `STUDIO_SPACE_ID`

- A **grant** defines what one agent can do.
- Minting a grant returns a one-time token (`tok_...`) for that agent.
- `STUDIO_SPACE_ID` pins the MCP connection to one space (`spc_...`).
- Tool visibility is filtered by:
  - grant scopes (platform permissions), and
  - live capabilities in that space (plus any capability ACL restrictions).

Recommended practice: one token per agent process, and separate tokens for local/CI/prod workers.

## When to use each npm package

- Use **`@studio/hub-mcp`** for day-to-day agent operation in Cursor/Claude.
- Use **`@studio/cli`** only when you need scripts, CI jobs, or terminal automation.
- Use **`@studio/capability-sdk`** only when building/evolving capabilities.
- Human reviewers/admins do not need npm packages for normal usage.

## Glossary

| Term | Meaning |
|------|---------|
| **Hub** | Studio backend (cloud API or self-hosted daemon) that holds spaces, journal events, capabilities, and grants. |
| **Space** | Project boundary (`spc_...`) where capabilities are installed and instances run. |
| **Grant** | Scoped permission definition for an agent identity; minting produces a token. |
| **Capability** | Workflow package installed in a space; when live it provides MCP tools + canvas UI. |
| **Instance** | Running workflow item (`ins_...`) such as a review session or spec flow. |
| **Gate** | Human approval checkpoint required before specific transitions (promote/publish/production actions). |

## Next

- [Installation and dependencies](./installation)
- [Connect your agent](./agents-mcp)
- [Quick start](./quick-start)
