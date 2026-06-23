# How Murrmure fits together

Murrmure coordinates humans and agents on the same workflows (reviews, specs, approvals) with clear handoffs and audit history.

If you remember one thing: **humans use the browser, agents use MCP, and both meet at the hub**.

## The components at a glance

| Component | Who uses it | Install required? | Main job |
|-----------|-------------|-------------------|----------|
| **Browser shell** (`app.murrmure.dev` or your self-hosted shell URL) | Humans and admins | No | UI for Runtime + Configure (spaces, flows, grants, reviews, specs, gates) |
| **Hub** (cloud API or self-hosted daemon) | Shared backend | Hosted by Murrmure or your infra team | Stores spaces, journal events, flows, grants, and policy |
| **`@murrmure/cli`** (MCP) | Agent operators (Cursor/Claude/Desktop workers) | Yes | `murrmure mcp` — exposes Murrmure tools to agents |
| **`@murrmure/cli`** (platform) | Optional CI/scripts/operators | Optional | `mrmr health`, audit export, scripted transitions |
| **`@murrmure/cli` + `@murrmure/flow-dev-kit`** | Flow builders | Only for builders | `mrmr flow` — init, validate, build, push, evolve flows |

## Runtime data flow (no diagram tooling)

```text
Human reviewer/admin in browser shell
  - Configure: spaces, flows, grants
  - Runtime: review/spec canvases, gates
                 |
                 | HTTPS
                 v
                 Hub
        - journal + audit trail
        - spaces + install policy
        - grants + token auth
        - flow lifecycle
                 ^
                 | MCP via @murrmure/cli
                 |
Agent in Cursor/Claude
  - create sessions/specs
  - wait for handoffs
  - transition workflows
```

## Where flows fit

Flows are installed **per space** (for example `review-loop`, `feature-spec`).

When a flow is **live** in a space, it adds both:

1. **MCP tools** for agents in that space (for example `create_review_session`, `open_spec`)
2. **Canvas UI surfaces** in the browser shell under `/spaces/...`

No live flow in a space = no domain-specific MCP tools for that space.

## What a normal setup looks like

1. Admin creates a space in **Configure**
2. Admin installs flow and promotes it to **live**
3. Admin mints an agent grant token (`tok_...`)
4. Agent operator sets MCP env values:
   - `MURRMURE_HUB_URL`
   - `MURRMURE_HUB_TOKEN`
   - `MURRMURE_SPACE_ID`
5. Agent and humans collaborate on the same instance (`ins_...`) through hub-mediated handoffs

## Grants, tokens, and `MURRMURE_SPACE_ID`

- A **grant** defines what one agent can do.
- Minting a grant returns a one-time token (`tok_...`) for that agent.
- `MURRMURE_SPACE_ID` pins the MCP connection to one space (`spc_...`).
- Tool visibility is filtered by:
  - grant scopes (platform permissions), and
  - live flows in that space (plus any flow ACL restrictions).

Recommended practice: one token per agent process, and separate tokens for local/CI/prod workers.

## When to use each npm package

- Use **`@murrmure/cli`** with **`murrmure mcp`** for day-to-day agent operation in Cursor/Claude.
- Use **`@murrmure/cli`** with **`mrmr`** subcommands when you need scripts, CI jobs, or terminal automation.
- Use **`@murrmure/cli`** + **`@murrmure/flow-dev-kit`** when building or evolving flows (`mrmr flow …`).
- Human reviewers/admins do not need npm packages for normal usage.

## Glossary

| Term | Meaning |
|------|---------|
| **Hub** | Murrmure backend (cloud API or self-hosted daemon) that holds spaces, journal events, flows, and grants. |
| **Space** | Project boundary (`spc_...`) where flows are installed and instances run. |
| **Grant** | Scoped permission definition for an agent identity; minting produces a token. |
| **Flow** | Workflow package installed in a space; when live it provides MCP tools + canvas UI. |
| **Instance** | Running workflow item (`ins_...`) such as a review session or spec flow. |
| **Gate** | Human approval checkpoint required before specific transitions (promote/publish/production actions). |

## Next

- [Installation and dependencies](./installation)
- [Connect your agent](./agents-mcp)
- [Quick start](./quick-start)
