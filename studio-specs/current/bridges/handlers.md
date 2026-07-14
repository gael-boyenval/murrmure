# Bridge — Space handlers & contract keys

**Status:** Normative — **shipped** (HANDLER-CUTOVER 2026-07-09; VIEW-RESOLVER cutover 2026-07-14)
**Plan:** [2026-07-09-space-handlers-contract-keys-plan.md](../../plans/2026-07-09-space-handlers-contract-keys-plan.md), [Tutorial v3 Task 04](../../plans/2026-07-14-tutorial-v3-build-tasks/04-intake-view.md)
**ADR:** [ADR-009 — Space-owned view resolvers and hardened host](../../ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md)

Spaces own execution via **handlers**. A step handler binds to a resolver-agnostic
step with `on: step.opened::{flow_name}.{qualified_step_id}` (the **`on::key`
binding**). Flow manifests carry protocol only — no `executor.action`, no
`role`, no `presentation`, no View identity. Handlers replace `actions.yaml`,
`hooks.yaml`, and `executors.yaml` for default spaces. A space binds a custom
View to a step with a **`view_resolver`** handler; the View identity lives in
the space, never in the flow.

---

## Handler file

**Path:** `.mrmr/space/handlers.yaml` (v1)

**Legacy:** `murrmure/actions.yaml`, `murrmure/hooks.yaml`, and
`murrmure/executors.yaml` may still index for unmigrated spaces. `mrmr space
apply --strict` warns when both handlers and legacy actions are present; new
spaces should use handlers only. Flow steps must not declare `executor.action`.

```yaml
version: 1
handlers:
  # Executor handler — binds the write_spec step, prompts an agent.
  - id: write-spec
    contract_keys: [preview-review.write_spec]   # prompt-scope only
    on: step.opened::preview-review.write_spec
    type: shell_spawn
    complete: explicit
    prompt: |
      … resolve via murrmure_resolve_step …
    command: cursor agent -p --force {{prompt}}

  # View resolver — binds the intake step to a locally built View.
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
| `complete` | `auto` \| `cli` \| `explicit` — who calls `resolve_step` after shell dispatch. Not applicable to `view_resolver` (always explicit, host-mediated). |
| `view` | Required for `view_resolver`: the `view_id` of a locally built View in `.mrmr/views/`. |
| `kill_on` | **Removed.** Assignment termination is runtime-owned; authored `kill_on` is rejected. |

**`view_resolver` is executor-free.** A `view_resolver` handler carries `view`
and binds `step.opened::…` only. It forbids `command`, `prompt`, `params`,
`cwd`, and other executor fields. The shell loads the View from the space index
and the open-step projection; it performs no client-side handler matching.

---

## `on::key` binding

```text
on := step.(opened|resolved)::{flow_name}.{qualified_step_id}
```

- `{flow_name}` is the applied flow's `name`.
- `{qualified_step_id}` is the dot path from `StepContractCatalog.step_ids`
  (e.g. `build.build-loop`).
- Matching is exact and explicit; there is no wildcard and no lifecycle-only
  `on: step.opened` dispatch. A step may have **at most one** `step.opened`
  resolver; `step.resolved::…` handlers are reactions and may be multiple.

`contract_keys` (`{flow_ref}.{qualified_step_id}`) is now **prompt-scope only**:
it documents which steps a prompt-scoped executor handler may address. It is no
longer the binding key. Human-step keys may appear for scope/documentation on
multi-key subgraph-owner handlers; they are never dispatched on `step.opened`.

---

## Apply-time binding validation

`validateHandlerBindings` runs on the fully resolved post-apply state and fails
apply atomically (the prior index is preserved) with typed codes:

| Code | Condition |
|------|-----------|
| `DUPLICATE_FLOW_NAME` | Two applied flows share a `name` (ambiguous `on::key` aliases) |
| `HANDLER_ORPHAN_ALIAS` | An `on::key` alias references an unknown flow/step |
| `HANDLER_RESOLVER_CONFLICT` | More than one `step.opened` resolver for a step |
| `VIEW_RESOLVER_NOT_OPENED` | A `view_resolver` is not bound to `step.opened::…` |
| `VIEW_RESOLVER_VIEW_NOT_FOUND` | `view_id` is unknown to the space index |
| `VIEW_RESOLVER_BUILD_MISSING` | The bound View's build (`dist/`) is missing |

---

## Open-step projection

Run detail exposes `open_steps[]`. Each entry carries:

- `resolver`: sanitized descriptor `{ handler_id, type, view_id? }` — **no**
  command, prompt, path, parameter, environment, or secret. `resolver: null`
  means no space handler is bound; an authorized protocol client must resolve
  the step externally.
- `view`: present only when a `view_resolver` is bound —
  `{ view_id, origin_space_id, entry?, shell_route? }`. The shell loads the
  locally built View from this without client-side matching.
- `branches[]`: `{ branch, schema_ref?, schema?, artifact_slots? }`.

The shell renders state from `open_steps[]` but must not synthesize forms or
fallback controls for unbound steps, and must not become a second workflow
engine. See [ADR-009](../../ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md)
for the hardened host boundary.

---

## Decision record

Decisions below are **entry gates** for implementation slices VS-1+.

### Q1 — `link.host` persistence policy

**Status:** DECIDED

Commit `link.space_id` in `.mrmr/space/space.yaml`. Keep `link.host` machine-local / override-capable so multi-host binding is not blocked. Team shares space id; each developer may set their own host.

### Q2 — Handler / hook id namespace

**Status:** DECIDED

One `handlers.yaml` namespace. Journal prefix `handler:{id}` for all handlers (step lifecycle and event-driven). No separate hooks id namespace after cutover.

### Q3 — Human-step keys and View binding

**Status:** DECIDED (revised 2026-07-14)

Human-step keys may appear in `contract_keys` for **scope/documentation only**
on multi-key subgraph-owner handlers; they are never dispatched on `step.opened`.
A human step is presented by a space-bound **`view_resolver`** (the space owns
the View), or left unbound and observability-only. The engine opens no
presentation itself and the shell synthesizes no form.

### Q4 — `murrmure_invoke_action` fate

**Status:** DECIDED

Retired from primary agent path (HANDLER-CUTOVER 2026-07-09). Step lifecycle uses `murrmure_resolve_step` + handler dispatch. `murrmure_invoke_action` remains for headless/operator invoke only — see [action-invoke.md](./action-invoke.md).

### Q5 — Worker missing bindings

**Status:** DECIDED

Warning by default (`WORKER_NO_BINDINGS`). Strict error in CI when `mrmr space doctor --strict` or apply `--strict` on worker archetype without local flows/views and without `bindings.yaml`.

### Q6 — Dispatch token scope / lifetime

**Status:** DECIDED

`MURRMURE_HUB_TOKEN` injected on `shell_spawn` dispatch is **short-lived and run-scoped** (resolve capability only). Minted per dispatch; never reuse long-lived grant tokens in shell env. `mrmr step resolve` targets `MURRMURE_HUB_URL` explicitly. Views receive no hub credential.

### Q7 — `complete: cli` branch validation

**Status:** DECIDED

Both **static lint** (`HANDLER_COMPLETE_CLI_NO_RESOLVE` when command lacks `mrmr step resolve`) and **runtime** schema/branch validation on resolve call. Hub does not auto-resolve when `complete: cli`. `view_resolver` is always explicit and host-mediated.

### Q8 — View binding ownership and host boundary

**Status:** DECIDED (2026-07-14)

View identity lives in the space (`view_resolver` handler), never in the flow.
Views run in a sandboxed iframe (`allow-scripts` only) under a restrictive CSP
with host-mediated, nonce/version-bound postMessage and no hub credential. The
shell performs no client-side handler matching and synthesizes no fallback form.
See [ADR-009](../../ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md).

---

## References

- [step-contract.md](./step-contract.md) — catalog + resolve
- [action-invoke.md](./action-invoke.md) — headless invoke (operator path)
- [triggers.md](./triggers.md) — event handlers in the same file
- [ADR-009 — Space-owned view resolvers and hardened host](../../ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md)
- [product/philosophy.md](../product/philosophy.md) § Arc 5 — space owns execution
