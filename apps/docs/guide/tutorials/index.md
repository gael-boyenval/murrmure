# Tutorials

Hands-on walkthroughs that teach **v2 indexed flows** from an empty folder. You write every manifest, handler, view, and event binding yourself — no pre-built flow packages, no “clone the repo and skip ahead.”

Each tutorial ends with a working workflow in **ViewCanvasHost** (custom views in the primary canvas), agent MCP grants, and `mrmr space apply`.

Follow each part in order — build every file yourself from the steps and snippets in the tutorial.

## Choose a tutorial

| | Tutorial | You learn |
|---|----------|-----------|
| **1a** | [First flow (v3) — start here](./01-local-preview-review-v3/) | Desktop + space · flow · view · runs · build · cleanup (6 parts) |
| **1b** | [Local preview review — full](./01-local-preview-review/) | Spec from disk · nested build/review · `resolve_step` · archive/commit (9 parts) |
| **2** | [Multi-agent brief](./02-multi-agent-brief/) | Three spaces · event handlers · cross-space query |
| **3** | [Daily brief trigger](./03-daily-brief-trigger/) | Canvas action · event · agent wake · human review |

Recommended order: **1a → 1b → 2 → 3**.

## Before you start

- Node.js 20+ and Murrmure Desktop (or hub at `http://127.0.0.1:8787`)
- `@murrmure/cli` — see [Quick start](../quick-start) (`mrmr setup`)
- [How it fits together](../how-it-fits-together) — two-minute architecture read

For field-by-field manifest reference after Tutorial 1a/1b, see [Space handlers](../space-handlers) and [Space index](../space-index).

## Core concepts (all tutorials)

Murrmure separates **who does what** from **how work is coordinated**:

| Concept | What it is |
|---------|------------|
| **Hub** | Local backend (`http://127.0.0.1:8787` with Desktop) — stores spaces, runs, journal, grants |
| **Space** | Isolated workspace (`spc_…`) — one `.mrmr/` tree linked with `mrmr space link` |
| **Flow** | Declarative graph in `.mrmr/flows/{name}/flow.manifest.yaml` |
| **Run** | One execution of a flow (`run_…`) — pauses at **human** steps until resolved via view or agent |
| **Session** | Human-visible container (`ses_…`) — title, journal, Desktop route |
| **Handler** | Space execution entry in `.mrmr/space/handlers.yaml` — bound by `on::key` (`contract_keys` is prompt-scope) or events |
| **Contract key** | Protocol address `{flow_ref}.{step_id}` used to compile handler prompt scope; dispatch uses `on::key` |
| **View** | React UI in `.mrmr/views/{id}/` — opens in **ViewCanvasHost** at human steps |
| **Grant** | Agent token (`tok_…`) — MCP tools filtered by capabilities |
| **Emittable event** | Declared hub event (e.g. `brief.published`) — triggers event handlers after apply |

**Humans** use Desktop. **Authors** use the CLI to index `.mrmr/`. **Agents** use MCP (`murrmure_resolve_step`, `murrmure_list_handlers`, `murrmure_wait_for_run`, …). All three talk to the same hub.

## v2 vocabulary (shared)

| Layer | Pending | Resolved |
|-------|---------|----------|
| **Human step** | Run `input-required` at `awaiting_human` step | View or agent **`resolve_step`** with branch + payload |
| **Agent wait** | `murrmure_wait_for_run` blocks | Run advances when human resolves |
| **Trigger delivery** | Event handler matched, delivery in flight | Terminal: handler journal entry |
| **Human view** | Buttons enabled in **ViewCanvasHost** | View `submit()` → resolve-step |

See each tutorial overview for workflow-specific states and tool names.
