---
name: murrmure-developer
description: >-
  Authoring skill for `.mrmr/` spaces: handlers, contract keys, flow/view
  authoring, and apply-time validation workflows.
version: 1.1.0
---

# Murrmure Developer Skill

**Authoring skill** — scaffold and edit `.mrmr/` spaces, wire handlers to flow steps, validate with apply/doctor. For operating runs and resolving steps at runtime, use **`murrmure-agent`**.

Murrmure separates **protocol** (flows, step contracts, branches) from **execution** (handlers in the space). Flow manifests declare *what* must happen; `handlers.yaml` declares *how* your space runs agent shells, MCP sessions, or event reactions.

## `.mrmr/` layout

```text
my-space/
  .mrmr/
    space/
      space.yaml              # slug + link.space_id
      handlers.yaml           # execution bindings (required)
      bindings.yaml           # optional remote/worker bindings
      events.yaml             # optional emittable event catalog
      executors.yaml          # legacy — prefer handlers
    flows/{name}/flow.manifest.yaml
    views/{id}/
      view.manifest.yaml
      src/ …
    dev/contracts/contract-keys.json   # generated on apply — wire contract_keys
```

Deep dives: [reference/space-directory.md](reference/space-directory.md), [reference/flow-authoring.md](reference/flow-authoring.md).

## Authoring workflow

1. **Scaffold** — `mrmr space init`; `mrmr space flow init <id>`; `mrmr space view init <id>`.
2. **Edit protocol** — flow manifests: steps, branches, `presentation:` for human steps. No `executor.action`.
3. **Edit execution** — `handlers.yaml`: map `contract_keys` to shell/MCP handlers.
4. **Wire keys** — after apply, read `.mrmr/dev/contracts/contract-keys.json`; align handler `contract_keys` with catalog entries.
5. **Validate** — `mrmr space apply --strict`; `mrmr space doctor`; fix lint warnings.
6. **Install skills** — `mrmr skill install --variant all` in authoring repos.

## Handlers (`handlers.yaml`)

Handlers replace legacy `actions.yaml`, `hooks.yaml`, and per-step `executor.action` for default spaces.

```yaml
version: 1
handlers:
  - id: my_step_handler
    contract_keys:
      - my-flow.my_step          # {flow_ref}.{qualified_step_id}
    on: step.opened               # step.opened | step.resolved | event: { type, source? }
    type: shell_spawn             # shell_spawn | mcp_session | queue_poll | remote_hub
    complete: explicit            # auto | cli | explicit
    prompt: |
      … task brief …
      Then: murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "my_step", branch: "completed" })
    command: cursor agent -p --force --approve-mcps {{prompt}}
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000
```

| Field | Notes |
|-------|-------|
| `contract_keys` | Protocol addresses; use multi-key for nested subgraph owners; empty for event-only handlers |
| `on` | `step.opened` dispatches agent steps; human `presentation:` steps are never dispatched on open |
| `complete: explicit` | Handler prompt must instruct agent to call `murrmure_resolve_step` |
| `complete: cli` | Command must invoke `mrmr step resolve`; lint enforces |
| `kill_on: step.resolved` | Cancel long-running shell when step resolves (nested loops) |

### Event handlers (not hooks chains)

Declare event reactions in the same `handlers.yaml` namespace:

```yaml
  - id: on_spec_published
    contract_keys: []
    on:
      event:
        type: mrmr.spec.published
        source: "/spaces/spc_spec"
    type: shell_spawn
    complete: auto
    command: …
```

Do **not** add separate `hooks.yaml` invoke chains or `invoke:` flow steps — those patterns are retired.

## Contract keys

```text
contract_key := {flow_ref}.{qualified_step_id}
```

- Generated catalog: `.mrmr/dev/contracts/contract-keys.json` after `mrmr space apply`.
- `flow_ref` = apply-time flow identity; `qualified_step_id` = dot path (`build.build-loop`).
- Matching is exact (+ explicit multi-key on one handler). No wildcards in v1.
- Human-step keys may appear in multi-key handlers for **scope/documentation only** — engine opens presentation instead of dispatching shell.

Verify coverage: `murrmure_list_handlers` (agent skill) or `mrmr space doctor`.

## Strict apply loop

```bash
# edit .mrmr/flows/…/flow.manifest.yaml and .mrmr/space/handlers.yaml
mrmr space apply --strict    # fail on lint warnings
mrmr space doctor            # handler coverage, skill version, MCP hints
mrmr space status            # indexed counts + digests
```

Common apply lint codes:

| Code | Fix |
|------|-----|
| `HANDLER_CONTRACT_KEY_UNKNOWN` | Key not in flow catalog — fix typo or re-apply after manifest edit |
| `HANDLER_CONTRACT_KEY_UNCOVERED` | Flow step has no handler — add handler or binding |
| `CHECKPOINT_VIEW_DIST_MISSING` | Build view `dist/` before apply |
| `UNSUPPORTED_STEP_KIND` | Remove legacy `invoke:` / `checkpoint:` kinds — use step contracts |

## Flow & view init

```bash
mrmr space init
mrmr space flow init preview-review --template hello-gate
mrmr space view init preview-review-intake
mrmr space link --path . --space spc_…   # or --create
mrmr space apply --strict
mrmr view dev preview-review-intake      # fixture dev loop
```

Inside a `.mrmr/` repo, legacy `mrmr flow init` redirects to `mrmr space flow init`.

## Preview-review handlers walkthrough

Reference: `examples/flows/preview-review-v2/.mrmr/space/handlers.yaml`.

| Handler | contract_keys | Role |
|---------|---------------|------|
| `feature_write_spec` | `preview-review.write_spec` | Copy intake spec to repo; resolve `completed` |
| `feature_build` | `preview-review.build`, `preview-review.build.build-loop`, `preview-review.build.review` | Multi-key owner for build subgraph; prompt owns nested loop |
| `feature_archive` | `preview-review.archive` | Move spec to archive |
| `feature_commit` | `preview-review.commit` | Git commit + resolve with payload |

Flow manifest (`preview-review`) uses v2.2 nested steps under `build`:

- `build.build-loop` — agent resolves with `{ preview_url }`.
- `build.review` — human `presentation:` view; agent waits via `murrmure_wait_for_run`.
- `changes_required` → `goto: build-loop` for another round.

Handler prompt pattern for `feature_build`:

- You own `build.build-loop` — resolve when preview URL ready.
- Human owns `build.review` — never resolve review yourself.
- On changes: fix, resolve `build.build-loop` again.

YAML anchors (`x-agent-cmd`) keep command DRY across handlers.

## Non-negotiable rules

1. **Index via apply** — editing `.mrmr/flows/` alone does not change runtime until apply succeeds.
2. **Protocol vs execution** — flows declare branches/schemas; handlers declare commands/prompts.
3. **No `executor.action`** in manifests — rejected at apply.
4. **Human UX on `presentation:` steps** — not on triggers.
5. **Custom views are primary** — ViewCanvasHost fills main canvas; shell forms are operator fallback.

## Install

```bash
mrmr skill install --variant developer   # this skill only
mrmr skill install --variant all         # developer + murrmure-agent
```
