# Studio — platform overview

## What Studio is

A **local-first hub runtime** where capabilities (review, spec publish, portals) mount on a domain-agnostic core. Agents connect via MCP; humans use a browser shell. Configuration (spaces, grants, triggers) is a separate shell mode from runtime (gates, events, capability canvases).

## End-to-end — phase 1 (review loop)

1. Alex runs setup wizard → creates `ui-sandbox` + `ui-production` spaces
2. Installs **review-loop** capability, validates, mints Worker grant for Cursor
3. Dev agent: `create_review_session` → reviewer annotates in shell → `wait_for_review`
4. Agent updates preview, replies, second round → `converged`
5. Maya approves production gate; Sarah exports audit trail

## End-to-end — phase 2 (spec → dev automation)

1. Admin installs **feature-spec** via config (or cloud BFF)
2. **Live apply** registers routes + MCP tools without daemon restart
3. Agent drafts spec → human publishes → `spec.published` event
4. **Trigger** mcp_wakes dev agent with structured payload — no human prompt
5. Dev agent uses **query_ask** to fetch backend refs (not emit_event hack)
6. Promote feature-spec 1.1 → connected MCP receives `tools_changed`

## Personas

| Persona | Primary surfaces |
|---------|------------------|
| Dev, Priya, Maya | Runtime shell, MCP tools, review/spec canvases |
| Alex | Configure: spaces, capabilities, hub settings |
| Sarah | Audit export, event tail, grant inventory (read) |
| Théo | Federation (hub S3); cross-hub query policy (XS1+) |

## Architectural invariants

- **Hexagonal hub** — `@studio/hub-core` pure domain, zero I/O
- **Contracts-first** — `@studio/contracts` Zod leaf; all edges import it
- **Instance primitive** — core owns `instance_id`; product maps "session" / "spec_key"
- **Journal canonical** — SQLite append-only + write-through snapshots
- **Denials are events** — every 403/409 appends journal row
- **One MCP server** — platform + capability tools; `STUDIO_SPACE_ID` env, no space_id in tool args
- **Skills ≠ law** — MCP resources for live contract, not prompt skills
- **At-least-once + dedup** — no exactly-once global claim

## Non-goals (v1)

- Multi-tenant OAuth / OIDC (cloud has magic-link v0 only)
- Agent LLM loop inside hub
- Capability marketplace / third-party packages
- Cron trigger UI
- Per-customer isolated hubs in cloud v1
- Relay as second runtime (relay = wire adapter only)

## Optional phase 2.1 (not spec'd)

- `review-loop-lite` (J14)
- Théo CS3 federation map + client portal capability
- Cron trigger UI

## Use cases & build spec

**Product inputs:** [`inputs/studio/`](../../inputs/studio/) — 40 journeys, personas, comparative framing in `studio-v3-overview.md`.

**Build orders (historical):** [archives/build-orders/](../archives/build-orders/) — definition-of-done merged into each domain `spec.md`.

## Package graph (summary)

```
@runtime/*                    kernel
@studio/contracts             wire types (leaf)
@studio/hub-core              hexagon
@studio/hub-daemon            HTTP + SSE + mount
@studio/hub-mcp / hub-cli     adapters
@studio/hub-client            typed client
@studio/shell-web             browser shell
@studio/capability-sdk        validate + manifest
examples/capabilities/        reference capabilities (feature-spec, review-loop)
```

Reference capabilities are **CDK examples** under `examples/capabilities/`, installed
as worker bundles — not monorepo packages.

See per-domain specs for full route tables, wire formats, and acceptance criteria.
