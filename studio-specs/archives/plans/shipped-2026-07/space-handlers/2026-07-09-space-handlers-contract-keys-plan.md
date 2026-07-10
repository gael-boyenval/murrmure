# Plan — Space handlers, contract keys, and unified `.mrmr/`

**Date:** 2026-07-09  
**Status:** Active  
**Goal:** Decouple **flow protocol** (steps, branches, params) from **space execution** (how agents run), replace action-name coupling with **contract-key handlers**, consolidate all Murrmure repo content under **one `.mrmr/` tree** (space / flows / views / dev), and make **MCP + step contracts** the runtime discovery surface (not `briefing.md` or filesystem path lists).

**Depends on:** MCP reliability plan shipped ([archive](../mcp-reliability/2026-07-09-mcp-reliability-plan.md)) — thin `murrmure-mcp`, hub `inputSchema`, step contracts v2.2 (VS-8).

**Normative alignment:** [product/philosophy.md](../../../current/product/philosophy.md) § Arc 5 (space owns execution), § global flows, [step-contract.md](../../../current/bridges/step-contract.md).

---

## Executive summary

Three architectural debts block the cross-space, space-owned execution model:

| ID | Symptom | Root cause |
|----|---------|------------|
| **H-1** | Global flow requires action `feature_build` in every space that runs it | Flow manifest embeds `executor.action` — deployment contract in protocol graph |
| **H-2** | `executors.yaml` is boilerplate; `actions.yaml` + `hooks.yaml` overlap | Two file types, two dispatch paths, executor registry adds indirection without value for most spaces |
| **H-3** | `murrmure/` + `.murrmure/` + `.mrmr.temp/` + `briefing.md` confuse layout and discovery | Three trees, mixed formats (YAML/JSON), briefing teaches filesystem scan instead of hub protocol |
| **H-4** | Flows/views bundled under space imply space owns all protocol/UI | Global/catalog flows and portable views need separate top-level dirs + optional **bindings** |

**Agreed target (2026-07-09 conversation):**

1. **Flows own protocol only** — step ids, branches, params, nested relationships, roles (`human` / `agent` / `system`). No action names in manifests.
2. **Spaces own execution via handlers** — merged actions + hooks; subscribe to step lifecycle via **`contract_keys`** array.
3. **Contract keys** join handlers to `StepContractCatalog` entries (`{flow}.{qualified_step_id}`).
4. **Prompt assembly** uses active step slice + optional **scope slices** for multi-key handlers (single-agent-owning-subgraph case).
5. **One repo directory `.mrmr/`** — `space/` (identity + handlers + optional bindings), optional `flows/` and `views/` (local authoring), `dev/` (gitignored machine/runtime). Retire `murrmure/`, `.murrmure/`, `.mrmr.temp/`.
6. **`space.yaml` merges link binding** — `slug` + `link.space_id` + `link.host` in one YAML file; delete `link.json`.
7. **Remove briefing injection** — delete `.mrmr.temp/briefing.md` generation; MCP + handler index + step contract own runtime context.
8. **Collapse executors** — `type: shell_spawn | mcp_session | queue_poll | remote_hub` on handler; no separate `executors.yaml` for default spaces.
9. **Skills split** — **murrmure-agent** (all spaces) + **murrmure-developer** (authoring only); doctor checks presence + version per archetype.
10. **Bindings (optional)** — `space/bindings.yaml` declares flows/views consumed from local paths, catalog, or other spaces when not authored locally.
11. **Step completion modes** — handler `complete: auto | cli | explicit`; new **`mrmr step resolve`** CLI for shell-native resolve + piping.

---

## Problem — why `executor.action` breaks the model

Today (v2.2 preview-review):

```yaml
steps:
  - id: build
    executor:
      action: feature_build    # ← space must index this exact name
```

Implications:

- Flow catalog is **not portable** across spaces with different execution policies.
- Space A (one long-lived agent for `build` + nested substeps) and Space B (fresh agent per step) cannot share the same flow without duplicating action implementations under the same names.
- Cross-space orchestration is obscured: action names imply local `murrmure/actions.yaml`, not target-space index.
- Handlers for custom events (`brief.requested` → `mcp_wake`) are a **second** dispatch path unrelated to step lifecycle.

Philosophy says the opposite: *Murrmure invokes; space owns execution* ([philosophy.md](../../../current/product/philosophy.md) § Arc 5).

---

## Target architecture

### Layer diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Flow manifest (indexed — may live in catalog or worker space)            │
│   steps, branches, params, nested graph, role per step                   │
│   NO action names · NO executor refs                                     │
│   → compile StepContractCatalog on apply                                 │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ catalog entries keyed by contract_key
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Hub engine                                                               │
│   mrmr.step.opened / mrmr.step.resolved (journal)                        │
│   match handlers by contract_keys + lifecycle (on / kill_on)             │
│   assemble prompt: scope slices + active slice + handler prompt            │
│   dispatch shell_spawn | mcp_session | …                                 │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────┐                         ┌───────────────────┐
│ Space handlers    │                         │ MCP (agent)        │
│ .mrmr/space/      │                         │ list_handlers      │
│ handlers.yaml     │                         │ list_step_contracts│
│ contract_keys[]   │                         │ resolve_step       │
└───────────────────┘                         └───────────────────┘
```

### Responsibility split

| Owns | Does not own |
|------|----------------|
| **Flow** — graph, branches, schemas, routes, `graph_digest` | Prompts, commands, agent count per step |
| **Hub** — lifecycle events, matching, prompt assembly, resolve API | Business meaning of params |
| **Handler** — execution policy keyed by `contract_keys` | Step graph structure |
| **Skill** — stable Murrmure protocol knowledge | Per-step task prompts |
| **MCP** — runtime discovery (catalog, run context, health) | Local filesystem layout |

---

## Contract keys (normative)

### Format

```text
contract_key := {flow_ref}.{qualified_step_id}
```

| Example | Meaning |
|---------|---------|
| `preview-review.write_spec` | Top-level agent step |
| `preview-review.build` | Parent step with nested substeps |
| `preview-review.build.build-loop` | Nested agent substep |
| `preview-review.build.review` | Nested human substep |

- `flow_ref` = apply-time resolved flow identity (`flow_id` or `graph_digest`-qualified ref), collision-safe across catalogs and spaces.
- `flow_name` remains an authoring shorthand, but matching/indexing resolves to `flow_ref`.
- `qualified_step_id` = dot path from catalog (`step_ids` in `StepContractCatalog`).
- Keys are **protocol addresses**, not action names.

### Matching rules (runtime)

When engine emits `mrmr.step.opened` with payload `{ flow_ref, step_id, qualified_key, run_id, … }`:

1. **Exact** — handler matches if `qualified_key` ∈ `contract_keys`.
2. **Explicit multi-key** — handler lists several keys; dispatches when **active** step is any listed key (scope slices included for all keys on first dispatch of session).
3. **Prefix (deferred)** — wildcard forms stay out of v1 cutover; start exact + explicit multi-key only.

**Precedence:** longest exact match wins; at most one handler per opened step (lint enforces; runtime error on conflict).

### Apply-time index

On `mrmr space apply`, hub builds:

```text
HandlerIndex:
  handlers: [{ id, contract_keys[], type, … }]
  coverage:
    - catalog step (role=agent) → matched handler ids
    - orphan handlers (key not in any indexed flow) → warning
    - uncovered agent steps → warning (strict: error)
```

Exposed via `murrmure_space_status` extension or new `murrmure_list_handlers`.

### Authoring DX — how hard is it today?

**Hard.** `StepContractCatalog` is compiled on apply and stored on the hub index, but handler authors get almost no local help:

| Source today | Problem |
|--------------|---------|
| Flow manifest YAML | Must read branches/roles manually; `contract_key` format is derived |
| Apply stdout | One-line digest only (`catalog flw_…: abc123 (7 steps)`) |
| `murrmure_list_step_contracts` | **Runtime only** — needs `run_id`; not for static authoring |
| Doctor `HANDLER_MISSING` | Tells you what's wrong **after** apply, not while writing |

Authors guess `preview-review.build.build-loop` strings in `handlers.yaml` with no autocomplete.

### Contract codegen (apply-time)

On every successful `mrmr space apply`, emit a **local contract snapshot** under gitignored dev output:

```text
.mrmr/dev/contracts/
  catalog.json              # all bound flows → full StepContractCatalog[]
  contract-keys.json        # flat list: { key, flow_ref, step_id, role, branches[] }
```

**`catalog.json`** — machine-readable; same shape as hub index `step_contract_catalog` per flow.

**`contract-keys.json`** — author-friendly index:

```json
[
  {
    "contract_key": "flw_preview_review@abc123.write_spec",
    "flow_ref": "flw_preview_review@abc123",
    "step_id": "write_spec",
    "role": "agent",
    "branches": ["completed", "failed"],
    "artifact_slots": []
  }
]
```

`handlers.schema.json` and `murrmure-contracts.d.ts` are explicitly deferred until after cutover and only added if we have a second concrete consumer.

### CLI commands

| Command | Role |
|---------|------|
| `mrmr space apply` | index + **always** refresh `.mrmr/dev/contracts/` |
| `mrmr space handlers scaffold` | append stub handler entries for uncovered **agent** steps |
| `mrmr space handlers coverage` | table: contract_key → handler id(s) |

`mrmr space contracts` is deferred to post-cutover hardening.

`handlers scaffold` example output (merge into existing file or write `.mrmr/dev/handlers.stub.yaml`):

```yaml
  - id: write-spec          # STUB — uncovered agent step
    contract_keys:
      - preview-review.write_spec   # branches: completed, failed
    on: step.opened
    type: shell_spawn
    prompt: |
      # TODO: space-owned prompt
    command: cursor agent -p --force {{prompt}}
```

### Editor integration

- `murrmure-developer` skill documents: run apply → open `contract-keys.json` → scaffold missing handlers.
- Optional schema-driven autocomplete is deferred with `handlers.schema.json`.

### MCP (runtime, unchanged)

`murrmure_list_step_contracts` stays run-scoped for agents. Codegen is **author-time**; MCP is **run-time**. No duplication — agents use MCP; humans use `.mrmr/dev/contracts/`.

---

## Handlers file (replaces `actions.yaml` + `hooks.yaml` + `executors.yaml`)

### Path

`.mrmr/space/handlers.yaml` (v1). Migration accepts legacy `murrmure/actions.yaml` + `hooks.yaml` until cutover PR.

### Shape

```yaml
version: 1
handlers:
  # ── Step lifecycle (space execution policy) ──
  - id: write-spec
    contract_keys:
      - preview-review.write_spec
    on: step.opened
    kill_on: step.resolved
    type: shell_spawn
    prompt: |
      Copy intake spec to specs/current/{{spec_filename}}.
      Resolve: murrmure_resolve_step({ run_id, step_id: "write_spec", branch: "completed" })
    command: cursor agent -p --force {{prompt}}
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000

  - id: build-owner
    contract_keys:
      - preview-review.build
      - preview-review.build.build-loop
      - preview-review.build.review   # listed for scope; human step — handler not dispatched on open
    on: step.opened
    kill_on: step.resolved            # scope: parent build resolves
    type: shell_spawn
    prompt: |
      You own the build subgraph. Follow skills/feature-build/SKILL.md.
      Active nested step contract is injected below.
    command: cursor agent -p --force {{prompt}}
    cwd: "{{space_root}}"
    timeout_ms: 3600000

  # ── Custom events (cross-cutting — today's hooks) ──
  - id: brief-wake
    on:
      event:
        type: brief.requested
    type: mcp_session                  # or shell_spawn + wake_label in params
    params:
      wake_label: handle_brief_requested

  - id: feedback-failure
    on:
      event:
        type: murrmure.feedback.failure
    contract_keys: []                # optional; event-only
    type: shell_spawn
    prompt: |
      Write feedback file under feedbacks/ …
    command: cursor agent -p --force {{prompt}}
```

### Field reference

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Stable handler id; journal `handler:{id}` |
| `contract_keys` | for step handlers | String array; empty for event-only handlers |
| `on` | yes | `step.opened` \| `step.resolved` \| `event: { type, source? }` |
| `kill_on` | no | Cancel long-running dispatch when event fires (default: matching `step.resolved` for same key) |
| `type` | yes | `shell_spawn` \| `mcp_session` \| `queue_poll` \| `remote_hub` — **replaces executors.yaml** |
| `complete` | for `shell_spawn` | `auto` \| `cli` \| `explicit` — how the step closes (see below); default `explicit` |
| `prompt`, `command`, `cwd`, `timeout_ms`, `delivery` | per type | Same semantics as today `actions.yaml` |
| `params` | optional | Event templates, wake labels |

### Step completion — `complete` modes

Flow steps always close via **`resolve_step`** internally. The `complete` field tells the hub **who calls it** after `shell_spawn` dispatch.

| Mode | Who resolves | When | Typical handler |
|------|--------------|------|-----------------|
| **`auto`** | Hub (on shell exit 0) | stdout JSON → `payload`, branch fixed `completed` | `node script.mjs`, one-shot scripts |
| **`cli`** | Command chain via **`mrmr step resolve`** | Shell exits after CLI resolve succeeds | `npm run lint && mrmr step resolve …` |
| **`explicit`** | Agent (MCP) or human (view) | `murrmure_resolve_step` / view `submit()` | `cursor agent …`, nested subgraph owners |

Replaces today’s `shouldAutoResolveExecutorStep` heuristic (catalog `executor.action` + no view + no nested children). After cutover, **`complete: auto`** on the handler drives auto-resolve — not flow manifest fields.

#### `complete: auto` (headless script)

```yaml
- id: archive-files
  contract_keys: [preview-review.archive]
  on: step.opened
  type: shell_spawn
  complete: auto
  command: node scripts/archive.mjs
  cwd: "{{space_root}}"
```

- Exit `0` + stdout JSON → hub calls `resolve_step({ branch: "completed", payload: <parsed stdout> })`.
- Exit non-zero → `ACTION_FAILED`; step stays `working` unless flow `failed` branch triggers run failure.
- Nested subgraph steps and human/view steps **must not** use `auto`.

#### `complete: cli` (shell-native, pipe-friendly)

```yaml
- id: lint-gate
  contract_keys: [preview-review.lint]
  on: step.opened
  type: shell_spawn
  complete: cli
  command: >-
    npm run lint -- --format json |
    mrmr step resolve --branch completed --payload-stdin
  cwd: "{{space_root}}"
```

Failure with explicit branch:

```bash
npm run lint || mrmr step resolve --branch failed --payload-json '{"error":"lint failed"}'
```

Hub does **not** auto-resolve when `complete: cli` — the command must call `mrmr step resolve` or the step stays open.

#### `complete: explicit` (agent default)

```yaml
- id: write-spec
  contract_keys: [preview-review.write_spec]
  on: step.opened
  type: shell_spawn
  complete: explicit          # default if omitted
  command: cursor agent -p --force {{prompt}}
  prompt: |
    … then murrmure_resolve_step({ run_id, step_id: "write_spec", branch: "completed" })
```

### `mrmr step resolve` (new CLI)

Wraps `POST /v1/runs/{run_id}/steps/{step_id}/resolve`. Reads defaults from shell env set by hub on dispatch:

| Env var | Set by hub dispatch |
|---------|---------------------|
| `MURRMURE_RUN_ID` | yes |
| `MURRMURE_STEP_ID` | yes |
| `MURRMURE_STEP_WORKDIR` | yes |
| `MURRMURE_STEP_CONTRACT` | yes (slice JSON) |
| `MURRMURE_HUB_TOKEN` | **inject short-lived run-scoped resolve token on dispatch** |
| `MURRMURE_HUB_URL` | yes — explicit target hub for resolve calls |

```bash
# explicit JSON payload
mrmr step resolve --branch completed --payload-json '{"ok":true}'

# pipe stdin (must be JSON object)
npm run lint -- --format json | mrmr step resolve --branch completed --payload-stdin

# payload from workdir file
mrmr step resolve --branch completed --payload-file work/lint.json

# promote artifact on resolve
mrmr step resolve --branch completed \
  --payload-json '{"report":"lint"}' \
  --artifact-out lint_report=work/lint.json
```

**Failure modes:**

| Situation | Result |
|-----------|--------|
| Upstream cmd fails before `\|\|` / `&&` | Shell stops; `ACTION_FAILED` if no resolve called |
| `lint \|\| mrmr step resolve --branch failed` | Lint fails → `failed` branch resolved |
| Invalid payload vs branch schema | CLI exits non-zero; step not resolved |
| Unknown branch | Hub 400; CLI exits non-zero |
| `complete: cli` but command never calls resolve | Step stuck `working` — doctor warns |

**Piping vs `auto`:** use `auto` for simple “exit 0 + JSON stdout” scripts; use `cli` when you need `&&` / `\|\|`, custom branches, or piped payloads.

### Dispatch env (all shell handlers)

Hub injects on `shell_spawn` (unchanged intent, `.mrmr/dev/runs/` paths):

```text
MURRMURE_RUN_ID, MURRMURE_STEP_ID, MURRMURE_SESSION_ID, MURRMURE_SPACE_ID
MURRMURE_INPUT, MURRMURE_STEP_CONTRACT, MURRMURE_ACTIVE_STEP_CONTRACT_PATH
MURRMURE_STEP_WORKDIR, MURRMURE_HUB_TOKEN, MURRMURE_HUB_URL
```

Token policy (normative for cutover):

- `MURRMURE_HUB_TOKEN` is short-lived and run-scoped (resolve capability only).
- token is minted per dispatch and must not reuse long-lived grant tokens.
- `mrmr step resolve` targets `MURRMURE_HUB_URL`; no implicit local-hub assumption.

Codegen `contract-keys.json` includes **`branches[]`** per key so CLI and doctor can validate `--branch`.

### Execution policies (same flow, different spaces)

| Policy | `contract_keys` | Behavior |
|--------|-----------------|----------|
| **Per-step agent** | `[preview-review.write_spec]` only | New dispatch each step open |
| **Subgraph owner** | `[build, build.build-loop, build.review]` | One shell session; scope slices for all keys in prompt |
| **Human steps** | not listed on shell handlers | Engine opens presentation; views resolve via `murrmure_resolve_step` |

---

## Flow manifest (protocol only)

### Target shape (v3)

```yaml
apiVersion: murrmure.flow/v1
name: preview-review
triggers:
  manual: true
start:
  manual: true

steps:
  - id: intake
    role: human
    presentation:
      view: preview-review-intake
    branches:
      continue: { schema: …, next: write_spec }
      cancel: { schema: …, fail_run: true }

  - id: write_spec
    role: agent
    branches:
      completed: { schema: …, next: build }
      failed: { schema: …, fail_run: true }

  - id: build
    role: agent
    orchestration: engine-routed
    branches:
      completed: { schema: …, next: archive }
      failed: { schema: …, fail_run: true }
    steps:
      - id: build-loop
        role: agent
        branches:
          completed: { schema: …, goto: review }
          failed: { fail: true }
      - id: review
        role: human
        presentation:
          view: preview-review
        branches:
          validated: { complete: parent }
          changes_required: { goto: build-loop }
```

- `role` explicit or derived (same rules as today: view → human, no view + agent step → agent).
- **No `executor.action`**, **no `invoke:`**, **no `gate:`**.
- Cross-space steps (future): `target_space: spc_worker` on step metadata — handler still resolved in **target** space index by contract key.

### Deprecation

| Legacy | Replacement |
|--------|-------------|
| `executor: { action: X }` | Handler with `contract_keys: [flow.step]` |
| `invoke: { space, action }` | Remove; use `target_space` on step + handler in target space |
| `hooks.yaml` `do: [invoke: { action }]` | Handler with `on.event` |
| `actions.yaml` named callables | Handlers with `contract_keys` or event `on` |
| `executors.yaml` | `type:` on handler |

---

## Prompt assembly (replaces briefing)

### Order (runtime, per handler dispatch)

```text
1. Handler scope block (if contract_keys.length > 1)
   → branch schemas + then-hints for ALL keyed catalog entries

2. Active step contract block (always)
   → renderAgentStepContractMarkdown(active_slice)

3. Handler prompt (space-owned)
   → resolved templates (space_root, run_id, murrmure.step.*.artifact.*)

4. Protocol footer (optional, from murrmure-agent skill — not injected by hub in v1)
```

### Remove

- `writeSpaceBriefingFile` on apply (or write deprecation stub only).
- Prepend block in `invoke-shell-prompt.ts` referencing `briefing.md` / key paths to `murrmure/flows/`.
- `## Key paths` listing filesystem discovery.

### MCP runtime discovery (agent-facing)

| Tool | Returns |
|------|---------|
| `murrmure_space_status` | Indexed flows, `step_ids`, handler coverage map |
| `murrmure_list_handlers` (new) | Handler ids + `contract_keys` + `type` |
| `murrmure_list_step_contracts` | Active slice + `graph_digest` (existing) |
| `murrmure_get_run_graph` | Step status overlay (existing) |
| `murrmure_space_health` (future) | Index drift, handler coverage gaps |

---

## Unified `.mrmr/` directory (repo-local)

One Murrmure tree per repo. Split by **lifecycle and ownership**, not historical accident.

### Target layout

```text
<repo>/
└── .mrmr/
    ├── space/                       # committed — execution shell (always)
    │   ├── space.yaml               # slug + link binding (YAML, not link.json)
    │   ├── handlers.yaml            # execution policy (contract_keys)
    │   └── bindings.yaml            # optional — flows/views used but not authored here
    │
    ├── flows/                       # optional — locally authored protocols
    │   └── preview-review/
    │       └── flow.manifest.yaml
    │
    ├── views/                       # optional — locally authored UI
    │   └── preview-review-intake/
    │       └── view.manifest.yaml
    │
    └── dev/                         # gitignore — machine/runtime ephemeral
        ├── pending-wake.json        # MCP wake fallback
        ├── view-dev.json            # mrmr view dev session
        └── runs/
            └── {run_id}/
                ├── active-step-contract.json
                ├── steps/{qualified}/
                │   ├── work/          # scratch while step active
                │   └── {slot}/      # stable after resolve
                └── transfers/{transfer_id}/   # cross-space files for this run
```

### Directory roles

| Path | Owns | Present when |
|------|------|--------------|
| **`space/`** | Identity, handlers, optional consumption refs | Always |
| **`flows/`** | Flow manifests this repo **authors** | Authoring / catalog spaces |
| **`views/`** | View bundles this repo **authors** | Authoring spaces |
| **`dev/`** | Ephemeral runtime on this machine | After first run / dev session |

**Principle:** `space/` = who runs here. `flows/` + `views/` = portable content (may also live in catalog, npm, another space). `dev/` = nothing committed.

### `space.yaml` (merged link)

Replaces separate `murrmure/space.yaml` + `.murrmure/link.json`. Hub infers project root from `.mrmr/` location — no `path` field needed.

```yaml
apiVersion: murrmure.space/v1
slug: murrmure
name: Murrmure

link:
  space_id: spc_murrmure      # set by `mrmr space link`
  host: gaelboyenval.home     # machine-specific; may differ per developer
```

`link.space_id` may be committed (team shares hub space id). `link.host` is per-machine.

### `bindings.yaml` (optional consumption glue)

When a space **runs** flows/views it does not **author** locally, declare sources explicitly. Solo-dev spaces with local `flows/` + `views/` can omit this file — apply auto-discovers local dirs.

```yaml
version: 1
flows:
  - ref: flw_preview_review@2.1.0
    source: space:spc_catalog

views:
  - ref: preview-review-intake
    source: local:views/preview-review-intake
  - ref: daily-brief
    source: catalog
```

| `source` prefix | Meaning |
|-----------------|---------|
| `local:…` | Path under `.mrmr/` |
| `space:spc_…` | Indexed on another hub space |
| `catalog` | Hub catalog entry |

`npm:` and `path:` forms are documented but deferred until we have a concrete second consumer.

**Bindings** = what this space **uses**. **Handlers** = how this space **executes**. Worker spaces typically have handlers + bindings, empty `flows/` and `views/`.

### Space archetypes

| Archetype | `space/` | `flows/` | `views/` | `bindings.yaml` |
|-----------|----------|----------|----------|-----------------|
| **Worker** | handlers | — | — | yes (points at catalog) |
| **Catalog** | minimal handlers | many | many | rarely |
| **Solo dev** (tutorial) | handlers | few | few | optional |

### Run-scoped artifacts (no top-level exchange/)

Step scratch and stable slots live under `dev/runs/{run_id}/steps/`. Cross-space file handoff is **run-scoped** — materialize to `dev/runs/{run_id}/transfers/{transfer_id}/`, not a space-global inbox. Transfer manifests must carry `session_id` so session-level observability remains the correlation truth. Ad-hoc `PUT /v1/artifacts` outside any run stays hub-side until a run references it via `artifacts_in`.

### Path migration map

| Old | New |
|-----|-----|
| `murrmure/` | `.mrmr/space/` + `.mrmr/flows/` + `.mrmr/views/` (split by content type) |
| `murrmure/space.yaml` | `.mrmr/space/space.yaml` (+ merge `link:` fields) |
| `murrmure/handlers.yaml` (new) | `.mrmr/space/handlers.yaml` |
| `murrmure/actions.yaml` | `.mrmr/space/handlers.yaml` (migration) |
| `murrmure/flows/…` | `.mrmr/flows/…` |
| `murrmure/views/…` | `.mrmr/views/…` |
| `.murrmure/link.json` | `.mrmr/space/space.yaml` → `link:` block |
| `.murrmure/pending-wake.json` | `.mrmr/dev/pending-wake.json` |
| `.murrmure/view-dev.json` | `.mrmr/dev/view-dev.json` |
| `.mrmr.temp/runs/…` | `.mrmr/dev/runs/…` |
| `.mrmr.temp/inbox/…` | `.mrmr/dev/runs/{run_id}/transfers/…` |
| `.mrmr.temp/briefing.md` | **deleted** |

CLI discovery: project root = parent of `.mrmr/` (walk up from cwd). `resolveMurrmureRoot()` → `.mrmr/space/` or `.mrmr/` per implementation.

### `.gitignore` template (space init)

```gitignore
.mrmr/dev/
```

### Layout anti-patterns

1. Bundle flows/views under `space/` — implies space owns protocol it only consumes.
2. Top-level `exchange/` or `inbox/` — artifacts belong under `dev/runs/{run_id}/`.
3. Separate `link.json` — use `space.yaml` `link:` block.
4. Keep `murrmure/` visible dir alongside `.mrmr/` after cutover.

---

## Skills (out of hub prompt path)

Two thin Cursor skills — **not** injected by hub into shell prompts. Agents load via Cursor natively.

| Skill | Install path | Audience | Required when |
|-------|--------------|----------|---------------|
| **murrmure-agent** | `.cursor/skills/murrmure-agent/` | Runtime agents | **Every** space that runs agent handlers or MCP |
| **murrmure-developer** | `.cursor/skills/murrmure-developer/` | Authors | Local `.mrmr/flows/` or `.mrmr/views/` has content |

### Content split

| Skill | Covers |
|-------|--------|
| **murrmure-agent** | MCP loop, `resolve_step`, sessions/runs, contract keys, `murrmure_list_handlers`, troubleshooting |
| **murrmure-developer** | `.mrmr/` layout, `handlers.yaml`, `bindings.yaml`, flow manifests, views, apply, grants |

Split today’s monolithic `packages/cli/skill/` into `packages/cli/skill-agent/` + `packages/cli/skill-developer/`.

### Install

```bash
mrmr skill install --variant agent          # consumer / worker spaces
mrmr skill install --variant developer      # authoring only (rare alone)
mrmr skill install --variant all            # solo dev — both skills
mrmr skill install                          # default: all if flows/ or views/ present, else agent
```

Each package ships a `VERSION` file; installed copy includes matching `version:` in SKILL.md frontmatter.

### Space archetype → skill policy

| Archetype | `murrmure-agent` | `murrmure-developer` |
|-----------|------------------|----------------------|
| **Worker** (handlers + bindings, no local flows/views) | required | not required |
| **Catalog** (many flows/views) | required | required |
| **Solo dev** | required | required |

Doctor derives archetype from `.mrmr/` tree: `hasLocalFlowsOrViews := flows/ or views/ has indexed content`.

### Legacy

| Path | Doctor code |
|------|-------------|
| `.cursor/skills/murrmure/` (monolith) | `SKILL_LEGACY_MONOLITH` — run `mrmr skill install --variant all` |
| `.cursor/skills/murrmure-flow/` | `SKILL_LEGACY_FDK` — removed on install |

Hub does **not** inject skill text into shell prompts in v1.

---

## Space doctor & preflight

`mrmr space doctor` is the primary preflight for a project. `mrmr doctor` covers machine-level auth/hub. Apply `--strict` shares lint rules but does not replace doctor.

### Check categories

| Category | Examples |
|----------|----------|
| **Layout** | `.mrmr/` present; no legacy `murrmure/`, `.murrmure/`, `.mrmr.temp/` |
| **Space identity** | `space.yaml` valid; `link.space_id` set; hub binding path matches project root |
| **Handlers** | coverage, orphan keys, conflicts; no legacy `actions.yaml` post-cutover |
| **Bindings** | unresolved refs; worker without bindings or local flows |
| **Index drift** | local vs hub digests (handlers, bindings, flows, views) |
| **Flows / views** | dist present, view refs, contract tests under `.mrmr/flows/` |
| **Skills** | presence + version per archetype (below) |
| **MCP** | thin config, discovery, token space match, live catalog + schemas |
| **Legacy** | studio-era paths, FDK artifacts, monolith skill |

### Skill doctor checks

| Code | Severity | Condition | Fix |
|------|----------|-----------|-----|
| `SKILL_AGENT_MISSING` | warning | always | `mrmr skill install --variant agent` |
| `SKILL_DEVELOPER_MISSING` | warning | local `flows/` or `views/` non-empty | `mrmr skill install --variant developer` |
| `SKILL_AGENT_OUTDATED` | warning | installed `murrmure-agent` VERSION < CLI package | `mrmr skill install --variant agent` |
| `SKILL_DEVELOPER_OUTDATED` | warning | installed `murrmure-developer` VERSION < CLI package | `mrmr skill install --variant developer` |
| `SKILL_LEGACY_MONOLITH` | info | `.cursor/skills/murrmure/` exists | `mrmr skill install --variant all` |
| `SKILL_LEGACY_FDK` | info | `.cursor/skills/murrmure-flow/` exists | `mrmr skill install --variant all` |

Version compare: read `VERSION` from installed skill dir vs `packages/cli/skill-{agent,developer}/VERSION` bundled with CLI (same pattern as today `readSkillVersion()`).

Consumer-only worker with only `SKILL_AGENT_*` issues → doctor **ok** for skills. Missing developer skill on a worker is **not** an error.

### Handler / binding doctor checks (Phase 2+)

| Code | Severity |
|------|----------|
| `HANDLER_MISSING` | error (strict) / warning |
| `HANDLER_ORPHAN_KEY` | warning |
| `HANDLER_KEY_CONFLICT` | error |
| `HANDLER_LEGACY_ACTIONS` | warning |
| `HANDLER_COMPLETE_CLI_NO_RESOLVE` | warning — `complete: cli` but `command` has no `mrmr step resolve` |
| `HANDLER_COMPLETE_AUTO_NESTED` | error — `complete: auto` on step with nested children |
| `BINDINGS_UNRESOLVED` | error |
| `BINDINGS_REDUNDANT` | info |
| `WORKER_NO_BINDINGS` | warning |
| `LEGACY_LAYOUT` | error |

### Tools to update

| Component | Role |
|-----------|------|
| `packages/cli/src/lib/space-doctor.ts` | layout, skills scan, handler/binding lint reuse |
| `packages/cli/src/skill/install.ts` | `--variant agent\|developer\|all`; dual package roots |
| `packages/cli/src/lib/space-doctor-skills.ts` | **new** — presence + version + archetype policy |
| `packages/cli/test/space-doctor-skills.test.ts` | **new** |
| `murrmure_space_status` (MCP) | optional `skills:` summary block |
| Setup wizard | install agent by default; add developer step when scaffolding flows/views |

### Suggested doctor output (skills line)

```text
Skills                 ✓ agent 1.2.0 · developer 1.2.0 (authoring space)
Skills                 ⚠ agent 1.1.0 outdated · run mrmr skill install --variant agent
Skills                 ✓ agent 1.2.0 (consumer space — developer not required)
```

---

## Vertical slices (delivery plan)

Implementation is organized as **end-to-end vertical slices** so each slice is shippable, reviewable, and fixable via a Codex → Opus → Composer loop.

### Orchestration loop contract (applies to every slice)

For each VS-N:

1. **Dev packet (Codex)** — explicit goal, allowed file set, required tests.
2. **Review packet (Opus)** — blocking findings only (architecture, north-star, regressions, test evidence).
3. **Fix packet (Composer)** — patch accepted blocking findings only; no scope creep.
4. **Done gate** — binary command list + acceptance checks below.

Tracking file: `studio-specs/plans/orchestration/2026-07-09-space-handlers-contract-keys-orchestration.md`
with statuses `READY | IN_DEV | IN_REVIEW | IN_FIX | DONE`.

Simplicity guardrails per slice:

- Keep diffs narrow: touch only the files listed for that slice unless review explicitly approves expansion.
- Prefer deletion over adapters/wrappers when replacing legacy paths.
- Do not introduce a new abstraction without a concrete second consumer.

---

### VS-0 — Decision lock + orchestration scaffold

**Work:**

1. Keep this plan active and linked from [plans/README.md](./README.md).
2. Add `studio-specs/current/bridges/handlers.md` with **DECIDED** entries for:
   - Q1 `link.host` persistence policy
   - Q3 human-step keys in `contract_keys`
   - Q4 `murrmure_invoke_action` fate
   - Q6 dispatch token scope/lifetime
   - Q7 `complete: cli` branch validation mode
3. Create orchestration tracker with per-slice dev/review/fix packets.

**Acceptance (CI + review):**

- `handlers-decision-record.test.ts` (new) passes with all five decisions marked `DECIDED`.
- No VS-1 work starts until VS-0 is `DONE`.

---

### VS-1 — Minimal handler E2E (single agent step)

**Work:**

1. Add `.mrmr/space/handlers.yaml` parser + `HandlerIndex` (`parse-handlers.ts`).
2. Add lint surface: `HANDLER_ORPHAN_KEY`, `STEP_UNCOVERED`, `HANDLER_KEY_CONFLICT`.
3. Add deterministic dispatch path test for one agent step (`write_spec`) with exactly one handler match.
4. Add runtime ownership test: human step keys may exist for scope, but never dispatch on `step.opened`.
5. Add `murrmure_list_handlers` MCP tool with minimal fields (`id`, `contract_keys`, `type`).

**Acceptance (CI + review):**

- `handlers-parse.test.ts`, `handler-catalog-lint.test.ts`, `handler-dispatch.test.ts` pass.
- `preview-review-v2-example.test.ts` proves handlers-based path for one step.
- Binary assertion exists: open `write_spec` → one dispatch → resolve → run advances.

---

### VS-2 — Nested subgraph-owner loop

**Work:**

1. Add multi-key handler scope assembly for nested build loop (`build`, `build-loop`, `review`).
2. Add `kill_on: step.resolved` behavior for subgraph owner.
3. Add prompt assembly tests for scope block + active block ordering.
4. Keep role boundary strict: human steps open presentation, not shell dispatch.

**Acceptance (CI + review):**

- `handler-dispatch.test.ts` covers one-owner nested loop with `changes_required` iteration.
- `executors/conformance/invoke-shell-prompt.test.ts` verifies scope+active blocks and no briefing prepend.
- No duplicate dispatch across one loop iteration.

---

### VS-3 — Completion modes + atomic HANDLER-CUTOVER

**Work:**

1. Flip contracts/compiler types to remove executor coupling (`flow/manifest.ts`, `entities/step-contract.ts`, `step-contract-compile.ts`, `step-catalog.ts`).
2. Wire `complete: auto | cli | explicit` in engine (`step-resolve.ts`) replacing catalog action heuristic.
3. Add `mrmr step resolve` CLI (HTTP wrapper to existing resolve endpoint).
4. Inject short-lived run-scoped resolve token + hub URL in shell env.
5. Migrate hook dispatch to handler event path (`on.event`) without behavior drift.
6. **Atomic HANDLER-CUTOVER PR:**
   - flip dispatch to handlers for `role: agent`
   - remove `executor.action` from manifests/examples
   - remove legacy parser exports (`parse-actions`, `parse-hooks`, `parse-executors`, aliases)
   - no released dual-dispatch window

**Acceptance (CI + review):**

- `step-complete-modes.test.ts` passes (`auto`, `cli`, nested-auto refusal).
- `step-resolve-cli.test.ts` passes (stdin payload, bad branch, schema failure).
- `conformance/shell-spawn.test.ts` proves env injection incl. `MURRMURE_HUB_TOKEN` + `MURRMURE_HUB_URL`.
- `examples/flows/**/flow.manifest.yaml` contains no `executor.action`.

---

### VS-4 — `.mrmr/` layout cutover + briefing removal

**Work:**

1. Migrate layout: `murrmure/` + `.murrmure/` + `.mrmr.temp/` → `.mrmr/{space,flows,views,dev}`.
2. Move run paths and transfers to `.mrmr/dev/runs/{run_id}/...`.
3. Merge link into `.mrmr/space/space.yaml` (`link:` block), remove `link.json`.
4. Delete briefing generation and all prompt injection/prepend paths.
5. Update resolver/discovery helpers (`resolveMurrmureRoot`, space-directory, wake relay, scaffold paths).

**Acceptance (CI + review):**

- `layout-cutover-grep.test.ts` (new) replaces shell grep gate.
- `step-contract-slice.test.ts` uses `.mrmr/dev/runs/` paths.
- `space-link-file.test.ts` verifies `space.yaml` `link:` reads/writes.
- `space-briefing.test.ts` removed; no briefing assertions remain in executors conformance tests.

---

### VS-5 — Bindings + event parity + doctor coverage

**Work:**

1. Add `bindings.yaml` parser and resolver with shipped sources: `local:`, `space:`, `catalog`.
2. Add worker+catalog federation path test (worker executes bound flow with local handlers).
3. Add hooks→handlers parity test (`on.event`) and event→handler→journal test (`brief.requested`).
4. Wire handler/binding lint into `mrmr space doctor` (codes in this plan).
5. Add `space-doctor-handlers.test.ts` coverage for handler/binding lint codes.

**Acceptance (CI + review):**

- `bindings-parse.test.ts`, `handler-event-parity.test.ts`, `worker-bindings-federation.test.ts` pass.
- `event-handler-dispatch.test.ts` proves event-driven non-step trigger path.
- `space-doctor-handlers.test.ts` covers all listed handler/binding codes.

---

### VS-6 — Docs/skills hardening + MCP health endpoints

**Work:**

1. Split skills (`skill-agent`, `skill-developer`) and enforce archetype-based doctor checks.
2. Update docs/specs/tutorials to handlers + contract keys + `.mrmr/` layout.
3. Add docs-proof bans for `executor.action` and legacy runtime patterns.
4. Add `murrmure_space_health` and `murrmure_get_run_context`.
5. Optional post-cutover surfaces (if still needed): `mrmr space contracts` and richer codegen artifacts.

**Acceptance (CI + review):**

- `space-doctor-skills.test.ts` covers worker-vs-authoring requirements + legacy skill codes.
- `skill-install-variants.test.ts` and `docs-proof.test.ts` pass.
- `http/mcp/list-handlers.test.ts` + `http/mcp/space-health.test.ts` pass.
- No legacy parser exports remain after VS-3 cutover.

---

## Anti-patterns

1. Put `executor.action` or action names in flow manifests after cutover.
2. Keep `briefing.md` filesystem path lists for agent discovery.
3. Require identical action **names** across spaces running the same flow.
4. Use `contract_keys` without indexed `StepContractCatalog` (handlers before apply).
5. Multiple handlers matching same step open without lint error.
6. Reintroduce `executors.yaml` for default `shell_spawn` only spaces.
7. Inject murrmure-developer skill into runtime shell prompts.
8. Require developer skill on consumer-only worker spaces.
9. Use `complete: auto` on nested subgraph or human steps.
10. Rely on catalog `executor.action` for auto-resolve after VS-3 cutover.
11. Ship released dual-dispatch paths (legacy + handler) across multiple slices.
12. Use `flow_name`-only contract keys in cross-catalog environments.

---

## Success criteria (plan exit)

### CI-automatable

1. Repo-local runtime under `.mrmr/dev/` only; no `murrmure/`, `.murrmure/`, or `.mrmr.temp` in code paths.
2. `space.yaml` carries `link:` block; no `link.json`.
3. No briefing generation or prompt injection.
4. `handlers.yaml` + optional `bindings.yaml` indexed; contract key lint on apply.
5. Engine dispatches agents via handler match on `step.opened`.
6. preview-review-v2 runs with handlers; no `actions.yaml` in example.
7. `murrmure_list_handlers` returns keyed index.
8. Human-step keys are validated as scope-only and never shell-dispatched.
9. Worker+catalog federation test passes (same flow, different handler policy).
10. Event handler parity tests pass (`hooks.yaml` behavior preserved under `on.event`).
11. Skill doctor: consumer space passes with agent only; authoring space warns on missing/outdated developer skill.
12. `mrmr step resolve` + `complete: cli` integration test passes; `complete: auto` advances headless script steps.
13. No legacy parser exports after VS-3 cutover.

### Manual sign-off

1. VS-1: per-step handler policy run opens, dispatches once, resolves, and advances.
2. VS-2: same flow with subgraph-owner policy loops through `changes_required` without second handler dispatch.
3. VS-3: `complete: auto` and `complete: cli` both resolve deterministically with expected branches.
4. VS-4: repo runs with single `.mrmr/` layout; no briefing block appears in prompt assembly.
5. VS-5: worker executes catalog-bound flow via local handlers; `brief.requested` event dispatch is visible in journal.
6. VS-6: doctor skill policy matches archetype (worker agent-only, authoring both).

---

## Out of scope

| Item | Notes |
|------|-------|
| HTTP MCP OAuth | Deferred from MCP reliability Phase 5 |
| Wildcard `contract_keys` (`build.*`) | Deferred; start exact + explicit multi-key only |
| Remote `target_space` on every step | Follow-up; keys still name protocol, handlers in target space |
| A2A executor type | Philosophy deferred |
| `npm:` / `path:` bindings sources | Deferred until concrete second consumer |
| `handlers.schema.json` / `.d.ts` codegen outputs | Deferred until concrete second consumer |

---

## Code map (target)

| Component | Path | Role |
|-----------|------|------|
| Flow manifest schema | `packages/contracts/src/flow/manifest.ts` | remove `executor`/`invoke`/`gate`, keep protocol-only flow shape |
| Step contract entity | `packages/contracts/src/entities/step-contract.ts` | remove catalog `executor` dependency, keep role/branches/graph data |
| Catalog compiler | `packages/hub-core/src/flow-engine/step-contract-compile.ts` | compile manifest → catalog without executor coupling |
| Catalog helpers | `packages/hub-core/src/flow-engine/step-catalog.ts` | replace `executor.action`-based resolve helpers |
| Handler parser | `packages/hub-core/src/index/parse-handlers.ts` | YAML → index |
| Contract key lint | `packages/hub-core/src/index/handler-catalog-lint.ts` | Apply-time coverage |
| Step open dispatch | `packages/hub-core/src/flow-engine/step-open.ts` | Match handlers, not `executor.action` |
| Auto-resolve | `packages/hub-core/src/flow-engine/step-resolve.ts` | `complete: auto` from handler index |
| `mrmr step resolve` | `packages/cli/src/commands/run/step-resolve.ts` | CLI → resolve HTTP |
| Shell env token | `packages/executors/src/shell-spawn.ts` | Inject `MURRMURE_HUB_TOKEN` on dispatch |
| Hook migration | `packages/hub-core/src/hooks/matcher.ts` | Unified with handler `on.event` matching |
| Hook dispatch | `packages/hub-core/src/hooks/dispatch.ts` | ensure event parity during migration |
| Hook dispatch bridge | `packages/hub-daemon/src/hook-dispatch.ts` | daemon route wiring for unified event handlers |
| Prompt assembly | `packages/executors/src/invoke-shell-prompt.ts` | Scope + active slices |
| Run paths | `packages/hub-core/src/flow-engine/step-contract-slice.ts` | `.mrmr/dev/runs/` |
| Bindings parser | `packages/hub-core/src/index/parse-bindings.ts` | YAML → flow/view source refs |
| Contract codegen emission | `packages/cli/src/commands/space/apply.ts` | write `.mrmr/dev/contracts/{catalog,contract-keys}.json` |
| Space directory resolver | `packages/cli/src/lib/space-directory.ts` | resolve `.mrmr` root from cwd |
| `space handlers scaffold` | `packages/cli/src/commands/space/handlers-scaffold.ts` | stub uncovered agent steps |
| `space handlers coverage` | `packages/cli/src/commands/space/handlers-coverage.ts` | print contract coverage table |
| Space link | `packages/cli/src/lib/space-link-file.ts` | `space.yaml` `link:` block |
| Wake relay | `packages/mcp-bridge/src/wake-relay.ts` | `.mrmr/dev/pending-wake.json` |
| Skill install | `packages/cli/src/skill/install.ts` | `--variant agent\|developer\|all` |
| Skill doctor | `packages/cli/src/lib/space-doctor-skills.ts` | Presence + version per archetype |
| MCP | `packages/hub-daemon/src/mcp-handlers.ts` | `list_handlers`, enriched `space_status` |
| Legacy parsers delete | `packages/hub-core/src/index/{parse-actions,parse-hooks,parse-executors,hooks-alias}.ts` | remove after HANDLER-CUTOVER |
| Scaffold | `packages/cli/templates/space/` | `.mrmr/{space,flows,views,dev}/` layout |
| Delete | `packages/hub-core/src/flow-engine/space-briefing.ts` | After VS-4 |

---

## Test file map

| File | Action |
|------|--------|
| `cli/test/handlers-decision-record.test.ts` | New (VS-0 decision lock gate) |
| `hub-core/test/unit/index/handlers-parse.test.ts` | New |
| `hub-core/test/unit/index/handler-catalog-lint.test.ts` | New |
| `hub-core/test/unit/flow-engine/handler-dispatch.test.ts` | New |
| `hub-core/test/unit/flow-engine/step-complete-modes.test.ts` | New |
| `hub-core/test/unit/flow-engine/step-contract-slice.test.ts` | Modify paths |
| `hub-core/test/unit/flow-engine/space-briefing.test.ts` | Delete |
| `executors/conformance/invoke-shell-prompt.test.ts` | New (scope slice assembly) |
| `executors/conformance/shell-spawn.test.ts` | Extend (token env injection + no-briefing assertions) |
| `cli/test/preview-review-v2-example.test.ts` | Handlers-based |
| `cli/test/layout-cutover-grep.test.ts` | New (replaces shell grep gate) |
| `cli/test/space-link-file.test.ts` | New (`space.yaml` `link:` read/write) |
| `hub-core/test/unit/index/bindings-parse.test.ts` | New |
| `hub-core/test/unit/hooks/handler-event-parity.test.ts` | New |
| `hub-daemon/test/http/spaces/worker-bindings-federation.test.ts` | New |
| `hub-daemon/test/http/events/event-handler-dispatch.test.ts` | New |
| `cli/test/space-doctor-handlers.test.ts` | New |
| `cli/test/space-doctor-skills.test.ts` | New |
| `cli/test/skill-install-variants.test.ts` | New |
| `cli/test/space-handlers-scaffold.test.ts` | New |
| `cli/test/space-handlers-coverage.test.ts` | New |
| `cli/test/space-contracts-offline.test.ts` | New (if deferred command ships in VS-6) |
| `cli/test/step-resolve-cli.test.ts` | New |
| `hub-daemon/test/http/mcp/list-handlers.test.ts` | New |
| `hub-daemon/test/http/mcp/space-health.test.ts` | New |
| `hub-core/test/unit/index/no-legacy-parsers.test.ts` | New |
| `cli/test/docs-proof.test.ts` | Extend (`executor.action` ban + legacy runtime docs bans) |
| `hub-daemon/test/http/mcp/catalog-schema.test.ts` | Update tool-name list for `murrmure_list_handlers` and Q4 decision |

---

## Decision lock (VS-0 entry gates)

The following must be marked `DECIDED` in `studio-specs/current/bridges/handlers.md` before VS-1 starts.

1. **Q1 (`link.host` persistence):** commit `space_id`; keep machine `host` local/override-capable so multi-host binding is not blocked.
2. **Q2 (handler/hook id namespace):** one `handlers.yaml` namespace with journal prefix `handler:{id}`.
3. **Q3 (human keys in `contract_keys`):** allowed for scope/documentation only; never dispatched on `step.opened`.
4. **Q4 (`murrmure_invoke_action`):** retire from primary path after HANDLER-CUTOVER; keep only if a concrete debug consumer remains.
5. **Q5 (worker missing bindings):** strict warning by default, strict error in CI with `--strict`.
6. **Q6 (dispatch token):** short-lived run-scoped resolve token, minted per dispatch; never reuse long-lived grant token in shell env.
7. **Q7 (`complete: cli` branch validation):** both static lint (`HANDLER_COMPLETE_CLI_NO_RESOLVE`) and runtime schema/branch validation on resolve call.

---

## References

- [product/philosophy.md](../../../current/product/philosophy.md) § Arc 5, global flows, `.mrmr.temp` artifact model
- [bridges/step-contract.md](../../../current/bridges/step-contract.md) — VS-8 catalog + resolve
- [triggers/spec.md](../../../current/triggers/spec.md) — hooks delivery invariant
- [MCP reliability archive](../mcp-reliability/2026-07-09-mcp-reliability-plan.md)
- Conversation: briefing removal, event-hook handlers, contract key arrays (2026-07-09)
