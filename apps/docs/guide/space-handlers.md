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
      Copy intake spec, then resolve via murrmure_resolve_step …
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
- **Artifact path tokens** like `{{murrmure.step.{producer}.artifact.{slot}.path}}`
  resolve only for local execution to a **verified, digest-checked, run-scoped
  consumer copy** at
  `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`. The
  original artifact is never mutated.
- **Execution.** Multiline commands run as `/bin/sh -e -c "<script>"` with no
  login profile and no silent shell fallback. Omitted `cwd` defaults to the
  space root; omitted `delivery` defaults to fail fast.
- **Timeout and termination.** `timeout_ms` (default 30000) caps the run. On
  timeout, cancellation, external resolution, yield, run terminal, or Desktop
  shutdown the runtime sends process-group `SIGTERM`, waits five seconds, then
  `SIGKILL`, and records one terminal result. Authored `kill_on` is removed.
- **Credentials.** Each spawned handler receives a short-lived run/step-scoped
  `MURRMURE_HUB_TOKEN` (resolve capability only), never the persistent machine
  connection. The journal and public APIs never receive a local path or
  credential.

## `mrmr step resolve` (operator / shell path)

For `complete: cli` handlers, or shell scripts that need hub resolve without MCP:

```bash
# Requires MURRMURE_RUN_ID, MURRMURE_STEP_ID, MURRMURE_HUB_URL, MURRMURE_HUB_TOKEN
mrmr step resolve --branch completed --payload-json '{"preview_url":"http://localhost:3000"}'
```

Hub injects short-lived run-scoped `MURRMURE_HUB_TOKEN` on `shell_spawn` dispatch (resolve capability only). `mrmr step resolve` uses `MURRMURE_HUB_URL` explicitly.

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
