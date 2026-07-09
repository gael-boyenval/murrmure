# Murrmure — platform overview

## What Murrmure is

A **local-first hub runtime** where humans and agents coordinate through **sessions**, **runs**, **gates**, and an append-only **journal**. Agents connect via MCP; humans use **Murrmure Desktop** (observer shell webview). Operators configure spaces via **CLI** (`mrmr`) and the **`murrmure/` space index** — there is no Configure UI.

## Product surfaces (shipped)

| Surface | Role |
|---------|------|
| **Murrmure Desktop** | Primary human path — gates, runs, notifications, space home |
| **CLI (`mrmr`)** | Admin — spaces, grants, `murrmure/` init/link/apply, federation, workers |

MCP (`murrmure-mcp`) is the agent integration path shipped by `@murrmure/mcp-bridge`.

## Core entities (v2)

| Entity | ID prefix | Meaning |
|--------|-----------|---------|
| **Space** | `spc_*` | Isolation boundary; indexed from `murrmure/` |
| **Session** | `ses_*` | Correlation container for related work |
| **Run** | `run_*` | Execution unit (flow steps, actions, gates) |
| **Gate** | `gate_*` | Human decision point on a run |
| **Flow** | `flw_*` | Indexed from `murrmure/flows/*/flow.manifest.yaml` |

Legacy v1 **`instance_id`** (`ins_*`) is an install id only — prefer **`run_id`** on all new integrations.

## End-to-end — review loop (example)

1. Operator: `mrmr space init` → `mrmr space link --create` → `mrmr space apply` → `mrmr grant mint`
2. Dev agent (MCP): mount-scoped tools when FDK worker is live, or indexed actions/flows via v2 platform tools
3. Reviewer resolves gates in Desktop; agent waits with `murrmure_wait_for_gate`
4. Audit via journal query or `mrmr runtime audit export`

## End-to-end — spec publish (example)

1. **feature-spec** flow indexed under `murrmure/flows/` + `mrmr space apply`
2. Agent drafts via mount MCP tools (`open_spec`, `patch_spec_section`, …)
3. Human publishes → `spec.published` journal event → hook/trigger invokes downstream agent via `murrmure_invoke_action`

## Personas

| Persona | Primary surfaces |
|---------|------------------|
| Dev, reviewer | Desktop observer shell, MCP tools |
| Alex (admin) | CLI — spaces, grants, triggers, federation |
| Sarah (audit) | Journal export, `mrmr runtime audit export` |
| Théo (federation) | CLI federation peers, remote space bindings |

## Architectural invariants

- **Hexagonal hub** — `@murrmure/hub-core` pure domain, zero I/O
- **Contracts-first** — `@murrmure/studio-contracts` Zod leaf; all edges import it
- **Run = execution unit** — sessions correlate; runs carry lifecycle and step memos
- **Journal canonical** — SQLite append-only + write-through snapshots
- **Denials are events** — every 403/409 appends journal row
- **One MCP server** — platform + mount-scoped flow tools; grant `flow_acl` filters catalog
- **Space index** — `murrmure/` YAML is source of truth; hub indexes on apply
- **At-least-once + dedup** — no exactly-once global claim

## Non-goals (v2)

- Murrmure Cloud (hosted SaaS, signup, multi-tenant accounts)
- Configure UI / setup wizard (`/configure`, `/setup` retired)
- Browser-as-standalone-product without Desktop
- Agent LLM loop inside hub
- Flow marketplace / third-party package store

## Package graph (summary)

```text
@murrmure/studio-contracts     wire types (leaf)
@murrmure/hub-core             hexagon
@murrmure/hub-daemon           HTTP + SSE + mounts
@murrmure/cli                  mrmr + MCP + skill
@murrmure/shell-web            observer shell (Desktop webview)
@murrmure/shell-client         typed shell HTTP client
@murrmure/view-sdk             custom view iframe protocol
examples/flows/                reference FDK flows (review-loop, feature-spec)
```

See per-domain specs under `studio-specs/current/` for route tables, wire formats, and acceptance criteria.
