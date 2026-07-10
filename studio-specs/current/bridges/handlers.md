# Bridge — Space handlers & contract keys

**Status:** Normative — **shipped** (HANDLER-CUTOVER 2026-07-09)  
**Plan:** [2026-07-09-space-handlers-contract-keys-plan.md](../../plans/2026-07-09-space-handlers-contract-keys-plan.md)

Spaces own execution via **handlers** keyed by **`contract_keys`** (`{flow_ref}.{qualified_step_id}`). Flow manifests carry protocol only — no `executor.action`. Handlers replace `actions.yaml`, `hooks.yaml`, and `executors.yaml` for default spaces.

---

## Handler file

**Path:** `.mrmr/space/handlers.yaml` (v1)

**Legacy:** `murrmure/actions.yaml`, `murrmure/hooks.yaml`, and `murrmure/executors.yaml` may still index for unmigrated spaces. `mrmr space apply --strict` warns when both handlers and legacy actions are present; new spaces should use handlers only. Flow steps must not declare `executor.action`.

```yaml
version: 1
handlers:
  - id: write-spec
    contract_keys:
      - preview-review.write_spec
    on: step.opened
    kill_on: step.resolved
    type: shell_spawn
    complete: explicit
    prompt: |
      … resolve via murrmure_resolve_step …
    command: cursor agent -p --force {{prompt}}
```

| Field | Notes |
|-------|-------|
| `contract_keys` | Protocol addresses; empty for event-only handlers |
| `on` | `step.opened` \| `step.resolved` \| `event: { type, source? }` |
| `type` | `shell_spawn` \| `mcp_session` \| `queue_poll` \| `remote_hub` |
| `complete` | `auto` \| `cli` \| `explicit` — who calls `resolve_step` after shell dispatch |

---

## Contract keys

```text
contract_key := {flow_ref}.{qualified_step_id}
```

- `flow_ref` = apply-time resolved flow identity (`flow_id` or `graph_digest`-qualified ref).
- `qualified_step_id` = dot path from `StepContractCatalog.step_ids`.
- Matching: exact + explicit multi-key only (no wildcards in v1).

---

## Decision record

Decisions below are **entry gates** for implementation slices VS-1+.

### Q1 — `link.host` persistence policy

**Status:** DECIDED

Commit `link.space_id` in `.mrmr/space/space.yaml`. Keep `link.host` machine-local / override-capable so multi-host binding is not blocked. Team shares space id; each developer may set their own host.

### Q2 — Handler / hook id namespace

**Status:** DECIDED

One `handlers.yaml` namespace. Journal prefix `handler:{id}` for all handlers (step lifecycle and event-driven). No separate hooks id namespace after cutover.

### Q3 — Human-step keys in `contract_keys`

**Status:** DECIDED

Allowed for **scope/documentation only** in multi-key subgraph-owner handlers. Human-step keys are **never** dispatched on `step.opened` — engine opens presentation instead. Lint validates scope-only human keys; runtime enforces no shell dispatch.

### Q4 — `murrmure_invoke_action` fate

**Status:** DECIDED

Retired from primary agent path (HANDLER-CUTOVER 2026-07-09). Step lifecycle uses `murrmure_resolve_step` + handler dispatch. `murrmure_invoke_action` remains for headless/operator invoke only — see [action-invoke.md](./action-invoke.md).

### Q5 — Worker missing bindings

**Status:** DECIDED

Warning by default (`WORKER_NO_BINDINGS`). Strict error in CI when `mrmr space doctor --strict` or apply `--strict` on worker archetype without local flows/views and without `bindings.yaml`.

### Q6 — Dispatch token scope / lifetime

**Status:** DECIDED

`MURRMURE_HUB_TOKEN` injected on `shell_spawn` dispatch is **short-lived and run-scoped** (resolve capability only). Minted per dispatch; never reuse long-lived grant tokens in shell env. `mrmr step resolve` targets `MURRMURE_HUB_URL` explicitly.

### Q7 — `complete: cli` branch validation

**Status:** DECIDED

Both **static lint** (`HANDLER_COMPLETE_CLI_NO_RESOLVE` when command lacks `mrmr step resolve`) and **runtime** schema/branch validation on resolve call. Hub does not auto-resolve when `complete: cli`.

---

## References

- [step-contract.md](./step-contract.md) — catalog + resolve
- [action-invoke.md](./action-invoke.md) — headless invoke (operator path)
- [triggers.md](./triggers.md) — event handlers in the same file
- [product/philosophy.md](../product/philosophy.md) § Arc 5 — space owns execution
