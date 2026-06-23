# Tutorial 1 — Local preview review

One coding agent and one human reviewer collaborate through a **custom** flow named `preview-review` (built from scratch with `@murrmure/cli`, not bundled `review-loop`).

The agent opens a review session for a localhost preview URL, waits for human feedback, applies updates, and loops until the workflow is complete.

## Tutorial goal

Build and run a minimal communication loop on a local self-hosted hub:

- Agent opens session with `preview_url`
- Human approves or requests changes from canvas
- Agent waits on Murrmure handoff state and reacts
- Loop repeats until terminal resolution

## How to use this tutorial

Follow the parts in order and treat each as a checkpoint:

1. **Part 1** creates the flow contract, tools, strict React UI, and server routes
2. **Part 2** publishes the flow and wires auth + MCP connectivity
3. **Part 3** runs the live human-agent review loop and validates completion semantics

## What you will build

| Piece | Role |
|-------|------|
| **`preview-review` flow** | Contract + MCP tools + minimal review canvas |
| **One sandbox space** | Holds the live install and runtime instances |
| **One worker grant token** | Auth for the coding agent MCP connection |
| **One localhost preview URL** | The page the human reviewer checks each round |

## Pending vs resolved model (read first)

Murrmure coordination has **two separate status layers** in this tutorial: contract state and wait response status.

### Contract states (instance lifecycle)

| Contract state | Meaning | Who acts next |
|----------------|---------|---------------|
| `pending_review` | Waiting for a human decision in canvas | Human |
| `pending_agent` | Human asked for changes; waiting for code update signal | Agent |
| `resolved` | Terminal review completion | Nobody |

### Wait response (`wait_for_human_review`)

| Wait response | When returned | Payload meaning |
|---------------|---------------|-----------------|
| `status: "pending"` | Human has not acted yet while instance is in `pending_review` | Keep waiting |
| `status: "resolved", outcome: "changes_required"` | Human clicked **Request changes** | Wait call resolved, but workflow is **not done** (`pending_agent`) |
| `status: "resolved", outcome: "validated"` | Human clicked **Approve** | Wait call resolved and workflow is done (`resolved`) |

### What "done" means

The workflow is done **only** when:

1. contract state is `resolved`, and
2. last human outcome is `validated`.

If wait resolves with `changes_required`, that means a handoff occurred, not completion.

## Pages in this tutorial

1. [Part 1 — Scaffold `preview-review`](./01-scaffold-flow)
2. [Part 2 — Install and connect](./02-install-and-connect)
3. [Part 3 — Run the feedback loop](./03-run-feedback-loop)

## Prerequisites

- Node.js 20+
- [Self-hosted hub](../../self-hosted) and shell running locally
- A sandbox space (for example `spc_ui_sandbox`)
- `@murrmure/cli` for building (`init` also scaffolds `@murrmure/flow-dev-kit`)
- `@murrmure/cli` for agent runtime
- A local app preview URL (for example `http://127.0.0.1:5173`)

## Next

[Part 1 — Scaffold `preview-review` →](./01-scaffold-flow)
