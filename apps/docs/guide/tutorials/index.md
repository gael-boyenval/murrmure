# Tutorials

Hands-on walkthroughs that teach **indexed flows** from an empty folder. You write every manifest, handler, view, and event binding yourself — no pre-built flow packages, no "clone the repo and skip ahead."

Each tutorial ends with a working workflow in **ViewCanvasHost** (custom views in the primary canvas), agent MCP grants, and `mrmr space apply`.

Follow each part in order — build every file yourself from the steps and snippets in the tutorial.

## Start here

| | Tutorial | You learn |
|---|----------|-----------|
| **1a** | [First flow (v3) — start here](./01-local-preview-review-v3/) | Desktop + space · flow · view · runs · build · cleanup (6 parts) |

**Tutorial 1a** is the only active introductory path. It covers the clean protocol end to end: launch Desktop, create a space, write a flow manifest, build a custom intake view, run and read the journal, then extend the graph with shell + agent handlers and clean up with a commit.

The earlier v2 tutorials (1b full preview-review, 2 multi-agent brief, 3 daily-brief trigger) described the removed v2 runtime (`action:invoke`, `gate:resolve`, checkpoint gates, base64 artifact upload) and were retired in the Task 15 cutover. They are preserved as a non-normative audit trail at [archives/superseded/tutorials/](../../../../studio-specs/archives/superseded/tutorials/) — do not follow them.

## Before you start

- Node.js 20+ and Murrmure Desktop (or hub at `http://127.0.0.1:8787`)
- `@murrmure/cli` — see [Quick start](../quick-start) (`mrmr setup`)
- [How it fits together](../how-it-fits-together) — two-minute architecture read

For field-by-field manifest reference after Tutorial 1a, see [Space handlers](../space-handlers) and [Space index](../space-index).

## Core concepts

Murrmure separates **who does what** from **how work is coordinated**:

| Concept | What it is |
|---------|------------|
| **Hub** | Local backend (`http://127.0.0.1:8787` with Desktop) — stores spaces, runs, journal, grants |
| **Space** | Isolated workspace (`spc_…`) — one `.mrmr/` tree linked with `mrmr space link` |
| **Flow** | Declarative graph in `.mrmr/flows/{name}/flow.manifest.yaml` |
| **Run** | One execution of a flow (`run_…`) — pauses at **human** steps until resolved via view or agent |
| **Session** | Human-visible container (`ses_…`) — title, journal, Desktop route |
| **Handler** | Space execution entry in `.mrmr/space/handlers.yaml` — bound by `on::key` (`on: step.opened::{flow_name}.{step_id}`); `contract_keys` is prompt-scope only |
| **Contract key** | Protocol address `{flow_ref}.{step_id}` used to compile handler prompt scope; dispatch uses `on::key` |
| **View** | React UI in `.mrmr/views/{id}/` — opens in **ViewCanvasHost** at human steps |
| **Grant** | Agent token (`tok_…`) — MCP tools filtered by capabilities |
| **Emittable event** | Declared hub event (e.g. `brief.published`) — triggers event handlers after apply |

**Humans** use Desktop. **Authors** use the CLI to index `.mrmr/`. **Agents** use MCP (`murrmure_resolve_step`, `murrmure_list_handlers`, `murrmure_wait_for_run`, …). All three talk to the same hub.

## Step lifecycle (clean protocol)

| Layer | Pending | Resolved |
|-------|---------|----------|
| **Human step** | Run `input-required` with an open step (`working` memo) | View or agent **`murrmure_resolve_step`** with branch + payload |
| **Agent wait** | `murrmure_wait_for_run` blocks | Run advances when human resolves |
| **Trigger delivery** | Event handler matched, delivery in flight | Terminal: handler journal entry |
| **Human view** | Buttons enabled in **ViewCanvasHost** | View `submit()` → resolve-step |

See the Tutorial 1a overview for the worked example and exact tool names.
