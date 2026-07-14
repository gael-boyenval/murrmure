# Space handlers & contract keys

Spaces own **execution** — what runs when a step opens, how agents are invoked, and how completion is signaled. After the handlers cutover, that lives in **`.mrmr/space/handlers.yaml`**, keyed by **`contract_keys`** (`{flow_ref}.{qualified_step_id}`).

Flow manifests carry **protocol only** — step shape, branches, presentation. No `executor.action` in portable flow definitions.

Normative bridge: [handlers.md](https://github.com/murrmure/agentStudio/blob/main/studio-specs/current/bridges/handlers.md) (`studio-specs/current/bridges/handlers.md`).

## Handler file

**Path:** `.mrmr/space/handlers.yaml`

```yaml
version: 1
handlers:
  - id: feature_write_spec
    contract_keys: [preview-review.write_spec]
    on: step.opened
    type: shell_spawn
    complete: explicit
    prompt: |
      Copy intake spec, then resolve via murrmure_resolve_step …
    command: cursor agent -p --force {{prompt}}
    cwd: "{{space_root}}"
```

| Field | Notes |
|-------|-------|
| `contract_keys` | Protocol addresses; empty for event-only handlers |
| `on` | `step.opened` \| `step.resolved` \| `event: { type, source? }` |
| `type` | `shell_spawn` \| `mcp_session` \| `queue_poll` \| `remote_hub` |
| `complete` | `auto` \| `cli` \| `explicit` — who calls resolve after shell dispatch |
| `kill_on` | Optional — cancel in-flight handler when step resolves (long-lived subgraph owners) |

**Full walkthrough:** [Tutorial 1b — handlers](./tutorials/01-local-preview-review/04-prompt-triggers.md) includes a complete `handlers.yaml` for the preview-review flow.

## Contract keys

```text
contract_key := {flow_ref}.{qualified_step_id}
```

- `flow_ref` = apply-time resolved flow identity (`flow_id` or `graph_digest`-qualified ref).
- `qualified_step_id` = dot path from `StepContractCatalog.step_ids` (e.g. `build.build-loop`).
- Matching: exact + explicit multi-key only (no wildcards in v1).

Human-step keys may appear in `contract_keys` for **scope/documentation** on subgraph-owner handlers — they are never dispatched on `step.opened`; the engine opens presentation instead.

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

Common lint codes: missing handler for dispatched step, `contract_key` mismatch, `HANDLER_COMPLETE_CLI_NO_RESOLVE`.

## Related

- [Space index](./space-index) — `.mrmr/` layout
- [Creating flows](./creating-flows) — manifest authoring
- [CLI — step resolve](./cli#mrmr-step-resolve)
- [MCP tools](../reference/mcp-tools) — `murrmure_list_handlers`, `murrmure_resolve_step`
- [Troubleshooting](./troubleshooting) — handler and contract_key errors
