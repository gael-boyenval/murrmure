# Plan — Simplify handler authoring API (research)

**Date:** 2026-07-10  
**Status:** Planned — **Phase 0 (research) not started**  
**Goal:** Make `.mrmr/space/handlers.yaml` the single place where a space binds resolver implementations—View, agent, shell, or script—to modality-agnostic flow steps and sets per-flow run capacity, while reducing repeated `contract_keys`, `cwd`, and `delivery` boilerplate.

**Tutorial driver:** [Tutorial 1 v3 Part 5](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md) documents the **target** authoring shape below.

**Related:** [handlers.md](../current/bridges/handlers.md) (shipped v1), [2026-07-10-step-default-branches.md](./2026-07-10-step-default-branches.md) (flow step defaults — orthogonal).

---

## Problem statement

### Current handler shape (shipped v1)

```yaml
handlers:
  - id: write_spec_copy
    contract_keys: [my-dev-flow.write_spec]
    on: step.opened
    type: shell_spawn
    complete: auto
    command: mkdir -p specs/current && cp "…" specs/current/spec.md
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 10000
```

### Pain points

| ID | Symptom | Why it hurts |
|----|---------|--------------|
| **H-1** | `contract_keys` + `on` are two fields for one binding | Every step handler repeats the same lifecycle (`step.opened`) and a single key |
| **H-2** | `cwd: "{{space_root}}"` on every handler | Runtime already falls back to `space_root` when `cwd` is omitted (`packages/executors/src/shell-spawn.ts` `resolveCwd`) — authors shouldn't need to know |
| **H-3** | `delivery: fail_fast` on every handler | Local dev spaces expect immediate failure when no executor; queuing is the exceptional case |
| **H-4** | `contract_keys` overload | Used for dispatch index **and** prompt scope on subgraph-owner handlers — conflates “when to run” with “what context to inject” |
| **H-5** | Single-line `command` | Long shell pipelines are hard to read in tutorials and diffs |

---

## Research — current implementation

### Dispatch matching (`packages/hub-core/src/index/parse-handlers.ts`)

- `buildHandlerIndex` indexes handlers by **`contract_keys`** × **`on`** (`step.opened` \| `step.resolved`).
- `matchStepOpenedHandlers(index, contract_key)` looks up `step_opened_by_key[contract_key]`.
- Lifecycle and address are **orthogonal** today — both required for step handlers.

### Lint (`packages/hub-core/src/index/handler-catalog-lint.ts`)

- `HANDLER_MISSING` when an **agent** catalog key has no `on: step.opened` handler in `contract_keys`.
- `HANDLER_ORPHAN_KEY` when a `contract_keys` entry is unknown.
- Human-step keys allowed in `contract_keys` for **scope only** (Q3) — never dispatched on open.

### Runtime defaults (partially exist)

| Field | Schema default | Runtime default | Gap |
|-------|----------------|-----------------|-----|
| `complete` | `explicit` | — | OK for agent steps; shell `auto` still explicit in YAML |
| `cwd` | optional | `space_root` if unset (`resolveCwd`) | **Docs require it; runtime does not** |
| `delivery` | optional | Must trace invoke path — action schema optional | **Likely unset = queue or fail depending on path; should standardize on `fail_fast`** |
| `contract_keys` | `[]` | required for step.opened lint | **Cannot omit today** |

### Prompt scope (`packages/hub-core/src/flow-engine/step-contract-slice.ts`)

- Multi-key `contract_keys` on one handler builds a `## Scope` block in `resolveInvokePrompt` for subgraph owners.
- This is the **legitimate** use of `contract_keys` beyond single-step dispatch — prompt API / agent context, not routing.

---

## Target behavior (proposed)

### 0. Resolver-agnostic flows and `view_resolver`

Flows contain no `role`, `presentation`, or View identity. A space binds a custom View like every other resolver:

```yaml
- id: spec-intake-form
  on: step.opened::my-dev-flow.intake
  type: view_resolver
  view: spec-intake-form
```

`view_resolver` semantics:

- no `command`, `cwd`, `delivery`, `timeout_ms`, or `complete`;
- available for the entire open-step lifetime and renderable by multiple authorized clients;
- user submission resolves with the viewing user's authorization;
- no connected viewer leaves the step open and is not a delivery failure;
- every apply verifies the View package/build exists; missing View or built entry is a hard error;
- at most one configured resolver handler of any type per `step.opened::{contract_key}`;
- the same View may render in multiple authorized clients, but it remains one handler binding;
- multiple `step.resolved::{contract_key}` reaction handlers are allowed; they observe/perform side effects after resolution and cannot resolve the step again;
- each `open_steps[]` item carries the sanitized applied binding inline as `resolver: null | { handler_id, type, view_id? }`; `view_id` exists only for `view_resolver`;
- the server derives that descriptor from the canonical handler match and filters it by caller authorization; commands, prompts, paths, parameters, environment, and secrets are never exposed;
- no built-in contract/gate form or fallback shell resolver exists.

**Nested resume semantics:**

- the exclusive `step.opened::{parent_key}` binding owns the parent resolver for its complete open lifetime and receives normal invocations for both initial open and later resume events;
- a resume invocation includes the child identity, selected branch, iteration, validated payload, and artifact references, and never emits another parent `step.opened`;
- the parent remains open and must resolve its own branch/contract independently;
- through its ephemeral assignment credential, the parent resolver may invoke `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })` for one declared child; arbitrary input is not accepted and a second active child is rejected atomically;
- successful child open atomically yields the current parent assignment and revokes its mutation credential; the process may exit normally, but stale protocol writes fail;
- child return creates one fresh parent invocation with reason `resumed`; it never overlaps a still-authorized prior assignment;
- authored `kill_on` is removed; local/external assignment resolution, yield, cancellation, timeout, and shutdown automatically terminate an active resolver invocation through the shared process-group termination policy;
- activating a child does not resolve the parent, and a child branch with no explicit control returns to its immediate parent by default;
- shell/script resume is a new normal handler invocation, not OS-process restoration; agent adapters may reuse a prior agent session, but handler correctness cannot depend on that;
- `view_resolver` clients receive refreshed context for the same open parent rather than a new View instance requirement;
- remove automatic parent completion plus `complete_parent`, `continue_parent`, and `goto` dispatch.

Zero configured resolver handlers is also valid. Remove `HANDLER_MISSING`; the step remains `open` for any authorized external protocol client. `open_steps[]`, space status, and shell observability expose `resolver: null` as **No resolver bound**, explain that an authorized client must resolve it, show safe contract metadata, and link handler configuration docs without a form or resolve control.

**Applied-index stability:**

- `mrmr space apply` returns `409 SPACE_HAS_ACTIVE_RUNS` with blocking run IDs when any run in the space is non-terminal;
- apply and run start share a per-space concurrency guard;
- the guard coordinates configuration replacement only: subject to `run_policies`, multiple runs may start and execute concurrently against the same immutable applied index;
- no force apply, automatic abort, hot swap, or handler snapshot path;
- apply constructs and validates a candidate View index before parsing handlers, then resolves `view_resolver.view` against it;
- missing View id/build fails before commit and leaves the previous applied index untouched;
- after every run is terminal, apply atomically replaces the active space index;
- dispatch/journal metadata records selected handler ID, applied config digest, flow digest, and qualified step id.

### 0.5. Space-owned per-flow run capacity

Concurrency is execution policy, not portable flow shape:

```yaml
version: 1

run_policies:
  - flow: my-dev-flow
    max_concurrent_runs: 1

handlers:
  # ...
```

- `run_policies[].flow` is a readable flow-name alias resolved during apply to the candidate flow digest;
- `max_concurrent_runs` is an integer ≥ 1; `1` serializes that flow in this space;
- no policy means unlimited concurrent runs;
- duplicate, unknown, ambiguous, or stale flow aliases fail apply;
- every start path uses one atomic admission check against non-terminal runs of the canonical flow identity;
- an over-capacity start is not queued: return `409 FLOW_CONCURRENCY_LIMIT` with canonical flow identity, configured limit, and active blocking run IDs;
- internal trigger delivery records the same typed denial; retry performs a fresh admission check after a blocker becomes terminal;
- apply quiescence remains separate: many runs may share one applied index, but no apply may replace it until all runs are terminal.

### 1. Combined `on` binding — `lifecycle::contract_key`

**Convention:**

```text
on := step.opened::{flow_name}.{qualified_step_id}
    | step.resolved::{flow_name}.{qualified_step_id}
    | event:{type}              # unchanged — event handlers
    | event:{type}@{source}     # optional shorthand research
```

**Examples:**

```yaml
- id: write_spec_copy
  on: step.opened::my-dev-flow.write_spec
  type: shell_spawn
  complete: auto
  command: |
    mkdir -p specs/current
    cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md

- id: dev_build
  on: step.opened::my-dev-flow.build
  type: shell_spawn
  complete: explicit
  prompt: |
    Read specs/current/spec.md and implement what it asks for in this repo.
    When finished, call murrmure_resolve_step for step build with branch completed.
  command: cursor agent -p --force {{prompt}}
```

**Parsing rules:**

1. If `on` matches `/^step\.(opened|resolved)::(.+)$/`, extract lifecycle + readable `{flow_name}.{qualified_step_id}` alias.
2. Apply resolves that alias against the candidate flow catalog to immutable `{origin_space_id, flow_id, flow_digest, qualified_step_id}` and indexes only the canonical identity.
3. Duplicate flow names, unknown/ambiguous step aliases, and stale aliases fail apply.
4. A flow rename requires updating all affected handler aliases in the same atomic apply.
5. Lifecycle-only `on: step.opened` plus dispatch-through-`contract_keys` is removed and rejected by normal strict-schema validation; no legacy-specific diagnostic is retained.
6. Non-empty `contract_keys` uses readable aliases for prompt scope only and resolves through the same candidate catalog.

### 2. Defaults — omit `cwd` and `delivery`

| Field | Default when omitted | Override when needed |
|-------|----------------------|----------------------|
| `cwd` | `{{space_root}}` (resolved at dispatch) | `cwd: ./subfolder` or absolute path |
| `delivery` | `fail_fast` | `delivery: queue_until_executor` for long-wait agent sessions |

**Normative:** Document in `handlers.md`; set Zod defaults + executor dispatch path to match runtime.

### 3. `contract_keys` — prompt API only

| Use | Shipped v1 | Target |
|-----|------------|--------|
| Step dispatch binding | `contract_keys` + `on: step.opened` | **`on: step.opened::{key}`** |
| Event handlers | `contract_keys: []` + `on: event:` | unchanged |
| Prompt scope (subgraph owner) | multiple keys in `contract_keys` | **`contract_keys` optional list** — only on handlers with `prompt:` (or `params`); lint ensures keys are catalog-known; **not used for dispatch index** when `on::key` present |
| Human-step scope keys | allowed, not dispatched | unchanged — scope documentation only |

**Single-step agent handlers (Tutorial 1 v3 `dev_build`):** one `contract_keys` entry — prompt API only; dispatch via **`on::key`**.

**Subgraph-owner handler (Tutorial 1b preview-review):**

```yaml
- id: feature_build_owner
  on: step.opened::preview-review.build
  contract_keys:
    - preview-review.build
    - preview-review.build.build-loop
    - preview-review.build.review
  type: shell_spawn
  complete: explicit
  prompt: |
    …
```

### 4. Multiline `command`

- YAML `command: |` is executed as `/bin/sh -e -c` on supported POSIX hosts.
- Do not load login profiles or silently fall back to Bash, PowerShell, or another platform shell; unsupported hosts/syntax fail visibly.
- Lint: no change for `complete: cli` / `mrmr step resolve` detection (scan full block).
- Local singleton artifact `.path` tokens resolve at dispatch to an absolute, digest-verified consumer copy. Multi-file slots expose an absolute `.directory`; apply rejects `.path` when `max_files > 1`. Remote handlers receive ordered artifact-reference arrays instead of host paths.
- Every dynamic placeholder occupies one complete unquoted argument; runtime quoting occurs exactly once. Reject author-added quotes, embedded forms such as `--flag={{value}}`, and all raw interpolation syntax.
- A spawned harness receives an ephemeral credential bound to its space/run/step/handler assignment and never a persistent machine/trust-boundary connection. Revoke and redact it on every handler or step terminal path.

### 5. Simplified agent prompt protocol

Tracked separately: **[2026-07-10-agent-prompt-protocol-simplify.md](./2026-07-10-agent-prompt-protocol-simplify.md)** (APP-1–APP-5). This plan covers handler dispatch and defaults only; prompt envelope slimming is not started here.

---

## Clean-slate cutover

| Phase | Behavior |
|-------|----------|
| **C1** | Remove lifecycle-only step handler dispatch and all dual-index code |
| **C2** | Add `on::key` plus `view_resolver`; reject removed shapes immediately |
| **C3** | Delete built-in resolver form/fallback code and role/presentation-derived matching |
| **C4** | Remove `kill_on` schema/runtime authoring and make resolver-assignment termination automatic |
| **C5** | Update `handlers.md`, `space-handlers.md`, examples, tutorial, and `skill-developer` |

---

## Code changes (indicative)

| File | Change |
|------|--------|
| `packages/contracts/src/entities/handler.ts` | Extend `HandlerOnSchema` with `step.opened::{key}` string pattern; define resolver invocation reason (`opened` / `resumed`); remove `kill_on`; add Zod defaults for `delivery` |
| `packages/hub-core/src/index/parse-handlers.ts` | Parse readable `on::key` and `run_policies`; resolve/index by origin space + flow id + flow digest + qualified step id; enforce one opened resolver and allow many resolved reactions |
| `packages/hub-core/src/index/handler-catalog-lint.ts` | Delete `HANDLER_MISSING`; reject duplicate flow names and orphan/duplicate/ambiguous aliases; `contract_keys` is scope-only |
| Handler/View contracts and shell resolver lookup | Add `view_resolver`, View existence/uniqueness lint, and inline sanitized `open_steps[].resolver`; remove flow presentation/role lookup and client-side handler-index joins |
| Space apply/run coordination | Reject apply during non-terminal runs; serialize apply and run start; expose `SPACE_HAS_ACTIVE_RUNS` with run IDs |
| Run admission | Atomically enforce canonical per-flow `max_concurrent_runs` on manual, trigger, API, MCP, and federated starts; reject overflow without queuing |
| Apply assembly order | Load candidate Views → flows/contracts → handlers; validate all cross-references; atomically commit the complete candidate index |
| `packages/executors/src/shell-spawn.ts` | Default `delivery: fail_fast` in dispatch context |
| `packages/hub-core/test/unit/index/handlers-parse.test.ts` | `on::key`/`view_resolver` parse + removed-shape rejection |
| `packages/hub-core/test/unit/flow-engine/handler-dispatch.test.ts` | Dispatch via `on::key` |
| Nested resolver dispatch and executor adapters | Reinvoke the same exclusive parent resolver binding on resume; expose child result context; never synthesize parent open or restore an OS process |
| `apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md` | Target handler shape (done in doc slice) |
| `studio-specs/current/bridges/handlers.md` | Normative when shipped |

---

## Acceptance criteria

| ID | Criterion |
|----|-----------|
| **HA-1** | Handler with `on: step.opened::flow.step` dispatches on that step open |
| **HA-2** | Omitted `cwd` runs with `space_root` as working directory |
| **HA-3** | Omitted `delivery` fails run immediately when executor unavailable (`fail_fast`) |
| **HA-4** | Removed lifecycle-only dispatch shape fails normal strict-schema validation and has no index path or custom compatibility diagnostic |
| **HA-5** | `contract_keys` on prompt handler adds scope blocks; ignored for dispatch when `on::key` set |
| **HA-6** | Multiline `command: \|` executes through `/bin/sh -e -c`; first failure stops the block and no login profile is loaded |
| **HA-7** | Tutorial 1 v3 Part 5 handlers pass strict apply after ship |
| **HA-8** | `view_resolver` binds the intake View without flow `role`/`presentation`; no built-in resolver UI is reachable |
| **HA-9** | A second configured `step.opened` resolver for the same contract key fails apply; external authorized clients remain free to resolve through the protocol |
| **HA-10** | Non-terminal runs block apply; terminal runs permit retry; apply/run-start races cannot observe a partial index; admitted runs may concurrently use the same applied index |
| **HA-11** | Zero resolver handlers strict-applies; `open_steps[].resolver` is `null`, status says `no resolver bound`, and an authorized external client can resolve |
| **HA-12** | View index loads before handlers; missing View id/build fails every apply and preserves the previous applied index |
| **HA-13** | `{flow_name}.{qualified_step_id}` resolves during apply; runtime/journal use `{origin_space_id, flow_id, flow_digest, qualified_step_id}`; rename succeeds only with same-apply handler edits |
| **HA-14** | Multiple `step.resolved` reactions may bind one canonical step and all receive the event; none can resolve the step again |
| **HA-15** | Every open step carries `resolver: null` or an authorized sanitized inline descriptor; sensitive handler configuration is absent and View selection requires no client-side index join |
| **HA-16** | `run_policies[].flow` resolves to canonical flow identity; `1` serializes, values ≥ 2 cap atomically, and no policy is unlimited across every start path |
| **HA-17** | Over-capacity starts create no queue and return `FLOW_CONCURRENCY_LIMIT` with active run IDs; trigger denial is observable and retry succeeds after capacity is released |
| **HA-18** | A nested child return invokes the same exclusive parent resolver binding with reason `resumed`, leaves the parent open, and emits no duplicate parent `step.opened` |
| **HA-19** | Parent assignment may call idempotent `murrmure_open_child_step` for exactly one declared child at a time; credentials cannot open unrelated steps, arbitrary input is rejected, and competing activation is rejected atomically |
| **HA-20** | Shell/script resume uses a fresh invocation; optional agent-session reuse is adapter behavior and produces identical protocol/journal results |
| **HA-21** | Child open atomically yields the parent assignment and revokes its mutation credential; stale writes fail and child return creates exactly one fresh resumed assignment |
| **HA-22** | `kill_on` is rejected by strict schema; assignment resolve/yield/cancel/timeout/shutdown automatically terminates the active process group and records one terminal handler result |

---

## Non-goals (this slice)

- Wildcard `on: step.opened::my-dev-flow.*`
- Changing readable alias or canonical `{origin_space_id, flow_id, flow_digest, qualified_step_id}` identity after this decision
- Replacing `murrmure_list_handlers` output shape (may add resolved `on::key` field)
- Event handler syntax beyond current `on: event:` object
- A built-in generic contract/gate form; a standard resolver View may be added later as a normal plugin
- Force apply, automatic run abortion, live handler swapping, or per-run handler snapshots
- A global concurrency limit embedded in the portable flow manifest

---

## Doc sync (same PR as code)

- [Tutorial 1 v3 Parts 2, 3, and 5](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/)
- [Space handlers](../../../apps/docs/guide/space-handlers.md)
- `skill-developer/reference/handler-authoring.md` (if present)
- `studio-specs/current/bridges/handlers.md`
