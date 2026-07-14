# Bridge — Space handlers & contract keys

**Status:** Normative — **shipped** (HANDLER-CUTOVER 2026-07-09; VIEW-RESOLVER cutover 2026-07-14)
**Plan:** [2026-07-09-space-handlers-contract-keys-plan.md](../../plans/2026-07-09-space-handlers-contract-keys-plan.md), [Tutorial v3 Task 04](../../plans/2026-07-14-tutorial-v3-build-tasks/04-intake-view.md)
**ADR:** [ADR-009 — Space-owned view resolvers and hardened host](../../ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md), [ADR-011 — space-owned flow admission and apply quiescence](../../ADR/ADR-011-space-owned-flow-admission-and-apply-quiescence.md), [ADR-012 — safe shell handler interpolation, execution, and assignment credentials](../../ADR/ADR-012-safe-shell-handler-interpolation-and-credentials.md)

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
run_policies:
  - flow: my-dev-flow
    max_concurrent_runs: 1
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

---

## Run policies

`run_policies` is a space-owned list of `{ flow, max_concurrent_runs }` entries
that caps how many **non-terminal** runs of a single flow may exist at once. The
flow stays portable — the policy lives in the space, never in the flow manifest.

- `flow` is an authored readable alias (the applied flow's `name`), resolved at
  apply to canonical `{ origin_space_id, flow_id, flow_digest }` against the fully
  merged post-apply flow set (local + bound + preserved).
- `max_concurrent_runs` is an integer ≥ 1. **No policy means unlimited** — an
  unbounded flow may run concurrently with itself and with any limited flow.
- Every manual, trigger, API, MCP, and federated start funnels through one atomic
  admission check. Overflow creates **no queue and no partial run**; the start
  fails immediately with `409 FLOW_CONCURRENCY_LIMIT` carrying the canonical flow
  identity, the configured limit, and the active blocking run IDs.
- Trigger delivery records the same typed denial (`mrmr.flow.start_denied`) so it
  is observable; a later retry always performs a fresh admission check.
- Runs and journals pin the configuration they actually used (the applied
  `flow_digest` admitted at start).

Apply-time resolution fails apply atomically (prior index preserved) with typed
codes — see the table below. See
[ADR-011 — space-owned flow admission and apply quiescence](../../ADR/ADR-011-space-owned-flow-admission-and-apply-quiescence.md).

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

`validateHandlerBindings` and run-policy resolution run on the fully resolved
post-apply state and fail apply atomically (the prior index is preserved) with
typed codes:

| Code | Condition |
|------|-----------|
| `DUPLICATE_FLOW_NAME` | Two applied flows share a `name` (ambiguous `on::key` aliases) |
| `HANDLER_ORPHAN_ALIAS` | An `on::key` alias references an unknown flow/step |
| `HANDLER_RESOLVER_CONFLICT` | More than one `step.opened` resolver for a step |
| `VIEW_RESOLVER_NOT_OPENED` | A `view_resolver` is not bound to `step.opened::…` |
| `VIEW_RESOLVER_VIEW_NOT_FOUND` | `view_id` is unknown to the space index |
| `VIEW_RESOLVER_BUILD_MISSING` | The bound View's build (`dist/`) is missing |
| `RUN_POLICY_UNKNOWN_FLOW` | A `run_policies` alias references no applied flow (unknown or stale) |
| `RUN_POLICY_AMBIGUOUS_FLOW` | A `run_policies` alias matches duplicate flow names |
| `RUN_POLICY_DUPLICATE` | Two `run_policies` entries target the same canonical flow |

---

## Apply quiescence

An apply may replace a space's configuration only when the **entire space has no
non-terminal runs** (lifecycle `working` or `input-required`). This prevents a run
from observing a partially replaced index or executing against configuration that
was changed underneath it.

- Apply and run start share one **per-space guard** so the admission count+insert
  (start) and the quiescence check+commit (apply) are each atomic. No force apply,
  auto-abort, hot swap, migration, or per-run handler snapshot is added.
- A conflicting apply returns `409 SPACE_HAS_ACTIVE_RUNS` with the blocking run
  IDs; the prior index is preserved. Apply succeeds immediately once all runs
  become terminal (`completed`, `failed`, or `cancelled`).
- Capacity denial and apply quiescence are distinct: `FLOW_CONCURRENCY_LIMIT` is
  per-flow at start; `SPACE_HAS_ACTIVE_RUNS` is whole-space at apply.

See [ADR-011 — space-owned flow admission and apply quiescence](../../ADR/ADR-011-space-owned-flow-admission-and-apply-quiescence.md).

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

## Shell handler execution model

A `shell_spawn` handler runs a `command` string under a strict, safe execution
model so authored dynamic values can never become shell fragments and the
runtime owns process lifecycle. See
[ADR-012 — safe shell handler interpolation, execution, and assignment credentials](../../ADR/ADR-012-safe-shell-handler-interpolation-and-credentials.md).

### Command grammar and quoting

- Every dynamic placeholder occupies **one complete unquoted argument** and the
  runtime shell-quotes it **exactly once**. Spaces, apostrophes, quotes, `$()`,
  backticks, newlines, leading dashes, and Unicode in a resolved value stay
  literal data.
- Author-quoted placeholders (`'{{x}}'`, `"{{x}}"`), embedded forms
  (`--flag={{x}}`, `pre{{x}}post`, `{{a}}{{b}}`), and unknown placeholders are
  rejected before spawn.
- A missing or null binding fails before process creation with
  `HANDLER_BINDING_VALUE_MISSING`; a schema-valid empty string remains one empty
  argument. Placeholder and token character sets include hyphens so a key like
  `{{my-step.artifact.path}}` is recognized (and rejected as unknown when
  unbound) rather than silently passing through as a literal. Authored
  single-quoted literals re-emit verbatim.
- `{{prompt}}` is stripped (delivered via stdin) when the handler uses prompt
  delivery, otherwise substituted as one quoted argument. `{{space_root}}` is
  resolved in the `cwd` field as a path, not shell-quoted.

### Artifact consumer copy

- A singleton artifact `.path` token (for example
  `{{murrmure.step.intake.artifact.spec.path}}`) resolves only for local
  execution to an **absolute, digest-verified, run-scoped consumer copy** at
  `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`.
- The original artifact is never mutated; the source must be a regular file
  inside the run scratch tree. A literal containment check rejects obvious
  escapes, `lstat` rejects a symlinked source, and `realpath` canonicalizes both
  sides before confirming the real path stays in-tree — so an in-tree symlinked
  parent that resolves outside is rejected as `ARTIFACT_PATH_TRAVERSAL`. The
  source is read once. The copy is written to a temp sibling and atomically
  renamed into place (POSIX `rename` atomically replaces any existing
  destination), so a partial file is never observable and a prior copy is never
  left missing. A digest mismatch refuses the copy before any consumer bytes are
  written.
- Public APIs, Views, journals, and remote handlers receive **references,
  never local paths**. The dispatch audit resolves an artifact `.path`
  placeholder to an opaque reference (transfer id when available, else
  `artifact:{producer}:{slot}`) — never the producer's local path or the
  consumer copy path.

### POSIX execution and defaults

- Multiline commands run as `/bin/sh -e -c "<script>"` on supported POSIX
  systems without login profiles or a silent shell fallback. Omitted `cwd`
  defaults to the space root; omitted `delivery` defaults to fail-fast.

### Process lifecycle and credentials

- Timeout, cancellation, external resolution, yield, run terminal, or Desktop
  shutdown sends process-group `SIGTERM`, waits five seconds, then `SIGKILL`,
  and records exactly one terminal result. The `SIGKILL` escalation stays armed
  when the shell leader exits after `SIGTERM`, so a TERM-resistant descendant is
  still reaped after the grace period. Hub/Desktop shutdown cancels every
  registered shell executor. Authored `kill_on` is removed.
- Each spawned handler receives an **ephemeral run/step-scoped credential**
  (`MURRMURE_HUB_TOKEN`) in its environment, never the persistent machine
  connection. The token carries an `expires_at` backstop and a `scope_ref`
  (`{run_id}:{step_id}`); `requireToken` denies an expired or revoked token and
  the resolve route denies a `scope_ref` mismatch
  (`TOKEN_STEP_SCOPE_MISMATCH`). The credential is revoked on every terminal
  path — step resolve/auto-complete, run terminal, and Desktop shutdown — so no
  persistent child credential survives a finished assignment. The dispatch audit
  records only command/prompt/cwd — never the environment — so credentials never
  reach the journal or public surfaces.

### `complete:auto` outcomes

| Exit / stdout | Outcome |
|---------------|---------|
| Exit 0, parseable stdout | `completed` |
| Nonzero exit | `failed` — `SHELL_EXIT_NONZERO` |
| Unparseable stdout (when `response_schema` set) | `failed` — `RESPONSE_NOT_JSON` |
| Spawn failure | `failed` — `SHELL_SPAWN_FAILED` |
| Timeout / termination | `failed` — `ACTION_TIMED_OUT` |
| Missing/null/quoted/embedded/unknown binding | `failed` — `HANDLER_BINDING_VALUE_MISSING` / `HANDLER_PLACEHOLDER_QUOTED` / `HANDLER_PLACEHOLDER_EMBEDDED` / `HANDLER_UNKNOWN_PLACEHOLDER` (before spawn) |
| Materialization failure | `failed` — `ARTIFACT_PATH_TRAVERSAL` / `ARTIFACT_SOURCE_NOT_FOUND` / `ARTIFACT_SOURCE_NOT_FILE` / `ARTIFACT_DIGEST_MISMATCH` / `ARTIFACT_COPY_FAILED` (before spawn) |

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

`MURRMURE_HUB_TOKEN` injected on `shell_spawn` dispatch is **short-lived and run/step-scoped** (resolve capability only). Minted per dispatch with an `expires_at` backstop and a `scope_ref` (`{run_id}:{step_id}`); revoked on step resolve/auto-complete, run terminal, and Desktop shutdown. Never reuse long-lived grant tokens in shell env. `mrmr step resolve` targets `MURRMURE_HUB_URL` explicitly and is denied on `scope_ref` mismatch (`TOKEN_STEP_SCOPE_MISMATCH`) or expiry/revocation. Views receive no hub credential.

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
- [ADR-011 — Space-owned flow admission and apply quiescence](../../ADR/ADR-011-space-owned-flow-admission-and-apply-quiescence.md)
- [ADR-012 — Safe shell handler interpolation, execution, and assignment credentials](../../ADR/ADR-012-safe-shell-handler-interpolation-and-credentials.md)
- [product/philosophy.md](../product/philosophy.md) § Arc 5 — space owns execution
