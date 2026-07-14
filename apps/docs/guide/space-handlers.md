# Space handlers & contract keys

Spaces own **execution** — what runs when a step opens, how agents are invoked, how a step is presented, and how completion is signaled. After the handlers cutover, that lives in **`.mrmr/space/handlers.yaml`**. A step handler binds to a resolver-agnostic step with **`on: step.opened::{flow_name}.{qualified_step_id}`** (the `on::key` binding); `contract_keys` is now **prompt-scope only**.

Flow manifests carry **protocol only** — step shape, branches. No `executor.action`, no `role`, no `presentation`, no View identity in portable flow definitions. A space binds a custom View to a step with a **`view_resolver`** handler.

Normative bridge: [handlers.md](https://github.com/murrmure/agentStudio/blob/main/studio-specs/current/bridges/handlers.md) (`studio-specs/current/bridges/handlers.md`). Boundary decision: [ADR-009](https://github.com/murrmure/agentStudio/blob/main/studio-specs/ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md).

## Handler file

**Path:** `.mrmr/space/handlers.yaml`

```yaml
version: 1
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

## Legacy files (pre-cutover)

`actions.yaml`, `hooks.yaml`, and `executors.yaml` under `.mrmr/space/` are accepted until HANDLER-CUTOVER but **new spaces should use `handlers.yaml` only**. Migrate invoke/hook chains to handlers with matching `contract_keys` or `on: event:`.

## Doctor and apply

```bash
mrmr space apply --strict     # lint handler coverage + contract_key alignment
mrmr space doctor             # handler lint, missing bindings, MCP hints
mrmr space doctor --strict    # fail on worker spaces without bindings
```

Common lint codes: `HANDLER_ORPHAN_KEY` (prompt-scope key with no matching step), `HANDLER_COMPLETE_CLI_NO_RESOLVE`, and the apply-time binding codes — `DUPLICATE_FLOW_NAME`, `HANDLER_ORPHAN_ALIAS`, `HANDLER_RESOLVER_CONFLICT`, `VIEW_RESOLVER_NOT_OPENED`, `VIEW_RESOLVER_VIEW_NOT_FOUND`, `VIEW_RESOLVER_BUILD_MISSING`. `HANDLER_MISSING` is removed: an unbound step is valid and observability-only.

## Related

- [Space index](./space-index) — `.mrmr/` layout
- [Creating flows](./creating-flows) — manifest authoring
- [CLI — step resolve](./cli#mrmr-step-resolve)
- [MCP tools](../reference/mcp-tools) — `murrmure_list_handlers`, `murrmure_resolve_step`
- [Troubleshooting](./troubleshooting) — handler and contract_key errors
