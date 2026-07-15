# Murrmure product philosophy

**Status:** normative intent (2026-06-24, updated 2026-07-03)  
**Origin:** architecture conversations — responsibility boundaries for protocol, sessions, flows, views, and spaces.  
**Draft evolution plan:** [archives/plans/space-flow-protocol-v2.md](../../archives/plans/space-flow-protocol-v2.md) (full 2026-06-28 detail)  
**Implementation baseline:** v1 hub + flows + desktop (see [§ Relationship to v1](#relationship-to-v1-implementation-honest-gap))

---

## North star (non-negotiable — 2026-07-03)

> **Murrmure is an agentic operating system.** Spaces, flows, agents, hooks, and gates are the kernel. **Custom views are the primary human interface.**

| Surface | Role |
|---------|------|
| **Custom view** (`.mrmr/views/`) | **The product.** Full-screen (or full primary-region) UI authored per workflow — preview, review, brief editor, daily dashboard. Hides or replaces generic shell chrome. This is what users build and what end users live in. |
| **Shell chrome** (space home, flowchart, notifications, gate inbox, settings) | **Admin / operator mode.** Observe runs, debug, and manage spaces and grants. Unbound human steps are visible but expose no synthesized resolve form. |

**Hard rules for all design and implementation:**

1. **Views are not “optional polish” or param drawers.** They are the goal of the app.
2. **Building custom views that take over the UI is success**, not a advanced feature.
3. **The default shell is for admins and operators**, not a substitute for domain UI.
4. Protocol (sessions, runs, gates, invoke, artifacts) stays in the hub; **presentation is 100% the view bundle** at gates and human checkpoints.
5. Retired worker-install paths are gone; **space-directory views + ViewCanvasHost** carry the same full-canvas ambition without a second product inside the product.

If a feature ships built-in resolver forms or a narrow side drawer, **it violates this north star.**

---

## One sentence

> **Murrmure is an agentic operating system: the protocol coordinates agents across spaces; custom views are how humans interact with that work.**

Murrmure is a **communication protocol** hardened for cross-team, cross-agent, cross-boundary workflows — the **kernel** of the OS, not the whole UI. **Review-loop and similar bundles are example flows, not the product definition.**

**Product goal:**

> Teams run coordinated agentic work across spaces and machines. Authors ship **flows + views**; humans spend their time **inside custom views**; operators use shell admin surfaces when needed.

**Layer model:**

| Layer | One-line role |
|-------|----------------|
| **Murrmure (protocol)** | Sessions, journal, grants, invoke, artifacts, gates, audit |
| **Flow** | Declarative **orchestration** — step graph for a workflow class (thin wiring) |
| **View** | **Presentation only** — reads protocol; gates and custom UI; not coupled to flow |
| **Space** | User's directory — actions, triggers, optional local/global flows and views |
| **Session** | **Unit of work** — one run, cross-space, observable (core protocol noun) |

**Spec principle:**

> **Flows declare work; the protocol runs it; custom views are the human OS; shell admin surfaces observe and operate.**

That is the **responsibility boundary** we intend to hold across all future work.

---

## Conversation record (2026-06-24)

This section preserves context from the architecture discussion so agents in a new session can reconstruct intent without the chat history. See also the fuller narrative in [space-flow-protocol-v2.md §0b](../../archives/plans/space-flow-protocol-v2.md).

### Arc 1 — Flows, spaces, and what feels wrong today

**Starting intuition:** Flows are communication protocols between users and agents — agent-to-agent, across spaces and devices. Today it *feels* like a flow is tied to a space.

**Clarification reached:**

- A **flow** (as a package) is closer to a **protocol / orchestration contract** — states, events, gates, MCP tools — not a single conversation. *(2026-06-28: UI split into **views**; see Arc 8.)*
- A **running conversation** is a **session** (v1: **instance** inside a space — review session, spec draft, etc.).
- In v1, flow **installs** are space-scoped (`FlowInstall.space_id`, mount registry per `(space_id, flow_id)`). That packaging drives the “flow belongs to a space” feeling — but it is **not** the long-term model.

**Space as directory (user's model):**

> “I create directories. In that directory, I set `agent.md`, skills, MCP, etc. … and code source if the project is about code, markdown if it's knowledge base. That to me is a space. In a space lives agent definitions, skills, etc. Spaces and agents are very tightly coupled. The fact that the space uses a Pi agent, Cursor agent, or Claude is an implementation detail.”

**Flow as cross-space glue (user's model):**

> “A flow can be used to make multiple spaces connect/work together. For example a flow can be run from an orchestrator space, ask questions or trigger tasks within another space, then come back to user for validation.”

**Assessment:** Directionally correct. v1 has building blocks (`query_ask`, triggers, gates, federation sketch) but **center of gravity is inverted** — flow is installed *inside* each space; cross-space is a side feature, not the main story.

---

### Arc 2 — Agent definition refined

Initial coupling “space ≡ agent” was refined:

> “An agent is just a given harness (Pi, Cursor), a given task (dev, review), using a given context (prompt, skill to use), in a given directory (or space).”

So:

```text
agent run = harness × task × context × space
```

| Factor | Examples | Murrmure owns? |
|--------|----------|----------------|
| Harness | Cursor, Claude Desktop, Pi, shell, cron | No |
| Task | dev, review, email, research, standup | No (flow may pass task name as opaque param) |
| Context | prompt, skills | **Never** — outside Murrmure config |
| Space | workspace directory | User owns content; Murrmure indexes path + ACL |

**Pushback noted (compatible with philosophy):** one space may later host **multiple agent roles** (e.g. reviewer vs implementer) via subdirs like `agents/reviewer/` — does not require space ≡ single agent.

---

### Arc 3 — Flow as plugin; any space may orchestrate

> “Flow should be installed as a plugin, and then spaces are given access to it or not.”

> “Any space, given the right grant and flow, can trigger an agent task (with feedback) to a given space (directory) and expect a response.”

**Orchestrator patterns:**

- Parent directory as orchestrator is **one** valid layout — **not required**.
- In the final form, the orchestrator “could live on an entirely different computer” (federation / remote hub).

**Examples discussed in detail:**

| Flow kind | Behavior |
|-----------|----------|
| **Generic** | “User review that URL works” — callable against **any** web-dev-related space that has the action + grant |
| **Specific** | “Morning talk”: general-purpose space/agent → task-manager space → email-manager space → researcher space → flow **displays all answers to user** → on validation → emails drafted, calendar updated |

Generic vs specific is the **same mechanism** (flow plugin + space ACL + invoke/response); only the flow contract differs.

---

### Arc 4 — Murrmure stays the protocol; never defines agents

> “Murrmure should stay the communication protocol, always. Never the one who defines agents — entirely left to the user, and outside of Murrmure config.”

> “Murrmure should be model/agent agnostic. Claude Desktop app should be able to trigger flow, wake Cursor agent somewhere to do a job.”

**Triggers in this model** (connecting to earlier v1 work):

> “When we talked about triggers, that was that — the ability to go into a space and trigger a CLI agent to wake it. Hub can do that with cron-like automation, or when asked by a flow.”

But triggers should **not** become Murrmure-owned agent configuration:

> “Triggers should probably be config files within a space.”

**Line drawn:**

| Murrmure | User / space |
|----------|----------------|
| Route signal reliably (dedup, log, retry, gate) | Define what runs when woken |
| Invoke action `X` in space `S` with params | Map `X` → script / Cursor / Pi / MCP hook |
| Validate response **shape** (protocol) | Validate response **meaning** (business) |

Analogy used in conversation: Murrmure is **“Postgres for agent coordination”**, not LangChain.

---

### Arc 5 — Actions: Murrmure invokes; space owns execution

> “Triggers should be defined as: there is an action called X that should live in that space, but the user should be responsible to define what X executes — like parameters pass action X such Y prompt/task and require Y response. Murrmure should have the ability to cd in the right space, trigger the action. The action definition is owned by the space.”

**Contract split:**

**Murrmure declares (protocol):**

- Action **`X`** is registered in space **`S`**
- Caller may **invoke** `X` with **params** `{ task, prompt, … }` — opaque bytes on the wire
- Optionally **require response** matching shape **`Y`**, or event, or gate
- **`cd` to space root** and **fire the hook** — delivery, timeout, dedup, audit

**Space declares (implementation):**

- What **`X` actually runs** when invoked
- All prompts, skills, model choice

Analogy: Murrmure = **systemd** (unit name, env, deps, logging); space = **unit file + binary**.

---

### Arc 6 — Payloads: inline vs files

> “Murrmure will make payload transit across spaces. When that's only short text, it can be in the response object. But Murrmure should have a defined protocol for exchanging files.”

> “For example a gitignored `.mrmr.temp/` directory where exchanges happen — and a clone somewhere globally installed in case of communication failure.”

**Two-tier model agreed:**

| Tier | Use | Where |
|------|-----|--------|
| **Inline** | Short text, small JSON, IDs | Response / event body |
| **Artifact** | Files, diffs, screenshots, logs, large JSON | Exchange protocol |

**Two surfaces:**

| Surface | Role |
|---------|------|
| `{space}/.mrmr.temp/inbox|outbox/` | Local mailbox (gitignored); executors read/write here |
| `~/.murrmure/exchanges/{transfer_id}/` | Global staging + **failure recovery**; canonical bytes + manifest |

Same API for same-machine (hardlink/copy into inbox) vs cross-machine (hub exchange store → materialize at target). User should not need to care which path was taken.

Murrmure validates **delivery, digest, ACL, TTL** — not file semantics.

---

### Arc 7 — Synthesis and verdict

> “Murrmure is the communication protocol, safe hardened, production ready for cross teams, cross agents, cross boundaries workflows. Flows are UI + capability contract for orchestration. Spaces are the user actual implementation. I think that's a strong responsibility boundary.”

**Why this boundary was judged strong:**

1. **Legible failures** — protocol vs orchestration vs implementation
2. **Cross-boundary native** — not bolted on
3. **Harness-agnostic** — no vendor lock-in
4. **Reusable flows** — plugins with ACL, not per-space forks
5. **Production hardening** concentrates in the right layer (ACL, journal, artifacts, gates)

**Tensions to design for (not blockers):**

- Thin flow vs fat flow (flow must not become a second agent platform)
- Hub must **index** space files without **owning** agent content
- Executor must exist in space — protocol invokes, does not silently run LLM loops
- Cross-team ACL vs ergonomics (file-based grants in space may help)

---

### Arc 8 — Sessions, flows vs views, shell (2026-06-28)

**Product is not one shipped workflow.** Protocol + user-authored flows. Legacy “review-loop as product” is deprecated framing.

**Session as core noun:**

- **Session** = unit of work users track; spans spaces; may involve multiple flows; supports parallel branches (e.g. two git worktrees under one parent session).
- Owns live state: step progress, gates, execution context (worktree, preview URL, artifacts).
- Journal events, invokes, transfers, gates carry **`session_id`**.

**Flow vs view — hard separation:**

> Orchestration declares work; the protocol records it; views project it.

- **Flow** = declarative step graph (invoke, wait, parallel, gate) — file-backed or MCP-pushed. **No shell graph editor.**
- **View** = UI layer only (flowchart renderer, review panel, kanban). Taps HTTP/SSE/MCP. **Never owns orchestration.**
- Authors **may** ship flow + view in one package; runtime **must not** require both.

**Live vs logs:**

- **Flowchart** (default shell) = live feedback — declared graph + progress; parallel **lanes** inside the graph.
- **Logs** = retrieval/audit with filters — not the primary live dashboard.

**CLI-first shell:**

- Shell **observes** (list, visualize, gates, notify, logs). CLI/agents **mutate** (space link, space apply).
- No in-app wizards for add space / add flow — `[ + ]` routes show **CLI instructions**.
- Work may start outside shell (Cursor CLI, trigger, cron); shell **reacts** (session, notification, gate tab).

**Triggers and flows:**

- Triggers **can start a flow** or **create/extend a session** without a declared graph.
- Flow trigger modes (GitHub Actions model): `manual`, `event`, `schedule`, `flow_call` — declared under the single `triggers` field. Flow-level `requires_view` is removed; Views bind through the space.
- Agent may **MCP-push session-scoped orchestration** → **human gate** before bind. Long-lived flows: write files + CLI push.

**Notifications:** global header **Needs you**, notification center, `/notifications` — gates primary; separate from logs.

**Space roles (conventions, not types):** **landing** (per-user home), **catalog** (recommended space for `scope: global` flows/views), **project** (worker space). Any space may host global flows; no special “catalog role” in ACL.

See [space-flow-protocol-v2.md §0c–§4](../../archives/plans/space-flow-protocol-v2.md) for shell routes and layout detail.

---

## Responsibility boundaries

| Layer | Owns | Must never own |
|-------|------|----------------|
| **Murrmure (protocol)** | **Sessions**, events, journal, auth/grants, delivery, dedup, gates, cross-space invoke, artifact exchange, audit, federation wire | Agent prompts, skills, models, harness setup, business logic, “what X executes” |
| **Flow** | Orchestration **contract**: steps, when to call which space/action, expected response shapes, trigger modes | Space-local execution, UI, agent personality, LLM choice |
| **View** | Presentation, gate UX, read-only flowchart projection | Orchestration grammar, business logic, agent definition |
| **Space (user implementation)** | Directory: code/knowledge, `agent.md`, skills, harness config, **actions**, **triggers**, optional **flows/** and **views/** | Wire format, session lifecycle rules, federation wire |

**Decision test for any feature:** *Is this protocol, orchestration, view, or implementation?* Only the matching layer may own it.

---

## Space

A **space** is the user's **actual implementation** — conceptually a **workspace directory**, not merely a hub database row.

**User's words:** creating a directory, putting `agent.md`, skills, MCP, and project artifacts (code *or* markdown knowledge base) inside — **that is a space**. Agent definitions live there; Pi vs Cursor vs Claude is implementation detail.

Typical layout (illustrative — Murrmure indexes, does not author):

```text
my-backend-space/
  agent.md              # user-owned — Murrmure never interprets
  skills/               # user-owned
  mcp.json / .cursor/   # user-owned harness config
  src/                  # code project (example)
  docs/                 # knowledge base (alternative)
  murrmure/
    actions.yaml        # action registry: name X → local executor
    triggers.yaml       # when to invoke / start flows / extend sessions
    flows/              # optional — local or scope: global orchestration
    views/              # optional — view packages (decoupled from flows)
  .mrmr.temp/           # gitignored exchange mailbox
    inbox/
    outbox/
```

- **Space ≈ workspace boundary:** policies, ACLs, audit partition, where work lives.
- **Not tied to one machine:** teammate's clone, CI runner, or remote binding — same space identity, different host path.
- **May be a shared git repository** — team collaborates in one space directory.
- **Two layers:** **identity** (stable `spc_*`, grants) + **binding** (filesystem path / hub link on a given host).
- **Not a filesystem mapping in v1:** today `spc_*` is SQLite; target indexes linked directories via CLI.
- **Space roles (conventions):** **landing** (per-user app home), **catalog** (recommended host for global flows/views), **project** (worker). Same path may serve multiple roles; solo dev often uses one space for all.
- Any authorized space may **initiate** cross-space work (see Flows).

### ACL (draft)

Per user × space: **hidden** | **read** | **trigger** | **write**. Flow-level **trigger** grant without space write. Global flows in any space with `scope: global` — access via grants, not a special space type.

### Agent (definition)

An **agent** is not a persistent Murrmure entity. It is a **run**:

```text
agent run = harness × task × context × space
```

Which LLM or IDE runs the harness is an **implementation detail**. Murrmure remains **model- and harness-agnostic**.

---

## Session

A **session** is the **core protocol noun** for one **run of work** — what users track in the shell day to day.

| Property | Meaning |
|----------|---------|
| **Cross-space** | One session may touch many spaces |
| **Multi-flow** | May involve zero or more flows over its lifetime |
| **Parallel branches** | e.g. two git worktrees = lanes under one session (not separate spaces) |
| **Observable** | Flowchart (live), gate tabs, global notifications — independent of which space started it |
| **Protocol-owned** | `session_id` on journal, invokes, artifacts, gates |

**Contrast with v1 `instance_id`:** review session ≈ early instance model. Target elevates **session** as cross-space correlation and shell primary object.

**Headless work:** trigger-only or single invoke may create/extend a session so observability is never orphaned.

**Session identity (open):** hierarchical path ids vs opaque hub id + optional `session_path` — see [space-flow-protocol-v2.md §10](../../archives/plans/space-flow-protocol-v2.md).

### Worked example: parallel delivery (2026-06-28)

```text
sessionX
  → research space → spec space (plan)
  → parallel lanes (worktree A, worktree B): dev → review → commit → PR each
  → when both complete → finish step
```

---

## Flow

A **flow** is **declarative orchestration** — a thin step graph for a workflow class. **Not** a UI package (see Views).

**Contrast with v1:** today a flow is **installed per space** with bundled UI. Target: hub **indexes** flows from space directories (`murrmure/flows/`); **`scope: local | global`**; views registered separately.

| Property | Meaning |
|----------|---------|
| **Local flows** | Declared in a project space — repo-specific pipeline |
| **Global flows** | `scope: global` in any space — recommended catalog pattern; grants control access |
| **Generalize** | Move flow/view files to another space via CLI when local → shared |
| **Trigger modes** | Like GitHub Actions: manual, event, schedule, flow_call — under `triggers` (no flow-level `requires_view`) |
| **Initiation** | Shell (if allowed), CLI, trigger, agent MCP (session-scoped + human gate) |

Flows declare **steps and contracts**, not implementation:

- invoke action `X` in space `S` with opaque params
- require response schema, event, or human gate
- parallel, branch, wait, fail

Flows must stay **thin** — business logic belongs in space actions, not flow code.

**Agent-generated flow:** MCP may push orchestration **for current session only** → **human gate** validates graph → then binds. Long-lived: agent writes files + normal CLI push.

**Remote orchestrator:** session may span hubs via federation — orchestrator need not live on same machine as worker spaces.

### Worked example: morning brief (from conversation)

```text
1. Flow "morning-brief" started (from any space with invoke grant)
2. invoke → general-purpose space     → action: daily_checkin
3. invoke → task-manager space        → action: list_tasks
4. invoke → email-manager space       → action: summarize_inbox
5. invoke → researcher space          → action: overnight_news
6. flow view aggregates all responses → human gate
7. on approve → invoke email space    → action: draft_replies
              → invoke calendar space → action: update_events
```

Murrmure carries messages, artifacts, and gate outcomes. Each space's user defines what each action runs.

### Worked example: generic URL review

```text
Flow "review-url" + param { url: "https://…" }
  → pick any space with role: web-dev + action: review_url
  → invoke with url param
  → require { ok: boolean, notes: string }
  → gate human optional
```

Same flow; different target space depending on ACL and availability.

---

## View

A **view** is a **presentation layer** — reads session and journal state via protocol APIs. **Not coupled to any flow package.**

| View kind | Role |
|-----------|------|
| **Default shell flowchart** | Declared step graph + **live progress** (running, failed, gate). Parallel **lanes** in-graph. **Not an editor.** |
| **Gate tab** | Human validation (review, approve agent graph, etc.) when `gate.pending` |
| **Custom view** | Review iframe, kanban, diagram — registered package |
| **Space default view** | User-provided home for a space; built-in fallback lists flows + recent sessions |

**Principle:** views **project** protocol state; they do not own orchestration. Multiple views may attach to one session (flowchart always available; gate/custom tabs when active).

**Logs vs live:** `/logs` with filters (session, space, failure) is **retrieval** — not the live flight tracker. Do not duplicate flowchart as a chronological timeline tab.

---

## Shell (product UX intent)

Murrmure desktop/shell is **observer-first**, **CLI-first for mutation**.

| Shell does | Shell does not |
|------------|----------------|
| List spaces, sessions, flows (indexed) | `space init` / `space apply` wizards |
| Flowchart + gate tabs + notifications | Author orchestration graphs |
| Global **Needs you** + `/notifications` | Define agents or prompts |
| Logs explorer | Replace CLI docs |

**First run:** empty sidebar; `[ + Add space ]` → page with CLI instructions. First linked space → suggested **landing space** (per-user; **⋯ → Use as default** on any space).

**Navigation:** sidebar **Spaces** (badges) + **Sessions** (global list); space home shows local / participating / can-run flows + recent sessions.

**Landing:** always **per-user** — never one hub-wide default for all users.

Detail: [space-flow-protocol-v2.md §4](../../archives/plans/space-flow-protocol-v2.md).

---

## Triggers and actions

**Triggers** connect the protocol to space-local execution. In the clean protocol these are **event handlers** in `.mrmr/space/handlers.yaml` (`on: event: { type, source? }`) plus flow start conditions — not Murrmure-owned agent configuration:

- **Cron-like automation** (hub schedules delivery)
- **Flow step** (“call space B now”)
- **Start or extend a session** (including without a declared flow graph)
- **Start a flow** (when trigger config says so)
- **External client** (Claude Desktop POST → start flow or run a handler)
- **Journal event** (`spec.published` in space A → handler in space B)

> “Hub can do that with cron-like automation, or when asked by a flow.”

Trigger **definitions** belong in the **space** (`.mrmr/space/handlers.yaml`), not as Murrmure-owned agent configuration. Emission is via **`murrmure_emit_event`** (`event:emit` capability), gated at apply time by `.mrmr/space/events.yaml`.

### Action `X` lives in the space; execution is user-owned (legacy — HANDLER-CUTOVER)

> The clean protocol uses **handlers** (`on::key` for steps, `on: event:` for reactions) bound in `.mrmr/space/handlers.yaml`. The Action + Executor table below is the pre-cutover legacy model, retained until HANDLER-CUTOVER; new spaces use handlers only.

| Murrmure (protocol) | Space (implementation) |
|---------------------|-------------------------|
| Action name `X` registered in space `S` | `actions.yaml`: `X → ./bin/foo.sh` or harness hook |
| Invoke with params + optional `expect.response_schema` | Script/agent interprets prompt/task |
| `cd` to space root, run hook, capture stdout/JSON response | Prompts, skills, model |
| Dedup, timeout, journal, retry | Business success/failure |

**v1 partial match (historical):** the retired `mcp_wake` + `wake_label` wire approximated an action name (404, phase 16); `payload_map` ≈ params. Missing: space-owned registry, explicit response contract, `cd`+execute primitive, triggers in files — all supplied by the clean handler + `murrmure_emit_event` protocol.

**Executor registration:** something in the space must listen or be spawnable — Murrmure must not silently become the agent runtime. Open design: long-lived MCP vs one-shot CLI vs desktop watcher (deferred).

---

## Payloads and artifacts

### Inline (short text)

> “When that's only short text, it can be in the response object.”

Small JSON, IDs, summaries, short answers — directly in invoke/ask/event response bodies.

### Artifacts (files)

> “Murrmure should have a defined protocol for exchanging files … gitignored `.mrmr.temp/` … clone somewhere globally installed in case of communication failure.”

| Surface | Role |
|---------|------|
| **`.mrmr.temp/`** (per space, gitignored) | Local mailbox: `inbox/` (received), `outbox/` (to send) |
| **`~/.murrmure/exchanges/{transfer_id}/`** | Global staging + recovery: manifest, digest, TTL, payload bytes |

**Flow:** source writes to outbox or exchange store → Murrmure records manifest + ACL → materializes to target `.mrmr.temp/inbox/` → invoke passes `artifacts_in: ["xfr_…"]` → executor reads local path.

Wire ref (sketch):

```json
{
  "artifact": {
    "kind": "mrmr.artifact/v1",
    "transfer_id": "xfr_01J…",
    "digest": "sha256:…",
    "name": "openapi.diff",
    "size_bytes": 48291,
    "local_path": ".mrmr.temp/inbox/xfr_01J…/openapi.diff"
  }
}
```

**v1 partial match:** journal `blob_refs`, `blob_read`/`blob_write`, `openapi_diff_ref` in trigger payloads (ref not inline megabytes). Missing: cross-space passthrough spec, `.mrmr.temp/` protocol, exchange manifest linking flow step ↔ local path.

---

## Clients (harness-agnostic)

Any client may speak Murrmure protocol:

| Client | Example use |
|--------|----------------|
| Claude Desktop | Trigger flow; run a handler in remote space (via HTTP/MCP adapter) |
| Cursor | MCP connected to hub; reacts to events via `on: event:` handlers and `murrmure_emit_event` |
| Pi / shell | Executor for action `X` in `actions.yaml` (legacy) or handler `shell_spawn` |
| Cron / hub scheduler | Time-based trigger delivery |
| Another Murrmure hub | Federation (remote orchestrator) |
| Desktop app | Protocol server + shell; observes sessions; does not define agents |

Murrmure never stores or edits `agent.md`, skills, or prompts.

---

## What Murrmure still owns (protocol, not agent)

Even under this philosophy, the hub is not “config-free”:

| Concern | Why it stays in Murrmure |
|---------|--------------------------|
| **Sessions** | Cross-space unit of work; correlation and lifecycle |
| **Tokens & grants** | Who may invoke flows, call spaces, read artifacts |
| **Event journal & seq** | Shared truth for all clients |
| **Flow index + grants** | Which flows exist (from space files); who may trigger |
| **Delivery semantics** | handler dispatch, event emit, webhook, dedup, retry, timeout |
| **Gates** | Human validation checkpoints in the protocol |
| **Artifact manifests** | transfer_id, digest, authorized readers, TTL |
| **Audit / export** | Cross-team production requirement |
| **Default shell views** | Flowchart, notifications, logs — product observability promise |

This is **authorization + wire**, not **agent definition**.

---

## Anti-patterns

| Anti-pattern | Why |
|--------------|-----|
| Murrmure stores prompts / skills / model choice | Violates harness-agnostic boundary |
| Flow implements business logic | Becomes second agent platform |
| **Bundling UI inside flow as required coupling** | Use separate views; bundle optional for authors only |
| **Shell orchestration graph editor** | File/CLI-first; shell visualizes only |
| Flow installed independently in every space | Prefer indexed flows + scope local/global |
| Megabyte payloads inline in events | Breaks journal; use artifacts |
| Hub defines what action `X` executes | Belongs in space `actions.yaml` |
| Triggers authored only in Configure UI with agent semantics | Belongs in space files; Murrmure indexes |
| Assuming MCP always connected without executor | “Wake” with no listener |
| Murrmure runs LLM loop inside hub | Explicitly out of product scope |
| **Timeline as primary live dashboard** | Use flowchart for live; logs for retrieval |
| **Review-loop (or any one flow) treated as the product** | Product is protocol + user-authored flows |

---

## Relationship to v1 implementation (honest gap)

The **philosophy matches** kernel direction (journal, gates, blobs, triggers, `query_ask`, federation sketch, desktop single-URL). **Packaging diverges:**

| Philosophy | v1 today |
|------------|----------|
| Space = materialized directory with agent material | Space = SQLite entity (`spc_*`); agent config in Cursor/CLI |
| Flow = indexed orchestration; scope local/global | Flow **install per space** + bundled UI mount |
| View decoupled from flow | UI bundled in flow package |
| **Session** = cross-space unit of work | `instance_id` / review session only |
| Shell flowchart + global notifications + logs | Review canvas, event tail |
| CLI-first create; shell instructs | Partial configure UI |
| Triggers in space files | Triggers in hub DB + Configure UI |
| Action invoke + response contract | `mcp_wake` + `wake_label` retired (404); handlers + `murrmure_emit_event` now |
| Artifacts via `.mrmr.temp/` + exchange manifest | Hub `dataDir` blobs + `blob_refs` |
| Any client triggers flows | MCP-primary |
| Flow orchestrates cross-space as main story | Cross-space via `query_ask` + triggers; flow mostly in-space |

**Existing journey that maps to target model:** backend emits `work.ready` with `openapi_diff_ref` blob ref → trigger wakes frontend space → agent reads blob. See fixture `config/trigger-backend-frontend.json`. Target model generalizes this to action invoke + `.mrmr.temp/`.

v1 is **scaffolding toward** this philosophy, not a full realization.

---

## Deferred (explicitly not decided today)

Captured for later; **do not implement** without a new plan slice:

| Item | Context from conversation |
|------|---------------------------|
| **Flows triggering flows** | Valid need (“iron many other things … but not right now”); needs cycle detection, correlation, ACL inheritance |
| Cron scheduler UI | Protocol may support schedule; product UI later |
| Executor registration | Long-lived MCP vs one-shot CLI spawn vs desktop watcher |
| Space directory sync | `watch`, `mrmr space apply`, git hook — how hub learns space root path |
| Cross-hub artifact passthrough | XS1+; remote orchestrator on different computer |
| Flow marketplace / remote registry | Out of scope |
| Multiple agents per space | `agents/reviewer/` subdirs — compatible, not specified |
| Numeric inline size threshold | TBD (journal cap ~64 KiB for envelope) |
| Replace postMessage `hub-fetch` bridge | Optimization only; desktop same-origin helps |
| Session id encoding (path vs opaque) | 2026-06-28 |
| Hidden space visibility in shared sessions | 2026-06-28 |
| Global flow read vs trigger-only grant for expand | 2026-06-28 |
| hub.admin vs per-space admin | 2026-06-28 |
| Inferred flowchart from journal without declared graph | Trigger-only chains |

---

## External references (not adoption)

Murrmure is **not** built on [A2A](https://a2a-protocol.org/latest/) — different center of gravity (space/session vs agent peer). **Borrow:** task/context grouping, lifecycle states, parallel work, artifact patterns. **Optional later:** `actions.yaml` executor `a2a` for external agents.

**Research repos** (`.opensrc` via `projects.yaml`): A2A, Windmill, Inngest, CloudEvents, Temporal, MCP SDK — patterns for runs UX, triggers, event envelope, orchestration. See [space-flow-protocol-v2.md §0c](../../archives/plans/space-flow-protocol-v2.md).

---

## Related specs

| Doc | Topic |
|-----|--------|
| [hub/architecture.md](../hub/architecture.md) | Journal, modules, federation |
| [cross-space/spec.md](../cross-space/spec.md) | `query_ask` / `query_answer` (XS0) |
| [triggers/spec.md](../triggers/spec.md) | Event handlers + retired `mcp_wake` presets |
| [flow-runtime/spec.md](../flow-runtime/spec.md) | v1 mount registry (per-space) |
| [config/spec.md](../config/spec.md) | Configure shell routes |
| [desktop/spec.md](../desktop/spec.md) | Local single-URL desktop |
| [space-flow-protocol-v2.md](../../archives/plans/space-flow-protocol-v2.md) | Draft evolution plan |
