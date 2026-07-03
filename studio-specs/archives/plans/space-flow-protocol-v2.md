# Space–Flow–Protocol v2 (draft)

**Status:** draft — not CI-gated  
**Captures:** 2026-06-24 architecture conversation + **2026-06-28 product/XD session** (sessions, shell, flows vs views)  
**Normative philosophy:** [current/product/philosophy.md](../../current/product/philosophy.md)  
**Aligns with:** [agent.md](../../../agent.md) phase 2 (when promoted from draft)

> **Do not implement from this file until promoted.** On conflict, [current/](../../current/) wins.

---

## 0. Reader context (for agents without chat history)

This draft records **product/architecture conversations** that refined Murrmure's finished-product shape: protocol vs flows vs spaces vs sessions vs shell UX.

It follows [desktop v1](../../archives/plans/murrmure-desktop-v1.md). It does **not** replace shipped v1 behavior.

**Read first:** [philosophy.md](../../current/product/philosophy.md)

**One-sentence product goal (2026-06-28):**

> Murrmure lets teams run coordinated AI work across shared workspaces and machines: users define spaces and flows; the protocol delivers actions and artifacts; **sessions** make cross-boundary work observable from start to finish.

**Product is NOT:** a single shipped workflow (e.g. review-loop). Review-loop is an **example flow** only.

---

## 0a. Decision summary (merged 2026-06-24 + 2026-06-28)

| Topic | Decision |
|-------|----------|
| **Murrmure role** | Communication protocol — journal, grants, invoke, artifacts, gates, audit. Never prompts, skills, models, or agent definitions. |
| **Space** | User's **root directory** with `murrmure/` config (actions, triggers, optional local flows/views). Not tied to one machine; may be a **shared git repo**. |
| **Space layers** | **Identity** (stable space) + **binding** (where it runs now — path, hub link). Reachability is separate from directory concept. |
| **Session** | **Core protocol noun** — unit of work; spans spaces; may involve multiple flows; nestable; primary live observability anchor. |
| **Flow** | **Declarative orchestration** — step graph (invoke, wait, parallel, gate). File-backed or MCP-pushed. Thin wiring — not business logic. |
| **View** | **UI layer only** — reads protocol (HTTP/SSE/MCP). Not coupled to orchestration. Optional attach to session or space home. |
| **Trigger** | Space-owned reactive wiring in `triggers.yaml`. May invoke action, **start a flow**, or **open/extend a session**. |
| **Headless invoke** | Valid (cron, one action, event chain). Must still attach to a **session** for observability when possible. |
| **Flow vs UI** | **Fully separated in spec.** Author may ship a bundle (flow + view); runtime does not require both. |
| **Orchestration editor** | **No** shell graph editor. File-first + CLI-first. Shell **visualizes** (flowchart), does not author. |
| **Live vs logs** | **Flowchart** = live feedback. **Logs** = retrieval/audit with filters — not primary live dashboard. |
| **CLI vs shell** | Shell **lists, visualizes, gates, notifies, logs**. CLI/agents **mutate** (space link, flow push, session attach). No in-app wizards for add space / add flow. |
| **Flow triggers** | Per-flow config like GitHub Actions: `manual`, `event`, `schedule`, optional `requires_view`. Shell enables only what flow allows. |
| **Agent-generated flow** | MCP push → **session-scoped** orchestration → **human gate** before bind → flowchart shows declared + live progress. Long-lived: write files + CLI push. |
| **Global flows** | Any space may host **global** flows/views (`scope: global`). **No special “catalog space type.”** Recommended pattern: one space holds shared catalog. |
| **Internal flows** | Project spaces may declare **`murrmure/flows/`** (local scope). Generalize by **moving** flow/view to another space via CLI. |
| **Landing space** | **Per-user setting** (`landing_space_id`). First created space → suggested default. **Never hub-wide default for everyone.** |
| **Notifications** | **Global** header badge + notification center + `/notifications`. Gates primary. Separate from Logs. |
| **Sessions nav** | Global **Sessions** in sidebar **+** recents on each space home. |
| **A2A protocol** | **Do not adopt as core.** Borrow lifecycle/grouping ideas. Optional future `actions.yaml` executor `a2a`. |
| **Reference repos** | Added to `projects.yaml` / `.opensrc`: A2A, Windmill, Inngest, CloudEvents, Temporal (+ existing MCP SDK). |
| **Flows in flows** | Valid future need; **deferred** |
| **Agent** | A **run**: `harness × task × context × space`. Not a Murrmure noun. |

---

## 0b. 2026-06-24 conversation (original — abbreviated)

See [philosophy.md § Conversation record](../../current/product/philosophy.md) for full user extracts.

**Arc summary:**

1. Flow package ≠ single conversation; v1 per-space install feels wrong long-term.
2. Space = directory with agent material; flow = cross-space orchestration glue.
3. Agent = harness × task × context × space.
4. Murrmure stays protocol; triggers/actions in space files; `.mrmr.temp/` + exchange store for artifacts.
5. “Strong responsibility boundary” — protocol / orchestration / implementation.

**v1 note:** Early draft said “flow installed once at hub + ACL.” **2026-06-28 refines this:** hub **indexes** flows from space directories; global vs local scope in flow manifest; ACL via grants — not a separate “install per space” product concept.

---

## 0c. 2026-06-28 conversation — sessions, shell, flows vs views

### Product framing correction

- Do **not** center product on “review loop” / J01. Terminology: **flow** (not legacy “capability” / review-loop as product).
- Product = **protocol** + ability for users to **create and run their own flows**.

### Session as core noun

**Session** = unit of work users track; protocol-owned.

- May span **multiple spaces**
- May involve **multiple flows**
- May nest **parallel branches** (e.g. two git worktrees under one parent session)
- **Observable independently** of spaces and individual flows
- Journal events, invokes, artifact transfers, gates carry **`session_id`**

**Agreed (2026-06-28):** session owns state machine progress, gate queue, execution context (worktree, preview URL, branch, artifacts). **Space** stays stable and shared across team.

**Example session (user):**

```text
sessionX
  → research space: trigger research
  → spec space: artifact lands → build plan
  → parallel in dev spaces (two worktrees):
       path A: dev → IA review → dev → user review → commit → PR
       path B: same pipeline
  → when both complete → finish flow step
```

**Session identity (open):**

- Hierarchical path ids (`session:a:b:c`) discussed for flexible grouping without rigid `parent_session_id` FK.
- Alternative: opaque hub-issued id + optional `session_path` for display/filter.
- **Not decided.** Recommendation in spec: hub-issued leaf id + optional path; prefix filter for “everything under X.”

### Flow vs trigger vs orchestration

| Layer | Question it answers | Where defined |
|-------|---------------------|---------------|
| **Trigger** | *When* does this space react? | `murrmure/triggers.yaml` |
| **Flow** | *What steps* define this class of work? | `murrmure/flows/` files or MCP push |
| **Session** | *This run* — live state | Protocol + hub |
| **View** | *How* is it shown / gated? | View package; taps API only |

**Orchestration** is behavior **inside a flow** (step graph) — not a separate product noun.

**Decisions:**

- Triggers **can start a flow**
- Triggers **alone can create a session** (if default shell session view is sufficient)
- A flow may be a **view lens** on a session (e.g. orchestrator kanban) — but **views are not flows**

### Flow vs View — hard separation

> **Orchestration declares work; the protocol records it; views project it.**

| | Flow (orchestration) | View |
|--|----------------------|------|
| **Owns** | Step graph, triggers config, invoke/wait/gate/parallel | Presentation + gate UX |
| **Coupled?** | **No** — views subscribe to session/journal | Same |
| **Authoring** | Files / CLI / MCP (session-scoped push) | View package registered separately |
| **Bundle** | Author **may** ship flow + view in one package; runtime **must not** require both |

**Shell built-in views (default product):**

- **Flowchart** — declared graph + **live progress** (running, failed, gate blocked). Parallel lanes **inside** graph.
- **Gate tabs** — when `gate.pending` (review, approve agent-pushed graph, etc.)
- **Logs explorer** — retrieval, filters — **not** live primary feedback

**Custom views:** review iframe, kanban, diagram — optional registered layers.

### Live feedback vs logs

| | Live | Logs |
|--|------|------|
| **Purpose** | Where is work now? What needs me? | What happened? Audit/debug. |
| **UI** | Session flowchart + gate tabs + global notifications | `/logs` with filters (session, space, failure, time) |
| **Analogy** | Flight tracker / GitHub Actions graph | CloudWatch / Actions log tab |

Timeline is **not** a peer live view — it is **logs**.

### CLI-first shell (no create wizards)

**Shell does not mutate spaces/flows via forms.**

| User action | Shell behavior |
|-------------|----------------|
| Add space | Sidebar `[ + ]` → `/spaces/new` — **CLI instructions** (`mrmr space init`, `mrmr space link`) + docs link |
| Add flow | Space home empty state — **CLI instructions** (`mrmr flow init`, push) + **bundled quick-start example** in CLI |
| Space/workflow appears | When hub **indexes** CLI result — not on button click |

**Work may start outside shell:** agent CLI in directory (Cursor), trigger, cron — shell **reacts** (session, notification, gate tab).

### Flow trigger modes (GitHub Actions model)

Each flow declares how it may start:

| Config | Shell behavior |
|--------|----------------|
| `on: manual` | **Run** on flow row / from flowchart when permitted |
| `on: event` | No manual run; show “Triggered by …” + link to logs |
| `on: schedule` | Show schedule / last run; manual only if also allowed |
| `requires_view: <view_id>` | **Run** opens view first (params), then creates session |

Some flows need a **specific view as trigger**; others start from flowchart or CLI.

### Agent-generated orchestration (MCP)

```text
Agent → MCP push orchestration (session-scoped)
     → human gate (validate graph)
     → on approve → graph binds to session
     → flowchart: declared + live progress
Long-lived → agent writes files → mrmr flow push (normal path)
```

### First-run and landing

- First open: sidebar **empty**; `[ + Add space ]` in sidebar + main empty state.
- **First space created** → suggested **landing space** (user default).
- Any space: **⋯ → Use as default** (only one active default per user).
- App opens on user's **landing space home** next launch.

**Account vs local-first:** “After creating an account” maps to **first hub bootstrap** in v1; same UX when cloud auth arrives.

### Notifications (global)

- **Header:** `Needs you (n)` — always **global** (cross-space).
- **Notification center** — dropdown, recent actionable items.
- **Dedicated page** `/notifications` — filters (Needs you, All, Failures, By space), open/dismiss.
- **Sidebar space badges** — optional hint derived from same queue (filtered per space).
- **Logs** — separate route; not the notification inbox.

**Notification types (protocol-driven):**

- **Gate pending** (primary)
- Session failed / completed (optional, assignee/watcher)

### Space home (built-in default view)

When user has not installed a custom default view for a space:

```text
Space: frontend
├── Local flows        (murrmure/flows/ in this space, scope: local)
├── Participating in   (global flows whose steps reference this space)
├── Can run            (flows user may trigger via grants)
└── Recent sessions    (this space)
```

- **Expand flow** → read-only flowchart + description + required grants + spaces touched + loops/gates; **click block → meta drawer**.
- **Run** → only if flow config allows manual (or via required view).
- Empty sections hidden. `[ + ]` → CLI instructions only.

**Custom default view:** user-provided view may replace layout; recommended to still list/trigger flows unless intentionally different.

### Space roles (conventions — not space types)

Same directory model; roles overlap on one path:

| Role | Purpose |
|------|---------|
| **Landing** | Where app opens — **per-user** preference |
| **Catalog** (convention) | Space that hosts **`scope: global`** flows/views — **recommended pattern**, not required type |
| **Project** | Code, actions, triggers, optional local flows |

Solo dev: one space = all three. Team: landing may differ from catalog space.

**No “catalog role” in ACL.** Global flows are files with `scope: global` + grants.

### ACL (draft)

Per **user × space** (and per-flow where needed):

| Level | Can |
|-------|-----|
| **hidden** | Space absent from sidebar |
| **read** | See space, sessions (subject to session rules), logs if allowed |
| **trigger** | Start flows granted for this user |
| **write** | Change actions, triggers, push local flows/views |

Flow-level **`flow.trigger`** grant possible without space write.

Catalog/global flows: most users **trigger**; fewer **write**.

**Open:** hub-wide `hub.admin` vs per-space admin only (#15 below).

### A2A comparison (2026-06-28)

**Do not build Murrmure on A2A.**

| Borrow | Reject as core |
|--------|----------------|
| Context/task grouping → **session** | Agent Cards / agent-as-peer |
| Task lifecycle states | SendMessage-as-primary API |
| Parallel work under one context | Agent discovery model |
| Artifact patterns | |
| “Protocol not framework” + MCP complementarity | |

Optional later: `actions.yaml` executor **`a2a`** for external agents.

**opensrc references** (see repo `projects.yaml`): `a2aproject/A2A`, `windmill-labs/windmill`, `inngest/inngest`, `cloudevents/spec`, `temporalio/temporal`.

| Reference | Read for |
|-----------|----------|
| GitHub Actions | Runs UX, manual/event/cron triggers |
| Windmill | Space scripts, triggers, flows, approvals |
| Inngest | Event-driven runs + observability |
| CloudEvents | Journal envelope shape |
| Temporal | Orchestration, signals/gates, parallel forks |

---

## 0d. What v1 already has (cross-reference)

| Target concept | v1 artifact | Gap |
|----------------|-------------|-----|
| Session | `instance_id`, review session | Not first-class cross-space; rename/evolve to session |
| Cross-space ask | `query_ask` / `query_answer` | Reads only; no invoke + artifact passthrough |
| Wake / invoke | `mcp_wake` + `wake_label` | No space-owned action registry |
| Gates | checkpoints | Aligns |
| Flow + UI bundle | FDK per-space install | Split view vs orchestration; index from directories |
| Journal / audit | hub architecture | Aligns |
| Triggers | hub DB + Configure | → `triggers.yaml` in space |
| Shell | review canvas, runtime tail | → sessions, flowchart, notifications, logs |

---

## 0e. Source of truth hierarchy

| Priority | Source |
|----------|--------|
| 1 | [philosophy.md](../../current/product/philosophy.md) |
| 2 | This draft |
| 3 | [hub/architecture.md](../../current/hub/architecture.md), domain specs under `current/` |
| 4 | v1 implementation |

---

## 1. Goals

1. **Legible boundaries** — protocol / flow (orchestration) / view / space implementation.
2. **Space-as-directory** — shared git workspaces; hub indexes; never owns agent content.
3. **Session-first observability** — cross-space work has one trackable run.
4. **Flows declare work; views project it** — no monolithic flow package requirement.
5. **CLI-first mutation; shell-first observation** — file-first authoring.
6. **Artifact exchange** — `.mrmr.temp/` + global exchange store.
7. **Harness-agnostic clients** — Cursor, Claude Desktop, CLI, cron, federation.
8. **Preserve v1** — evolve without breaking local-first desktop and green fixtures during migration.

---

## 2. Core nouns (finished-product target)

```text
Murrmure (protocol)
  session · journal · invoke · artifact · gate · grant · wait

Space (directory)
  actions.yaml · triggers.yaml · flows/ · views/ · .mrmr.temp/

Flow (orchestration)
  declarative step graph · trigger modes · scope: local | global

View (presentation)
  reads session/journal · gate actions · optional space default

Trigger (space)
  event | schedule → invoke | start_flow | extend_session

Agent (concept only)
  harness × task × context × space — not stored by Murrmure
```

**Spec principle:**

> Flows declare work; sessions run it; views show it; logs record it.

---

## 3. Target architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Murrmure hub (protocol)                                               │
│  sessions · journal · grants · gates · flow index · exchange store      │
│  invoke(action, space) · artifact.transfer · session.attach_flow      │
└────────────┬─────────────────────────────────────────────────────────┘
             │
   ┌─────────▼─────────┐     ┌─────────────────┐
   │ Shell (default)    │     │ CLI / MCP / agents │
   │ flowchart · gates  │     │ mutate spaces/flows│
   │ notifications·logs │     │ push orchestration │
   └─────────┬─────────┘     └─────────┬─────────┘
             │ reads                    │ writes
             └──────────┬───────────────┘
                        │
        ┌───────────────▼───────────────┐
        │ Space (directory)              │
        │  murrmure/actions.yaml         │
        │  murrmure/triggers.yaml        │
        │  murrmure/flows/  (local|global)│
        │  murrmure/views/               │
        │  .mrmr.temp/                   │
        │  agent.md (*) user-owned       │
        └───────────────────────────────┘
```

---

## 4. Shell UX specification (draft)

### 4.1 Global chrome (always present)

```text
┌─────────────────────────────────────────────────────────────┐
│ [Needs you (n) ▼]  [Logs]  …                     [profile]  │
├──────────┬──────────────────────────────────────────────────┤
│ Spaces   │  Main content                                   │
│ ● land   │                                                  │
│ ○ front  │                                                  │
│   (2)    │                                                  │
│ ○ api    │                                                  │
│ [ + ]    │                                                  │
├──────────┤                                                  │
│ Sessions │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

- **Needs you** → notification center → View all → `/notifications`
- **Sessions** → global session list (active / failed / completed)
- **Space badge** → count from global queue filtered to that space

### 4.2 Routes (draft)

| Route | Purpose |
|-------|---------|
| `/spaces/new` | CLI instructions to add space |
| `/spaces/:id` | Space home (custom default view or built-in flow list + recent sessions) |
| `/spaces/:id/flows/:flowId` | Expanded flow preview (graph + meta) |
| `/sessions` | Global session list |
| `/sessions/:id` | Live session: flowchart + gate/view tabs + collapsed event log |
| `/notifications` | Global actionable inbox |
| `/logs` | Filtered journal retrieval |

### 4.3 Session view layout

```text
Session: feature-Y
┌─ Flowchart (lanes, steps, live state) ─────────────────────┐
│  [research ✓] → [spec ●] → [lane A ◐] [lane B ◑] → [finish]│
├────────────────────────────────────────────────────────────┤
│ Tabs: [Gate: Review*] [Kanban view] …                       │
├────────────────────────────────────────────────────────────┤
│ ▸ Event log (collapsed — links to /logs?session=…)          │
└────────────────────────────────────────────────────────────┘
```

- **Gate tab** auto-focus when user arrives from notification.
- **Parallel worktrees** = lanes in flowchart, not separate top-level nav.

### 4.4 Mutation vs observation

| Operation | Interface |
|-----------|-----------|
| `space init/link` | CLI |
| `flow init/push` | CLI |
| `session attach orchestration` (agent) | MCP + human gate |
| Start session (manual flow) | Shell (if flow allows) or CLI |
| Approve gate | Shell |
| Browse logs | Shell |

---

## 5. Worked scenarios

### 5.1 Morning brief (multi-space flow)

Unchanged intent from 2026-06-24 — now framed as **session** with flowchart + gate tab for aggregate approval.

### 5.2 Cursor dev → review pops in

```text
1. Dev runs agent in space directory (CLI/Cursor) — no shell action
2. Agent creates/extends sessionX, attaches sub-path for worktree A
3. Agent or flow step requests human review → gate.pending
4. Header Needs you (1) → user opens session → Review gate tab
5. Flowchart shows lane A at “user review” step (live)
6. User approves → journal → agent continues
```

Orchestration may come from **session-scoped MCP push** (gated) or **local flow file** — not from shell editor.

### 5.3 Backend → frontend (trigger chain)

Event → trigger → invoke → artifact → next space trigger. **Session** correlates chain even without declared flow graph (flowchart may show inferred progress later — **deferred**).

### 5.4 Move local flow to global

```text
1. flow lived in project space murrmure/flows/feature-pipeline (scope: local)
2. Team generalizes → move directory to catalog space + set scope: global
3. mrmr flow push / space apply
4. Other spaces see under “Can run” or “Participating in”
```

Same pattern for **views**.

---

## 6. Wire concepts (draft — not implemented)

### 6.1 Space scaffold

```text
my-space/
  agent.md                 # USER — Murrmure never reads for config
  skills/                  # USER
  .cursor/ | mcp.json      # USER harness
  src/ | docs/
  murrmure/
    space.yaml             # optional: slug, tags
    actions.yaml
    triggers.yaml
    flows/                 # optional
      my-local-flow/
      shared-review/       # scope: global in flow.manifest
    views/                 # optional view packages
  .mrmr.temp/
    inbox/
    outbox/
```

### 6.2 Flow manifest (orchestration)

```yaml
# murrmure/flows/my-flow/flow.manifest.yaml (illustrative)
name: feature-delivery
scope: local | global
triggers:
  manual: true
  events: []
  schedule: null
  requires_view: null | review-panel
steps:
  # declarative graph — invoke, parallel, gate, wait
```

Views reference **`view_id`**; not embedded in step logic.

### 6.3 Session (protocol sketch)

```http
POST /v1/sessions
GET  /v1/sessions/{session_id}
GET  /v1/sessions/{session_id}/graph   # declared + live overlay for flowchart
POST /v1/sessions/{session_id}/orchestration/attach   # MCP; requires gate if agent-origin
```

Journal events include **`session_id`** (and optional **`session_path`**).

### 6.4 Action invoke, triggers, artifacts

See §4.2–4.5 in prior draft (unchanged intent): `actions.yaml`, `POST …/invoke`, `triggers.yaml`, `mrmr.artifact/v1`, `.mrmr.temp/`, `~/.murrmure/exchanges/`.

Replace `correlation_id` with **`session_id`** where applicable.

### 6.5 Flow index (hub)

Hub indexes flows from **all linked spaces**:

```text
{ flow_id, space_id, scope: local|global, digest, triggers, grants[] }
```

No separate “install per space” UX — **`mrmr flow push`** + **`mrmr space apply`** refresh index.

ACL: **hidden | read | trigger | write** on space; **flow.trigger** on flow.

---

## 7. Gap analysis (v1 → target)

| Area | v1 | Target |
|------|-----|--------|
| Unit of work | instance / review session | **session** (cross-space) |
| Flow packaging | per-space install + bundled UI | indexed flows; **scope local/global**; **view split** |
| Shell | review canvas, event tail | flowchart, notifications, logs, sessions nav |
| Create space/flow | partial UI | **CLI-only** + instruction pages |
| Orchestration author | FDK bundle | files + MCP session attach + gate |
| Triggers | hub DB | `triggers.yaml` |
| Observability | event tail | flowchart (live) + logs (retrieval) |
| Landing | default space env | **per-user landing_space_id** |

---

## 8. Proposed slices (when promoted — not now)

### Slice A — Docs & types

- [x] philosophy.md
- [x] This draft (2026-06-28 update)
- [ ] Session + view/orchestration split in `current/product/spec.md`
- [ ] Zod: session, `mrmr.artifact/v1`, flow manifest `scope`

### Slice B — Space directory index

- `mrmr space init | link | apply`
- Hub indexes actions, triggers, flows, views

### Slice C — Session protocol

- `session.create`, journal linkage, session list/get
- Default shell session + flowchart (read-only)

### Slice D — Action invoke + artifacts

- Same as prior draft slices C/D

### Slice E — Flow index + trigger modes

- Global/local scope; manual/event/schedule
- Shell flow list sections; expand preview

### Slice F — Views registry

- View packages decoupled from flows
- Gate tabs + optional custom views

### Slice G — MCP session orchestration attach + gate

- Agent push → human validate → bind graph

### Slice H — Notifications + logs routes

- Global Needs you, `/notifications`, `/logs` filters

### Slice I — Federation + external executors (incl. optional A2A)

---

## 9. Explicitly deferred

| Item | Notes |
|------|-------|
| Flows triggering flows | Cycle detection, ACL inheritance |
| Inferred flowchart from journal only (no declared graph) | Useful for trigger-only chains |
| Orchestration editor in shell | Rejected — file/CLI first |
| Session path identity rules | path vs opaque id |
| Cloud account auth | Local bootstrap first |
| Cron UI | Protocol in triggers; shell read-only |
| Flow marketplace | Out of scope |

---

## 10. Open questions

| # | Question | Status |
|---|----------|--------|
| 1 | Space path binding: `spc_*` → filesystem path | Open |
| 2 | Session id: path-as-id vs opaque + `session_path` | Open |
| 3 | Hidden space: session visible with redacted steps vs fully hidden vs visible if gate assignee | **Open** (grill #13) |
| 4 | Global flow expand: need **read** on catalog space or only **flow.trigger**? | **Open** (grill #14) |
| 5 | **hub.admin** vs per-space admin only | **Open** (grill #15) |
| 6 | Failure UX: session Failed row + space badge — sufficient? | Open |
| 7 | Flows triggering flows | Deferred |
| 8 | `.mrmr.temp` GC / inline size threshold | Open |
| 9 | Remote space without local path (index-only) | Open |

---

## 11. Success criteria (when plan executes)

- PR checklist: “protocol / flow / view / space implementation?”
- CLI quick-start creates space + minimal flow; shell lists both without UI wizards
- Session spans two spaces; flowchart shows live progress; gate in notification center
- Agent MCP attach orchestration blocked until human gate approves
- View (review panel) attaches to session without owning graph
- Logs filtered by session; live UX does not depend on log tail
- No API field for model name, skill content, or system prompt storage
- v1 fixtures stay green during migration (or explicit migration slice)

---

## 12. Related artifacts

| Artifact | Relevance |
|----------|-----------|
| [philosophy.md](../../current/product/philosophy.md) | Normative intent |
| [product/spec.md](../../current/product/spec.md) | **Stale** — review-loop centric; replace with session/flow/view model |
| [flow-runtime/spec.md](../../current/flow-runtime/spec.md) | v1 per-space mount — migrate to index model |
| [triggers/spec.md](../../current/triggers/spec.md) | v1 delivery plane |
| [desktop/spec.md](../../current/desktop/spec.md) | Single-URL shell host |
| [A2A Protocol](https://a2a-protocol.org/latest/#how-a2a-works-with-mcp) | Reference only |
| Repo `projects.yaml` | opensrc reference repos |
