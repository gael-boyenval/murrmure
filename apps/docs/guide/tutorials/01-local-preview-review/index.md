# Tutorial 1b — Feature spec, build, live review, commit

Build a real workflow on a static site repo with **Cursor** as the agent. One human attaches a **spec from their computer**; the agent writes it into the repo, implements, loops on **live review in one long agent session**, then **archives** the spec and **commits**.

::: tip New to Murrmure?
Start with **[Tutorial 1a — First flow (v3)](../01-local-preview-review-v3/)** (3 parts: Desktop + space, two-step flow, run internals). Return here for the full build/review/archive/commit loop.
:::

**Canonical reference:** [`examples/flows/preview-review-v2/.mrmr/`](../../../../examples/flows/preview-review-v2/.mrmr/) — compare your tree to this layout throughout the tutorial.

## What you will learn

- What a **space** is (repo + `agent.md` + skills + `.mrmr/`)
- **Murrmure protocol** vs **agent layer** (thin graph vs prompts + skills)
- **Mixed orchestration** — shell handlers + nested build/review loop under **`build`**
- **`murrmure_resolve_step`** and **`mrmr step resolve`** — agent completes **`build.build-loop`**; engine opens **`build.review`**
- **Space handlers** in `.mrmr/space/handlers.yaml` keyed by **`contract_keys`**
- Custom **step views** in ViewCanvasHost

## Story → steps

| # | Beat | Murrmure step | Defined in |
|---|------|---------------|------------|
| 1 | Spec file from disk | **intake** | intake view |
| 2 | Agent writes `specs/current/` | **write_spec** | handler prompt + `agent.md` |
| 3 | Agent codes + review loop | **build** (parent) | handler prompt + `skills/feature-build/SKILL.md` |
| 3a | Agent reports preview URL | **build.build-loop** | `murrmure_resolve_step` |
| 4 | Human live review | **build.review** | review view (engine opens) |
| 4b | Feedback (same agent session) | *(goto build-loop)* | agent fixes → resolve build-loop again |
| 5 | Human validates | → **archive** | `complete: parent` on build |
| 6 | Move spec → archive | **archive** | handler prompt + `agent.md` |
| 7 | Git commit + summary | **commit** | handler prompt + `agent.md` |

```text
intake → write_spec → build
                         ├─ build-loop ──goto──► build.review
                         └◄──── goto build-loop (feedback) ────┘
                      complete parent → archive → commit
```

## Who owns the feedback loop?

| Pattern | Who loops | This tutorial |
|---------|-----------|---------------|
| **Flow-owned** | Engine re-invokes build each round | No |
| **Agent-owned (nested)** | One **build** handler; agent resolves **build.build-loop**; engine opens **build.review** | **Yes** |

The flow never re-dispatches the **build** handler on feedback. `changes_required` uses **`continue: parent` + `goto: build-loop`**; the agent already running fixes locally. The handler uses **`kill_on: step.resolved`** so the subprocess ends when parent **build** completes.

## Data the human passes vs agent discovery

| Source | Fields | Who consumes |
|--------|--------|--------------|
| **Intake** (human) | `spec_filename`, `reviewer`, spec **artifact** | Flow params + step workdir |
| **Build-loop output** | `preview_url`, … | Review view iframe via `steps.build.build-loop.output` |
| **Preview URL** | Discovered by agent (dev server, port, hostname) | Agent → `resolve_step(build.build-loop, completed, …)` |

No `preview.local.yaml` and no preview URL at intake — the agent discovers whatever URL works locally and reports it in step output.

| Spec path | When |
|-----------|------|
| Human's disk | Attached at intake (artifact slot) |
| `specs/current/` | Agent writes on **write_spec** |
| `specs/archive/` | Agent moves on **archive** |

## Pages (follow in order)

1. [Create the repo](./01-create-the-repo)
2. [Setup wizard — MCP and skills](./02-setup-wizard)
3. [Agent layer — `agent.md` and space skill](./03-agent-md-and-skills)
4. [Space handlers — `handlers.yaml`](./04-prompt-triggers)
5. [Flow manifest — nested build block](./05-flow-manifest)
6. [Build the views](./06-build-views)
7. [Index and apply](./07-index-and-apply)
8. [Run the loop](./08-run-the-loop)
9. [Troubleshooting](./09-troubleshooting)

## Prerequisites

Node.js 20+, Murrmure Desktop, `@murrmure/cli`, Cursor with CLI (`cursor agent`), Murrmure tools connected (`action:invoke`, `step:resolve`, `space:read`).

## Next

[Part 1 — Create the repo →](./01-create-the-repo)
