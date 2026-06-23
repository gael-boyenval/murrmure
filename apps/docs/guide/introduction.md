# Introduction

## The problem

Coding agents are fast. Keeping a team in sync with them is not.

Today, the work happens in chat. An agent posts a link, someone replies "looks off," another person pastes a screenshot, feedback scatters across three threads, and two days later nobody can say what was actually approved — or why. Humans and agents drift out of sync. Context gets lost. There's no audit trail when it matters.

**Murrmure fixes the coordination, not the coding.** It gives humans and coding agents one shared place to review work, hand off cleanly, approve with sign-off, and keep a complete record — without everyone living in chat.

## What Murrmure is

Murrmure is a coordination layer for humans and AI coding agents:

- **A browser shell** where people review previews, leave comments, and approve work.
- **An MCP connection** that lets coding agents open sessions, request reviews, draft specs, and wait for a human decision — directly from the agent.
- **Flows** — the workflows that run on top, like review rounds and feature specs. Built-in ones get you started; you can author your own.

Everything is recorded. Every comment, handoff, and approval lands in an append-only audit trail.

## What you need depends on your role

| You are… | What you install | How you work |
|----------|------------------|--------------|
| **Reviewer / collaborator** | Nothing | In the **browser** — review the live preview, comment, approve gates |
| **Team admin** | Nothing | In the **browser → Configure** — set up spaces, flows, and agent access |
| **Agent operator** | `@murrmure/cli` from npm | Paste one config from your dashboard — your agent connects with its own scoped token |

You **don't clone a git repository** to use Murrmure — just sign up at [app.murrmure.dev](https://app.murrmure.dev/signup). You **don't use curl** for everyday work — people use the browser, agents use MCP.

## How it works

1. Your team signs in to **Murrmure Cloud** (or runs a [self-hosted hub](./self-hosted)).
2. An admin sets up **spaces** and turns on the **flows** the team needs.
3. The admin gives each agent its **own scoped access** and shares the connect config with operators.
4. People work in the **browser** — preview, comment, Finish a review, approve a gate, publish a spec.
5. Agents connect via **MCP** — they open sessions, draft specs, and wait for a human to hand the work back.

**Want custom workflows?** See the [Flows tutorial](./flows-tutorial) — author your own, ship it to your hub, and evolve it to live without downtime.

> Optional: `@murrmure/cli` for CI scripts. Not needed for day-to-day work.

## A typical review afternoon

1. An agent finishes a change and opens a **review session** with a live preview link.
2. You open the link in your browser, comment right on the preview, and click **Finish review**.
3. The agent gets **structured feedback**, applies the fixes, and opens the next round.
4. The session reaches **converged**. The audit trail shows exactly who approved what.

## A typical feature-spec flow

1. An agent drafts a spec, section by section.
2. You open the **spec canvas** in your browser and **Publish** (or approve a gate).
3. Publishing fires an event that can automatically **wake a downstream agent** — no human re-prompting.
4. The dev agent reads the approved spec and gets to work.

See [Multi-agent feature spec](./multi-agent-feature-spec) for the full orchestration pattern.

## Next steps

- [Why Murrmure](./why-murrmure) — the short version for stakeholders
- [How it fits together](./how-it-fits-together) — components and how they connect
- [Quick start](./quick-start) — your first review in five minutes
- **Tutorials** — build custom flows from scratch:
  - [Local preview review](./tutorials/01-local-preview-review/) — one agent, localhost feedback loop
  - [Multi-agent brief](./tutorials/02-multi-agent-brief/) — three agents + trigger
  - [Daily brief trigger](./tutorials/03-daily-brief-trigger/) — button wakes an agent
- [Flows tutorial](./flows-tutorial) — full FDK reference
- [Browser app](./browser) — every screen and route
- [Connect your agent](./agents-mcp)
- [Multi-agent feature spec](./multi-agent-feature-spec)
