---
name: murrmure-developer
description: >-
  Authoring skill for `.mrmr/` spaces: handlers, contract keys, flow/view
  authoring, and apply-time validation workflows.
version: 1.3.0
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
2. **Edit protocol** — flow manifests: `triggers`, resolver-agnostic steps and branches (`route`/`resume`). No `role`/`presentation`/`start`/`requires_view`. No `executor.action`, no View identity.
3. **Edit execution** — `handlers.yaml`: bind steps with `on: step.opened::{flow_name}.{step_id}`; map prompt-scope `contract_keys`; bind Views with `view_resolver`.
4. **Wire keys** — after apply, read `.mrmr/dev/contracts/contract-keys.json`; align handler `contract_keys` with catalog entries.
5. **Validate** — `mrmr space apply --strict`; `mrmr space doctor`; fix lint warnings.
6. **Install skills** — `mrmr skill install --variant all` in authoring repos.

## Handlers (`handlers.yaml`)

Handlers replace legacy `actions.yaml`, `hooks.yaml`, and per-step `executor.action` for default spaces. A step is bound by its `on::key` alias; `contract_keys` is prompt-scope only.

```yaml
version: 1
handlers:
  - id: my_step_handler
    contract_keys:
      - my-flow.my_step          # prompt-scope only
    on: step.opened::my-flow.my_step   # step.opened::{flow_name}.{step_id} | step.resolved::… | event: { type, source? }
    type: shell_spawn             # shell_spawn | mcp_session | queue_poll | remote_hub | view_resolver
    complete: explicit            # auto | cli | explicit
    prompt: |
      Read the specification and implement the requested change.
      Propose a conventional commit subject and one-sentence description.
    command: cursor agent -p --force {{prompt}}
    timeout_ms: 3600000

  # Bind a locally built View to a step (executor-free).
  - id: intake_view
    on: step.opened::my-flow.intake
    type: view_resolver
    view: my-intake-view
```

| Field | Notes |
|-------|-------|
| `on` | `step.opened::{flow_name}.{step_id}` dispatches bound steps; `step.resolved::…` reacts; bare `step.opened` is rejected. A step may have at most one `step.opened` resolver; unbound steps stay open and externally resolvable (`resolver: null`). |
| `contract_keys` | Prompt-scope addresses for multi-key subgraph owners; empty for event-only and `view_resolver` handlers |
| `complete: explicit` | Handler prompt must instruct agent to call `murrmure_resolve_step` |
| `complete: cli` | Command must invoke `mrmr step resolve`; lint enforces |
| `view` | Required for `view_resolver`: the `view_id` of a locally built View in `.mrmr/views/`. `view_resolver` forbids `command`/`prompt`/`params`/`cwd`. |
| `kill_on` | **Removed** — authored `kill_on` is rejected; assignment termination is runtime-owned |

### Prompt protocol

Write only the domain Task in `prompt:`. The Hub appends
`Protocol: murrmure.agent/v1` from the canonical compiled contract, including
deterministic Draft 2020-12 schemas, separate artifact requirements, live
run/step IDs, and one complete resolve call per branch. Do not author resolve
calls, run IDs, Session metadata, discovery prose, or tool lists.

Use one `contract_keys` entry for a normal step assignment; it receives
Contracts only. Use multiple keys only for a genuine subgraph owner that needs
Discovery. The spawned MCP bridge uses ephemeral run/step/handler authority,
never the persistent local connection. Local artifact calls use paths under the
active workdir; remote/federated calls use authorized upload references.

### Shell command grammar (safe interpolation)

A `shell_spawn` `command` runs under a strict grammar so dynamic values can
never become shell fragments:

- **One complete unquoted argument per placeholder**, shell-quoted once by the
  runtime. Spaces, apostrophes, `$()`, backticks, newlines, leading dashes, and
  Unicode stay literal data.
- **Rejected before spawn**: author-quoted placeholders (`'{{x}}'`,
  `"{{x}}"`), embedded forms (`--flag={{x}}`, `pre{{x}}post`), and unknown
  placeholders. Missing/null → `HANDLER_BINDING_VALUE_MISSING`; empty string
  stays one empty argument.
- **`{{prompt}}`** is delivered via stdin (stripped) for prompt-scoped handlers;
  **`{{space_root}}`** is resolved in `cwd` as a path.
- **Artifact path tokens** (`{{murrmure.step.{producer}.artifact.{slot}.path}}`)
  resolve to a verified, digest-checked consumer copy under
  `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}` —
  the original artifact is never mutated.
- Multiline commands run as `/bin/sh -e -c "<script>"` (no login profile, no
  silent fallback); omitted `cwd` defaults to the space root, omitted
  `delivery` defaults to `fail_fast`. `timeout_ms` caps the run; on timeout the
  whole process group is terminated (SIGTERM → 5s → SIGKILL).

```yaml
  - id: write_spec_copy
    on: step.opened::my-flow.write_spec
    type: shell_spawn
    complete: auto
    command: |
      mkdir -p specs/current
      cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md
    timeout_ms: 10000
```

### Safe repository automation

A handler that commits to the space repository owns its Git policy — Murrmure
has no platform Git-cleanliness contract, so keep it in the handler script, not
the portable flow:

- **Preflight before the first mutation.** The first repository-mutating
  handler fails before mutating when the tree is dirty (staged, unstaged, or
  non-ignored untracked): `git diff --quiet`, `git diff --cached --quiet`,
  `test -z "$(git ls-files --others --exclude-standard)"`. Pair with a
  `run_policies` `max_concurrent_runs: 1` so no second run races the mutation.
- **Stage an explicit allowlist only.** Derive the workflow-owned paths and
  `git add -- <path>…` only those. Never `git add -A` or `git add .` — reject
  any changed path outside the allowlist and fail the run instead of committing
  it. List individual files with `git status --porcelain -z
  --untracked-files=all` (without `--untracked-files=all` Git collapses a new
  untracked directory and the allowlist match misses the archived file).
- **Keep scratch outside Git.** `.mrmr/dev` stays gitignored; run scratch and
  the original uploaded artifact never enter the index and are not deleted.
- **Validate commit data before mutating.** Check the run id, commit subject
  (no newlines), and description before `git commit`, and pass them as separate
  arguments so shell metacharacters and multiline bodies stay literal.
- **Failures are ordinary handler failures.** Missing identity, a non-Git
  directory, an archive collision, a no-op, or a commit failure exits nonzero
  through the normal handler/run path — no rollback, retry, or recovery engine.

### Artifact collections and retention

A slot is a **bounded, ordered file collection**. `max_files` defaults to `1`
(singleton); `max_files > 1` declares a collection, with optional `min_files`
and `max_total_bytes`. Each file independently satisfies MIME, extension, and
byte constraints; normalized duplicate filenames fail; submission and manifest
preserve deterministic order. Archives remain opaque single files.

```yaml
artifact_slots:
  assets:
    media_types: [application/json, text/yaml]
    extensions: [.json, .yaml, .yml]
    min_files: 1
    max_files: 4
    max_bytes: 262144
    max_total_bytes: 1048576
```

**Token shapes are not interchangeable:**

- Singleton slots bind `{{murrmure.step.{producer}.artifact.{slot}.path}}` → one
  verified consumer file.
- Collection slots bind `{{murrmure.step.{producer}.artifact.{slot}.directory}}`
  → one verified consumer directory containing every file in the ordered
  collection (normalized unique names, digest-verified, all-or-nothing).

A `.path` binding on a collection (or `.directory` on a singleton) is rejected
at apply time (`HANDLER_BINDING_VALUE_MISSING`) and lints as
`ARTIFACT_TOKEN_CARDINALITY_MISMATCH`.

**Local-vs-federated boundary:** a local handler receives the verified
directory/file under
`.mrmr/dev/runs/{run_id}/steps/{consumer}/inputs/{slot}/`. A remote/federated
consumer never receives a producer path — it receives ordered immutable
references (`transfer_id`, `digest`, `size_bytes`) and materializes them in its
own space. The journaled audit carries opaque references only.

**Run retention:** active run directories are never collected. Terminal local
bytes expire at `ended_at + 7 days`; GC runs at Hub startup and every 24 hours
and removes only the per-run tree, preserving journal metadata and global
artifact references. No manual GC command or release-time override ships. See
ADR-014. A standalone collection example lives in
`test-utils/spaces/collection-example`.

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

### Run policies (space-owned concurrency)

`run_policies` caps how many **non-terminal runs** of a flow may exist at once
in **this space**. The portable flow carries no concurrency policy, so add it
here — not to the flow manifest.

```yaml
version: 1
run_policies:
  - flow: my-dev-flow            # authored alias = applied flow name
    max_concurrent_runs: 1       # integer >= 1; omit for unlimited
handlers: [ … ]
```

- `flow` is the applied flow's `name`, resolved at apply against the fully merged
  flow set (local + bound + preserved). A limit of `1` serializes repo-mutating
  flows; a second start while the first is non-terminal returns
  `409 FLOW_CONCURRENCY_LIMIT` with the blocking run IDs — no queue, no partial
  run.
- **No entry means unlimited.** Omit the policy for read-only or parallel-safe
  flows; unrelated unbounded flows keep running concurrently.
- Apply resolves aliases atomically; unknown/ambiguous/duplicate names fail apply
  with `RUN_POLICY_UNKNOWN_FLOW` / `RUN_POLICY_AMBIGUOUS_FLOW` /
  `RUN_POLICY_DUPLICATE` and preserve the prior index.
- Admitted runs pin the applied `flow_digest`; do not add `max_concurrent_runs`
  (or any execution policy) to `flow.manifest.yaml`.

## Contract keys

```text
on := step.(opened|resolved)::{flow_name}.{qualified_step_id}   # binding
contract_key := {flow_ref}.{qualified_step_id}                   # prompt-scope only
```

- Binding is via `on::key` (exact, explicit; no wildcards, no bare `step.opened`).
- `contract_keys` documents prompt scope for multi-key subgraph owners; it is no longer the binding key.
- Generated catalog: `.mrmr/dev/contracts/contract-keys.json` after `mrmr space apply`.
- A step key may appear in multi-key handlers for **scope/documentation only** — the engine only dispatches steps with a bound `on::key` handler; unbound steps stay open for external resolution.

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
| `HANDLER_ORPHAN_KEY` | Prompt-scope key not in flow catalog — fix typo or re-apply after manifest edit |
| `HANDLER_COMPLETE_CLI_NO_RESOLVE` | `complete: cli` command lacks `mrmr step resolve` |
| `DUPLICATE_FLOW_NAME` | Two applied flows share a `name` — rename one |
| `HANDLER_ORPHAN_ALIAS` | `on::key` references an unknown flow/step |
| `HANDLER_RESOLVER_CONFLICT` | More than one `step.opened` resolver for a step |
| `VIEW_RESOLVER_NOT_OPENED` | `view_resolver` must bind `step.opened::…` |
| `VIEW_RESOLVER_VIEW_NOT_FOUND` | `view_id` unknown to the space index |
| `VIEW_RESOLVER_BUILD_MISSING` | Build the View (`npm run build`) before apply |
| `RUN_POLICY_UNKNOWN_FLOW` | `run_policies.flow` does not match an applied flow name — fix the alias |
| `RUN_POLICY_AMBIGUOUS_FLOW` | `run_policies.flow` matches more than one applied flow — disambiguate (rename a flow) |
| `RUN_POLICY_DUPLICATE` | Two `run_policies` entries target the same flow — keep one |
| `UNSUPPORTED_STEP_KIND` | Remove legacy `invoke:` / `checkpoint:` kinds — use step contracts |

`HANDLER_MISSING` is removed: an unbound step is valid and observability-only.

### Apply quiescence

`mrmr space apply` replaces the whole space config at once, so it is **refused
while any non-terminal run** (`working` / `input-required`) still relies on the
current handlers/Views — it returns `409 SPACE_HAS_ACTIVE_RUNS` with the
blocking run IDs and preserves the prior index (no partial replacement is
visible). Wait for runs to terminate (or cancel them), then re-apply. There is
no force apply and no auto-abort. This is distinct from a per-flow
`FLOW_CONCURRENCY_LIMIT` at start.

## View authoring (`view_resolver`)

A `view_resolver` binds a locally built View (`.mrmr/views/<id>`) to a step. The
shell loads it in a hardened iframe host; Views use the v3 SDK contract — no hub
credential, host-mediated submit/cancel:

```tsx
import { createViewMount, useViewContract } from "@murrmure/view-sdk/app";

function App() {
  const { context, ready, submitBranch, cancel, submission } = useViewContract();
  if (!ready) return null;
  // context.step.branches[] carries each branch's schema + artifact_slots
  return <>
    <button onClick={() => submitBranch("continue", { files: { spec } })}>Submit</button>
    {submission.status === "uploading"
      ? <button onClick={submission.cancel}>Cancel upload</button>
      : <button onClick={cancel}>Cancel workflow</button>}
  </>;
}
createViewMount({ App });
```

Dev loop: `mrmr view dev <id>` loads `dev/fixtures/*.json` (`mode: "dev"`); submit
validates and logs sanitized non-mutating intents only. Production Views pass
`File`/`Blob` objects to the host and never receive upload intent IDs or Hub
credentials. `submission` reports monotonic aggregate progress;
`submission.cancel()` aborts pre-commit upload while top-level `cancel()` selects
the workflow cancel branch. See [View SDK](../../apps/docs/reference/view-sdk.md).

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

### Tutorial v3 conformance fixtures

When changing behavior shown by Tutorial v3, reuse the progressive snapshots in
`test-utils/spaces/tutorial-v3/` and the helpers in `test-utils/tutorial-v3/`.
Activate only the skipped assertions owned by the current build task. Keep
behavior-defining Markdown fences linked through `fences.json`; do not copy a
second fixture or merge an expected-failing test.

## Preview-review handlers walkthrough

Reference: [Tutorial 1a — Part 5: extend flow and handlers](../../apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md) — full `handlers.yaml` snippet.

| Handler | on::key | Role |
|---------|---------|------|
| `feature_write_spec` | `step.opened::preview-review.write_spec` | Copy intake spec to repo; resolve `completed` |
| `feature_build` | `step.opened::preview-review.build` | Multi-key owner for build subgraph (`contract_keys` prompt-scope: `build`, `build.build-loop`, `build.review`); prompt owns nested loop |
| `feature_archive` | `step.opened::preview-review.archive` | Move spec to archive |
| `feature_commit` | `step.opened::preview-review.commit` | Git commit + resolve with payload |

Flow manifest (`preview-review`) uses resolver-agnostic nested steps under `build`:

- `build.build-loop` — agent resolves with `{ preview_url }`.
- `build.review` — human step with no bound handler, open and externally resolvable; agent waits via `murrmure_wait_for_run`.
- `changes_required` → `route: { step: build.build-loop }` for another round.

Handler prompt pattern for `feature_build`:

- You own `build.build-loop` — resolve when preview URL ready.
- Human owns `build.review` — never resolve review yourself.
- On changes: fix, resolve `build.build-loop` again.

YAML anchors (`x-agent-cmd`) keep command DRY across handlers.

## Non-negotiable rules

1. **Index via apply** — editing `.mrmr/flows/` alone does not change runtime until apply succeeds.
2. **Protocol vs execution** — flows declare branches/schemas; handlers declare commands/prompts.
3. **No `executor.action`** in manifests — rejected at apply.
4. **Human UX lives on steps, not triggers** — a step's human UI is bound by the space (`view_resolver` + Views), never declared in the portable flow.
5. **Custom views are primary; no fallback forms** — a bound `view_resolver` fills the canvas; the shell synthesizes no built-in form. Unbound steps are observability-only.

## Install

```bash
mrmr skill install --variant developer   # this skill only
mrmr skill install --variant all         # developer + murrmure-agent
```
