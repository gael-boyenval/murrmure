# Murrmure — platform overview

## What Murrmure is

A **local-first hub runtime** where humans and agents coordinate through **sessions**, **runs**, **gates**, and an append-only **journal**. Agents connect via MCP; humans use **Murrmure Desktop** (observer shell webview). Operators configure spaces via **CLI** (`mrmr`) and the **`.mrmr/` space index** — there is no Configure UI.

## Product surfaces (shipped)

| Surface | Role |
|---------|------|
| **Murrmure Desktop** | Primary human path — gates, runs, notifications, space home |
| **CLI (`mrmr`)** | Admin — spaces, grants, `.mrmr/` init/link/apply, federation, workers |

MCP (`murrmure-mcp`) is the agent integration path. **Murrmure Desktop bundles** `@murrmure/mcp-bridge` and publishes the bridge path in `~/.murrmure/hubs/shared.json`; headless/CI installs the package globally.

## Core entities (v2)

| Entity | ID prefix | Meaning |
|--------|-----------|---------|
| **Space** | `spc_*` | Isolation boundary; indexed from `.mrmr/` |
| **Session** | `ses_*` | Correlation container for related work |
| **Run** | `run_*` | Execution unit (flow steps, handlers, gates) |
| **Gate** | `gate_*` | Human decision point on a run |
| **Flow** | `flw_*` | Indexed from `.mrmr/flows/*/flow.manifest.yaml` |

Legacy v1 **`instance_id`** (`ins_*`) is an install id only — prefer **`run_id`** on all new integrations.

## End-to-end — review loop (example)

1. Operator: `mrmr setup` → connection consent/context selection → reload and verify
2. Dev agent (MCP): platform tools (`murrmure_create_run`, `murrmure_list_step_contracts`, …); step completion via `murrmure_resolve_step` after handler dispatch
3. Reviewer resolves human steps in Desktop; agent waits with `murrmure_wait_for_run` and completes agent steps with `murrmure_resolve_step`
4. Audit via journal query or `mrmr runtime audit export`

## End-to-end — spec publish (example)

1. **feature-spec** flow indexed under `.mrmr/flows/` + `mrmr space apply`
2. Agent drafts via MCP platform tools and step contracts
3. Human publishes → `spec.published` journal event → space event handler in `.mrmr/space/handlers.yaml` dispatches downstream work

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
- **One MCP server** — grant-filtered platform tools; no mount-scoped flow worker
- **Space index** — `.mrmr/` YAML is source of truth; hub indexes on apply
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
@murrmure/hub-daemon           HTTP + SSE + MCP
@murrmure/cli                  mrmr + MCP + skills
@murrmure/mcp-bridge           murrmure-mcp stdio bridge (bundled in Desktop)
@murrmure/shell-web            observer shell (Desktop webview)
@murrmure/shell-client         typed shell HTTP client
@murrmure/view-sdk             custom view iframe protocol
test-utils/spaces/             CI/manual test spaces (preview-review-v2, …)
```

See per-domain specs under `studio-specs/current/` for route tables, wire formats, and acceptance criteria.
