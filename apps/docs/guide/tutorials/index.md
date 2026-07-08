# Tutorials

Hands-on walkthroughs that teach **v2 indexed flows** from an empty folder. You write every manifest, action, view, and hook yourself — no pre-built flow packages, no “clone the repo and skip ahead.”

Each tutorial ends with a working workflow in **ViewCanvasHost** (custom views in the primary canvas), agent MCP grants, and `mrmr space apply`.

Reference implementations live under `examples/flows/*-v2/` in the Murrmure repo — use them **only to compare** after you finish a part, not as a shortcut.

## Choose a tutorial

| | Tutorial | You learn |
|---|----------|-----------|
| **1** | [Local preview review](./01-local-preview-review/) | Spec from disk · nested build/review · `resolve_step` · archive/commit (9 parts) |
| **2** | [Multi-agent brief](./02-multi-agent-brief/) | Three spaces · hooks wake · cross-space query |
| **3** | [Daily brief trigger](./03-daily-brief-trigger/) | Canvas action · event · agent wake · human review |

Recommended order: **1 → 2 → 3**.

## Before you start

- Node.js 20+ and Murrmure Desktop (or hub at `http://127.0.0.1:8787`)
- `@murrmure/cli` — see [Quick start](../quick-start) (`mrmr setup`)
- [How it fits together](../how-it-fits-together) — two-minute architecture read

For field-by-field manifest reference after Tutorial 1, see [Flows tutorial](../flows-tutorial).

## Core concepts (all tutorials)

Murrmure separates **who does what** from **how work is coordinated**:

| Concept | What it is |
|---------|------------|
| **Hub** | Local backend (`http://127.0.0.1:8787` with Desktop) — stores spaces, runs, journal, grants |
| **Space** | Isolated workspace (`spc_…`) — one `murrmure/` tree linked with `mrmr space link` |
| **Flow** | Declarative graph in `murrmure/flows/{name}/flow.manifest.yaml` |
| **Run** | One execution of a flow (`run_…`) — pauses at **human** steps until resolved via view or agent |
| **Session** | Human-visible container (`ses_…`) — title, journal, Desktop route |
| **Action** | Named invoke target in `murrmure/actions.yaml` — usually a shell script |
| **View** | React UI in `murrmure/views/{id}/` — opens in **ViewCanvasHost** at human steps |
| **Grant** | Agent token (`tok_…`) — MCP tools filtered by capabilities |
| **Hook** | Event → action mapping in `murrmure/hooks.yaml` — wakes agents after apply |

**Humans** use Desktop. **Authors** use the CLI to index `murrmure/`. **Agents** use MCP (`murrmure_invoke_action`, `murrmure_resolve_step`, `murrmure_wait_for_run`, …). All three talk to the same hub.

## v2 vocabulary (shared)

| Layer | Pending | Resolved |
|-------|---------|----------|
| **Human step** | Run `input-required` at `awaiting_human` step | View or agent **`resolve_step`** with branch + payload |
| **Agent wait** | `murrmure_wait_for_run` blocks | Run advances when human resolves |
| **Trigger delivery** | Hook matched, delivery in flight | Terminal: `success`, `failed`, or `deduped` |
| **Human view** | Buttons enabled in **ViewCanvasHost** | View `submit()` → resolve-step |

See each tutorial overview for workflow-specific states and tool names.
