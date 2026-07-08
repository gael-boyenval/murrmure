# Tutorial 1 — Feature spec, build, live review, commit

Build a real workflow on a static site repo with **Cursor** as the agent. One human attaches a **spec from their computer**; the agent writes it into the repo, implements, loops on **live review in one long agent session**, then **archives** the spec and **commits**.

## What you will learn

- What a **space** is (repo + `agent.md` + skills + `murrmure/`)
- **Murrmure protocol** vs **agent layer** (thin graph vs prompts + skills)
- **Mixed orchestration** — shell prompts + agent-owned review loop inside **build**
- **`murrmure_complete_action`** — report preview URL while the build step is still running
- **Prompt triggers** in `actions.yaml`
- Custom **checkpoint views** in ViewCanvasHost

## Story → steps

| # | Beat | Murrmure step | Defined in |
|---|------|---------------|------------|
| 1 | Spec file from disk | **intake** | intake view |
| 2 | Agent writes `specs/current/` | **write_spec** | prompt + `agent.md` |
| 3 | Agent codes + review loop | **build** | prompt + `skills/feature-build/SKILL.md` |
| 4 | Human live review | **review** | review view |
| 4b | Feedback (same agent session) | *(inside build)* | `wait_for_gate` → fix → wait again |
| 5 | Human validates | → **archive** | flow routing |
| 6 | Move spec → archive | **archive** | prompt + `agent.md` |
| 7 | Git commit + summary | **commit** | prompt + `agent.md` |

```text
intake → write_spec → build (complete_action + wait_for_gate loop) → review ⇄ review → archive → commit
                              ↑                                              │
                              └──────── same Cursor session, not re-invoke ──┘
```

## Who owns the feedback loop?

| Pattern | Who loops | This tutorial |
|---------|-----------|---------------|
| **Flow-owned** | Engine `on_resolve` → `goto: build` (new subprocess each round) | No |
| **Agent-owned (mixed)** | One **build** invoke; agent `complete_action` + `wait_for_gate` | **Yes** |

The flow never re-invokes **build** on feedback. `changes_required` routes to **review** again; the agent already running fixes locally.

## Data the human passes vs agent discovery

| Source | Fields | Who consumes |
|--------|--------|--------------|
| **Intake** (human) | `spec_markdown`, `spec_filename`, `reviewer` | Flow params |
| **Build output** | Any JSON bag (`preview_url`, …) | Review view iframe via `steps.build.output` |
| **Preview URL** | Discovered by agent (dev server, port, hostname) | Agent → `murrmure_complete_action` |

No `preview.local.yaml` and no preview URL at intake — the agent discovers whatever URL works locally and reports it in step output.

| Spec path | When |
|-----------|------|
| Human's disk | Attached at intake |
| `specs/current/` | Agent writes on **write_spec** |
| `specs/archive/` | Agent moves on **archive** |

## Pages (follow in order)

1. [Create the repo](./01-create-the-repo)
2. [Setup wizard — MCP and skills](./02-setup-wizard)
3. [Agent layer — `agent.md` and space skill](./03-agent-md-and-skills)
4. [Prompt triggers — `actions.yaml`](./04-prompt-triggers)
5. [Flow manifest — thin graph](./05-flow-manifest)
6. [Build the views](./06-build-views)
7. [Index and apply](./07-index-and-apply)
8. [Run the loop](./08-run-the-loop)
9. [Troubleshooting](./09-troubleshooting)

## Prerequisites

Node.js 20+, Murrmure Desktop, `@murrmure/cli`, Cursor with CLI (`cursor agent`), Murrmure MCP connected (`action:invoke`, `space:read`).

## Next

[Part 1 — Create the repo →](./01-create-the-repo)
