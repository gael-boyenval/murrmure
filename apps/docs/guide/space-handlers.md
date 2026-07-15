# Space handlers & contract keys

Spaces own **execution** — what runs when a step opens, how agents are invoked, how a step is presented, and how completion is signaled. After the handlers cutover, that lives in **`.mrmr/space/handlers.yaml`**. A step handler binds to a resolver-agnostic step with **`on: step.opened::{flow_name}.{qualified_step_id}`** (the `on::key` binding); `contract_keys` is now **prompt-scope only**.

Flow manifests carry **protocol only** — step shape, branches. No `executor.action`, no `role`, no `presentation`, no View identity in portable flow definitions. A space binds a custom View to a step with a **`view_resolver`** handler.

Normative bridge: [handlers.md](https://github.com/murrmure/agentStudio/blob/main/studio-specs/current/bridges/handlers.md) (`studio-specs/current/bridges/handlers.md`). Boundary decision: [ADR-009](https://github.com/murrmure/agentStudio/blob/main/studio-specs/ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md).

## Handler file

**Path:** `.mrmr/space/handlers.yaml`

```yaml
version: 1
run_policies:
  - flow: preview-review
    max_concurrent_runs: 1
handlers:
  - id: feature_write_spec
    contract_keys: [preview-review.write_spec]   # prompt-scope only
    on: step.opened::preview-review.write_spec
    type: shell_spawn
    complete: explicit
    prompt: |
      Copy the intake spec and implement the requested change.
      Propose a conventional commit subject and a one-sentence description.
    command: cursor agent -p --force {{prompt}}
    cwd: "{{space_root}}"

  # Bind a locally built View to the intake step.
  - id: intake_view
    on: step.opened::preview-review.intake
    type: view_resolver
    view: preview-review-intake
```

| Field | Notes |
|-------|-------|
| `on` | `step.opened::{flow_name}.{qualified_step_id}` \| `step.resolved::…` \| `event: { type, source? }`. Bare `step.opened` is rejected. |
| `type` | `shell_spawn` \| `mcp_session` \| `queue_poll` \| `remote_hub` \| `view_resolver` |
| `contract_keys` | Prompt-scope addresses (which steps a prompt-scoped handler may address); empty for event-only and `view_resolver` handlers |
| `complete` | `auto` \| `cli` \| `explicit` — who calls resolve after shell dispatch. Not applicable to `view_resolver` (always explicit, host-mediated). |
| `view` | Required for `view_resolver`: the `view_id` of a locally built View in `.mrmr/views/`. |
| `kill_on` | **Removed.** Authored `kill_on` is rejected; assignment termination is runtime-owned. |

**`view_resolver` is executor-free** — it carries `view` and binds `step.opened::…` only, and forbids `command`, `prompt`, `params`, and `cwd`.

**Full walkthrough:** [Tutorial 1b — handlers](./tutorials/01-local-preview-review/04-prompt-triggers.md) includes a complete `handlers.yaml` for the preview-review flow.

## `on::key` binding and contract keys

```text
on := step.(opened|resolved)::{flow_name}.{qualified_step_id}
contract_key := {flow_ref}.{qualified_step_id}   # prompt-scope only
```

- `{flow_name}` is the applied flow's `name`; `{qualified_step_id}` is the dot path from `StepContractCatalog.step_ids` (e.g. `build.build-loop`).
- Binding is exact and explicit via `on::key`; there is no wildcard and no lifecycle-only `on: step.opened` dispatch. A step may have at most one `step.opened` resolver.
- `contract_keys` documents prompt scope for multi-key subgraph-owner handlers; it is no longer the binding key.

Human-step keys may appear in `contract_keys` for **scope/documentation** on subgraph-owner handlers — they are never dispatched on `step.opened`. A human step is presented by a space-bound **`view_resolver`** (the space owns the View), or left unbound and **observability-only** (no built-in form is synthesized).

### Prompted agent contract

Keep `prompt:` focused on the domain Task. At dispatch the Hub appends a
generated protocol block beginning exactly `Protocol: murrmure.agent/v1`.
For each active branch it includes the complete compact Draft 2020-12 payload
schema, separate artifact constraints, the compiled control effect, and a full
`murrmure_resolve_step` call with live run/step IDs and valid example values.
Do not copy resolve mechanics or IDs into the authored prompt.

One `contract_keys` entry emits Contracts only. More than one additionally emits
Discovery so a subgraph owner can retrieve full scoped contracts after a
transition. The v1 block has no Session, MCP-tools, or separate Resolve-API
section. Cancel, failure, and custom branches use the same neutral template.

## Complete modes

| Mode | Who resolves | Typical use |
|------|--------------|-------------|
| `auto` | Hub after shell exits successfully | Fire-and-forget scripts |
| `cli` | Shell command must call `mrmr step resolve` | Scripts that branch on exit code |
| `explicit` | Agent/human calls `murrmure_resolve_step` or `mrmr step resolve` | Cursor agent prompts (default for agent steps) |

Lint warns when `complete: cli` handlers lack `mrmr step resolve` in the command string.

## Shell command grammar and tokens

A `shell_spawn` `command` runs under a strict, safe execution model so dynamic
values can never become shell fragments and the runtime owns process lifecycle.

- **One complete argument.** Every dynamic placeholder must occupy one whole
  unquoted argument, and the runtime shell-quotes it exactly once. Spaces,
  apostrophes, quotes, `$()`, backticks, newlines, leading dashes, and Unicode in
  a resolved value stay literal data.

  ```yaml
  # correct — placeholder is one complete argument
  command: |
    mkdir -p specs/current
    cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md
  ```

- **Rejected forms** (apply/runtime fails before spawn): author-quoted
  placeholders (`'{{x}}'`, `"{{x}}"`), embedded forms (`--flag={{x}}`,
  `pre{{x}}post`, `{{a}}{{b}}`), and unknown placeholders. A missing or null
  binding fails with `HANDLER_BINDING_VALUE_MISSING`; a schema-valid empty
  string remains one empty argument.
- **`{{prompt}}`** is delivered via stdin (stripped from the command) for
  prompt-scoped handlers, or substituted as one quoted argument otherwise.
  **`{{space_root}}`** is resolved in the `cwd` field as a path, not shell-quoted.
- **Artifact path tokens** like
  <code v-pre>{{murrmure.step.{producer}.artifact.{slot}.path}}</code>
  resolve only for local execution to a **verified, digest-checked, run-scoped
  consumer copy** at
  `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`. The
  original artifact is never mutated; the copy is atomic (temp file + rename)
  and symlink-hardened on both ends — a symlinked source, a symlinked parent, a
  symlinked destination parent, or a pre-existing symlink at the destination
  filename is rejected, and a traversal or digest mismatch refuses the copy
  before any consumer bytes are written.
- **Multi-file collections.** A slot with `max_files > 1` is a bounded, ordered
  collection (`min_files`, `max_total_bytes` optional). Bind it with the
  <code v-pre>{{murrmure.step.{producer}.artifact.{slot}.directory}}</code>
  token, which resolves to one verified consumer directory containing every file
  in the ordered collection (normalized unique names, digest-verified,
  all-or-nothing). A `.path` on a collection or `.directory` on a singleton is
  rejected before spawn (`HANDLER_BINDING_VALUE_MISSING`) and lints as
  `ARTIFACT_TOKEN_CARDINALITY_MISMATCH`. Remote/federated consumers receive
  ordered immutable references (`transfer_id`, `digest`, `size_bytes`) instead
  of a producer path — never echo a `.mrmr/dev/runs` path into a resolve
  payload or event.
- **Run retention.** `.mrmr/dev/runs/{run_id}/` is the only local run root.
  Active run directories are never garbage-collected. Terminal local bytes
  (`completed`/`failed`/`cancelled` with `ended_at`) expire at
  `ended_at + 7 days`; the Hub sweeps at startup and every 24 hours, removing
  only the per-run tree while preserving journal metadata and global artifact
  references. No manual GC command or release-time override ships.
- **Execution.** Multiline commands run as `/bin/sh -e -c "<script>"` with no
  login profile and no silent shell fallback. Omitted `cwd` defaults to the
  space root; omitted `delivery` defaults to fail fast.
- **Timeout and termination.** `timeout_ms` (default 30000) caps the run. On
  timeout, cancellation, external resolution, yield, run terminal, or Desktop
  shutdown the runtime sends process-group `SIGTERM`, waits five seconds, then
  `SIGKILL`, and records one terminal result. Shutdown awaits that escalation
  before exiting, and a timeout followed by run-failure cancellation signals the
  group exactly once. Authored `kill_on` is removed.
- **Credentials.** Each spawned handler receives a short-lived
  run/step/handler-scoped `MURRMURE_HUB_TOKEN` (resolve capability only), never
  the persistent machine connection. The token expires, is scoped to the one
  run/step/space, and is enforced on every `step:resolve` endpoint (resolve,
  upload-intent creation, file transfer, abandon) — it cannot act for another
  run, step, or space. It is revoked when the step resolves, the run ends, or
  the hub shuts down. The journal and public APIs never receive a local path or
  credential; artifact path tokens appear in the audit as opaque references, not
  local paths.
- **Connected-agent authority.** Prompted handlers also receive
  `MURRMURE_ASSIGNMENT_SCOPE`. Their installed local MCP descriptor detects this
  assignment and uses only the ephemeral token; it does not read the persistent
  OS-store connection. The persistent setup connection can discover/start work,
  but the spawned assignment can mutate only its own run and step.

### Repository automation

A handler that commits to the space repository owns its own Git policy —
Murrmure has no platform Git-cleanliness contract. Keep that policy in the
handler script, not in the portable flow, and follow a few rules so a run never
commits unrelated or sensitive files:

- **Preflight a clean worktree before the first mutation.** The first
  repository-mutating handler should fail before mutating when the tree is dirty
  — staged, unstaged, or non-ignored untracked:
  `git diff --quiet`, `git diff --cached --quiet`, and
  `test -z "$(git ls-files --others --exclude-standard)"`. Run serialization
  (`run_policies`) then guarantees no second run can race the mutation.
- **Stage an explicit allowlist, never the whole tree.** Derive the exact
  workflow-owned paths and `git add -- <path>…` only those. Never `git add -A`
  or `git add .` — a stray file, a credential, or `.mrmr/dev` scratch would
  otherwise enter the index. Reject any changed path outside the allowlist and
  fail the run rather than committing it.
- **List individual files.** `git status --porcelain -z --untracked-files=all`
  lists each untracked file; without `--untracked-files=all` Git collapses a new
  untracked directory to a single entry and the allowlist match misses the
  archived file.
- **Keep scratch outside Git.** `.mrmr/dev` stays gitignored; run scratch and
  the original uploaded artifact never enter the index and are not deleted by
  cleanup.
- **Validate commit data before mutating.** Check the run id, commit subject
  (no newlines), and description before any `git commit`, and pass them as
  separate arguments so shell metacharacters and multiline bodies stay literal.
- **Failures are ordinary handler failures.** Missing identity, a non-Git
  directory, an archive collision, a no-op, or a commit failure exits nonzero
  through the normal handler/run path — no rollback, retry, or second recovery
  engine. Document the simple recovery (configure identity, clean the tree,
  re-run).

## `mrmr step resolve` (operator / shell path)

For `complete: cli` handlers, or shell scripts that need hub resolve without MCP:

```bash
# Requires MURRMURE_RUN_ID, MURRMURE_STEP_ID, MURRMURE_HUB_URL, MURRMURE_HUB_TOKEN
mrmr step resolve --branch completed --payload-json '{"preview_url":"http://localhost:3000"}'
```

Hub injects short-lived run/step/handler-scoped `MURRMURE_HUB_TOKEN` on `shell_spawn` dispatch (resolve capability only). It expires and is scoped to the one run/step/space, is enforced on every `step:resolve` endpoint (resolve, upload-intent creation, file transfer, abandon), and is revoked when the step/run ends or the hub shuts down. `mrmr step resolve` uses `MURRMURE_HUB_URL` explicitly and is denied on a run/step/space scope mismatch or expired/revoked token.

Agents in IDE sessions should prefer **`murrmure_resolve_step`** MCP tool (`step:resolve` capability).

## View resolvers

A `view_resolver` binds a locally built View to a step. The shell loads the View
from the open-step projection in a **hardened iframe host** (sandboxed,
host-mediated postMessage, no hub credential). Authors use the View SDK
`useViewContract` / `submitBranch(branch, params)` / `cancel()` — see
[View SDK](../reference/view-sdk). Apply validates the `view_id` and its build
atomically; an unknown or unbuilt View fails apply and preserves the prior index.

## Event handlers

Event-driven handlers use `on: event:` instead of `contract_keys`:

```yaml
handlers:
  - id: wake_on_publish
    on:
      event:
        type: spec.published
    type: shell_spawn
    complete: explicit
    prompt: |
      Spec published — read and implement …
    command: cursor agent -p --force {{prompt}}
```

Discover emittable types with **`murrmure_list_emittable_events`**. Emit from agents with **`murrmure_emit_event`** (`event:emit` capability).

## Run policies

`run_policies` declares how many **non-terminal runs** of a flow may exist at
once in **this space**. It is space-owned — the portable flow carries no
concurrency policy, so the same flow may serialize in one space and run
unbounded in another.

```yaml
run_policies:
  - flow: preview-review
    max_concurrent_runs: 1
```

| Field | Notes |
|-------|-------|
| `flow` | Authored alias: the applied flow's `name` (not a `flow_id`). Resolved at apply against the fully merged flow set (local + bound + preserved). |
| `max_concurrent_runs` | Integer ≥ 1. **Omitting a policy means unlimited** — concurrent runs are admitted. |

Every start path (manual, trigger, API, MCP, federated) funnels through one
atomic admission check. On overflow the start **creates no queue and no partial
run** and returns `409 FLOW_CONCURRENCY_LIMIT` carrying the canonical flow
identity, the configured limit, and the active blocking run IDs. A trigger that
is denied at capacity is recorded as a `mrmr.flow.start_denied` journal event
and a later retry performs a fresh admission check.

Run-policy aliases are resolved at apply, so a policy for an unknown, ambiguous,
or duplicate flow name fails apply atomically with a typed code
(`RUN_POLICY_UNKNOWN_FLOW`, `RUN_POLICY_AMBIGUOUS_FLOW`,
`RUN_POLICY_DUPLICATE`) and preserves the prior index. An admitted run and its
journal events pin the applied `flow_digest` that was current at start.

## Legacy files (pre-cutover)

`actions.yaml`, `hooks.yaml`, and `executors.yaml` under `.mrmr/space/` are accepted until HANDLER-CUTOVER but **new spaces should use `handlers.yaml` only**. Migrate step reactions to exact `on: step.opened::{flow_name}.{qualified_step_id}` bindings and journal reactions to `on: event:`.

## Doctor and apply

```bash
mrmr space apply --strict     # lint handler coverage + contract_key alignment
mrmr space doctor             # handler lint, missing bindings, MCP hints
mrmr space doctor --strict    # fail on worker spaces without bindings
```

Common lint codes: `HANDLER_ORPHAN_KEY` (prompt-scope key with no matching step), `HANDLER_COMPLETE_CLI_NO_RESOLVE`, and the apply-time binding codes — `DUPLICATE_FLOW_NAME`, `HANDLER_ORPHAN_ALIAS`, `HANDLER_RESOLVER_CONFLICT`, `VIEW_RESOLVER_NOT_OPENED`, `VIEW_RESOLVER_VIEW_NOT_FOUND`, `VIEW_RESOLVER_BUILD_MISSING`, and the run-policy codes — `RUN_POLICY_UNKNOWN_FLOW`, `RUN_POLICY_AMBIGUOUS_FLOW`, `RUN_POLICY_DUPLICATE`. `HANDLER_MISSING` is removed: an unbound step is valid and observability-only.

### Apply quiescence

`mrmr space apply` replaces a space's whole configuration atomically. To keep an
in-flight run from executing against handlers/Views that were swapped
underneath it, **an apply succeeds only when the space has no non-terminal runs**
(`working` or `input-required`). While any such run exists the apply returns
`409 SPACE_HAS_ACTIVE_RUNS` with the blocking run IDs and **preserves the prior
index** — no partial replacement is visible. Apply succeeds immediately once all
runs become terminal (`completed` / `failed` / `canceled`). There is no force
apply and no auto-abort; either wait for the run to finish or cancel it.

## Related

- [Space index](./space-index) — `.mrmr/` layout
- [Creating flows](./creating-flows) — manifest authoring
- [CLI — step resolve](./cli#mrmr-step-resolve)
- [MCP tools](../reference/mcp-tools) — `murrmure_list_handlers`, `murrmure_resolve_step`
- [Troubleshooting](./troubleshooting) — handler and contract_key errors
