# Tutorial 1b — Feature spec, build, live review, commit

Build a real workflow on a static site repo with **Cursor** as the agent. One
human attaches a **spec from their computer**; fresh parent and child
assignments coordinate implementation and live review, then archive the spec
and commit.

::: tip New to Murrmure?
Start with **[Tutorial 1a — First flow (v3)](../01-local-preview-review-v3/)** (6 parts: Desktop + space, flow, view, runs, build, cleanup). Return here for the full build/review/archive/commit loop.
:::

Follow each part in order — every manifest, handler, and view is built step by step in this tutorial.

## What you will learn

- What a **space** is (repo + `agent.md` + skills + `.mrmr/`)
- **Murrmure protocol** vs **agent layer** (thin graph vs prompts + skills)
- **Mixed orchestration** — shell handlers + nested build/review loop under **`build`**
- **`murrmure_open_child_step`** + **`murrmure_resolve_step`** — parent yields to one child and resumes with its result
- **Space handlers** in `.mrmr/space/handlers.yaml` keyed by **`contract_keys`**
- Custom **step views** in ViewCanvasHost

## Story → steps

| # | Beat | Murrmure step | Defined in |
|---|------|---------------|------------|
| 1 | Spec file from disk | **intake** | intake view |
| 2 | Agent writes `specs/current/` | **write_spec** | handler prompt + `agent.md` |
| 3 | Agent codes + review loop | **build** (parent) | handler prompt + `skills/feature-build/SKILL.md` |
| 3a | Agent reports preview URL | **build.build-loop** | `murrmure_resolve_step` |
| 4 | Human live review | **build.review** | review view (parent opens) |
| 4b | Feedback | parent resumes | fresh assignment opens build-loop again |
| 5 | Human validates | parent resumes → **archive** | parent resolves its own completed branch |
| 6 | Move spec → archive | **archive** | handler prompt + `agent.md` |
| 7 | Git commit + summary | **commit** | handler prompt + `agent.md` |

```text
intake → write_spec → build
                         ├─ yield → build-loop ──resume─┐
                         ├─ yield → review ──────resume─┤
                         └─ parent decides next ◄───────┘
                      parent resolve → archive → commit
```

## Who owns the feedback loop?

| Pattern | Who loops | This tutorial |
|---------|-----------|---------------|
| **Sibling-routed** | Child branches choose sibling steps | No |
| **Parent-owned (nested)** | Fresh **build** assignment chooses one child after every return | **Yes** |

Every child activation yields **build**, revokes that assignment, and dispatches
the child. Child return creates a fresh parent assignment with canonical
`returned_child`; the parent opens the next child or resolves itself.

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
