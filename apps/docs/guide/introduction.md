# Introduction

## The problem

Coding agents are fast. Keeping a team in sync with them is not.

Today, the work happens in chat. An agent posts a link, someone replies "looks off," another person pastes a screenshot, feedback scatters across three threads, and two days later nobody can say what was actually approved — or why. Humans and agents drift out of sync. Context gets lost. There's no audit trail when it matters.

**Murrmure fixes the coordination, not the coding.** It gives humans and coding agents one shared place to review work, hand off cleanly, approve with sign-off, and keep a complete record — without everyone living in chat.

## What Murrmure is

Murrmure is a coordination layer for humans and AI coding agents:

- **Murrmure Desktop** — native app with the observer shell and local hub; where people review previews, comment, and approve gates.
- **The `mrmr` CLI** — setup, spaces, grants, flows, and automation for operators and CI.
- **MCP** — coding agents connect with scoped tokens to open sessions, draft specs, and wait for human decisions.
- **Flows** — workflows like review rounds and feature specs. Built-in ones get you started; you can author your own.

Everything is recorded. Every comment, handoff, and approval lands in an append-only audit trail.

## What you need depends on your role

| You are… | What you install | How you work |
|----------|------------------|--------------|
| **Desktop user** (reviewer, lead, admin UI) | [Murrmure Desktop](./desktop) | Observer shell inside Desktop — review, comment, approve gates |
| **CLI operator** | `@murrmure/cli` (`mrmr`) | Terminal — `mrmr space`, `mrmr grant mint`, flow apply, CI scripts |
| **Agent (MCP)** | `@murrmure/mcp-bridge` (`murrmure-mcp`) | Scoped grant from `mrmr grant mint` — agent calls Murrmure tools from the IDE |

You **don't clone a git repository** to use Murrmure — install Desktop and the CLI. You **don't use curl** for everyday work — people use Desktop, operators use `mrmr`, agents use MCP.

## How it works

1. Install **Murrmure Desktop** — bootstrap auth is automatic; you land on `/spaces/new`.
2. Use **`mrmr space link`** / **`mrmr space apply`** to set up spaces and flows (or follow the quick start).
3. Mint agent grants with **`mrmr grant mint`** and paste MCP config into your coding agent.
4. People work in **Desktop** — preview, comment, Finish a review, approve a gate.
5. Agents connect via **MCP** — open sessions, draft specs, wait for human handoff.

**Want custom workflows?** See [Creating flows](./creating-flows) and [Space handlers](./space-handlers) — author indexed flows in `.mrmr/` with **`mrmr space apply`**. Checkpoint UI uses **ViewCanvasHost** and `@murrmure/view-sdk`.

## A typical review afternoon

1. An agent finishes a change and opens a **review session** with a live preview link.
2. You open the session in Desktop, comment on the preview, and click **Finish review**.
3. The agent gets **structured feedback**, applies the fixes, and opens the next round.
4. The session reaches **converged**. The audit trail shows exactly who approved what.

## A typical feature-spec flow

1. An agent drafts a spec, section by section.
2. You open the **spec canvas** in Desktop and **Publish** (or approve a gate).
3. Publishing fires an event that can automatically **wake a downstream agent** — no human re-prompting.
4. The dev agent reads the approved spec and gets to work.

See [Multi-agent feature spec](./multi-agent-feature-spec) for the full orchestration pattern.

## Next steps

- [Murrmure Desktop](./desktop) — install and first run
- [Why Murrmure](./why-murrmure) — the short version for stakeholders
- [How it fits together](./how-it-fits-together) — components and how they connect
- [Quick start](./quick-start) — your first review in five minutes
- **Tutorials** — build custom flows from scratch:
  - [Local preview review](./tutorials/01-local-preview-review/) — one agent, localhost feedback loop
  - [Multi-agent brief](./tutorials/02-multi-agent-brief/) — three agents + trigger
  - [Daily brief trigger](./tutorials/03-daily-brief-trigger/) — button wakes an agent
- [Shell UI routes](./shell-routes) — observer screens inside Desktop
- [Connect your agent](./agents-mcp)
- [CLI](./cli)
