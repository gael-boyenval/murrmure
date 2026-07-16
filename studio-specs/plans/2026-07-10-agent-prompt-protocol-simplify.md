# Plan — Simplify agent prompt protocol

**Date:** 2026-07-10  
**Status:** Planned — **not started**  
**Goal:** Agent handler prompts separate **workflow** (Task) from **protocol** (contracts). Under each branch in the protocol, emit the full **`murrmure_resolve_step`** MCP call with `run_id`, `step_id`, `branch`, payload, and artifact inputs filled from the active run contract. For resumed nested parents, include the child result and the scoped declared-child activation operation. Drop the **Session** block and separate **MCP tools** / **Resolve API** sections. Show **Discovery** only when `contract_keys.length > 1`.

**Tutorial driver:** [Tutorial 1 v3 Part 5](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md) — `dev_build` extract is the acceptance fixture.

**Related:** [2026-07-10-handler-authoring-simplify.md](./2026-07-10-handler-authoring-simplify.md)

---

## Problem

**Shipped:** `renderMurrmureProtocolEnvelope` adds a **Session** metadata block, always-on **Discovery** / **Resolve API**, and scatters resolve guidance awkwardly (`When ready: murrmure_resolve_step({ run_id: "<run_id>", …`)`).

**Target:** Under each branch — schema, `Then:`, and the full MCP call. That's it.

---

## Target assembly

| Block | Single `contract_keys` | Multiple `contract_keys` |
|-------|------------------------|--------------------------|
| **Task** | Handler `prompt:` | Same |
| **Contracts** | Active step; complete compact canonical JSON Schema + artifact constraints + full `murrmure_resolve_step` under each branch | Scope summaries + full active-step contracts |
| **Discovery** | Omit | Include |

On a parent resume invocation, prepend a compact **Returned child** block containing child step, branch, iteration, payload, and artifact references. Show `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })` only when the active parent has declared children; the parent may either open one child or resolve its own contract. The operation accepts no arbitrary input. State that successful child open yields the current assignment, so the handler must stop protocol work; its mutation credential is revoked and child return creates a fresh resumed assignment. Resume is protocol context, not a promise that the same agent session or process was restored.

Every active-step branch includes its complete Draft 2020-12 schema as compact JSON with deterministic key ordering plus separate artifact constraints. Do not restate schema rules as prose. Additional scoped contracts show identity/summary only; Discovery retrieves their full schemas.

Cancellation, failure, and custom branch names use the same rendering template and schema-valid call placeholders as every other branch. Do not infer behavior from the name or add branch-specific explanatory examples; display only the compiled control effect.

### Acceptance shape (single-key)

```text
Protocol: murrmure.agent/v1

## Contracts
### Active step: build
Agent implements the spec and proposes commit subject + description.

Branch `completed`:
  Required payload: commit_message, description
  Then: run completes
  murrmure_resolve_step({
    run_id: "run_01J8K2M4N6P0Q2R4",
    step_id: "build",
    branch: "completed",
    payload: { commit_message: "…", description: "…" }
  })

Branch `failed`:
  Then: fail run
  murrmure_resolve_step({
    run_id: "run_01J8K2M4N6P0Q2R4",
    step_id: "build",
    branch: "failed"
  })
```

### Must not appear

- `## Session` block
- `## MCP tools` / `## Resolve API` sections (calls live under branches)
- `When ready:` preamble before resolve calls

---

## Code changes (indicative)

| File | Change |
|------|--------|
| `packages/hub-core/src/flow-engine/step-contract-slice.ts` | `renderAgentStepContractMarkdown` — full `murrmure_resolve_step` per branch with live `run_id` / `step_id`; slim `renderMurrmureProtocolEnvelope` (no Session, gate Discovery on multi-key) |
| Parent resume prompt | Render returned-child context and the scoped operation for activating one declared child; never imply the parent was reopened, resolved, or transparently process-restored |
| Local versus remote artifact guidance | Local MCP call may use a bridge-read workspace path; remote/federated call must use an uploaded artifact reference; Hub never reads an agent-machine path |
| `packages/executors/src/invoke-shell-prompt.ts` | Pass `contract_key_count`, `session_id` into protocol render |
| Tests | Part 5 extract fixture; no `## Session` |

---

## Acceptance criteria

| ID | Criterion |
|----|-----------|
| **APP-1** | Each branch in protocol includes full `murrmure_resolve_step({ run_id, step_id, branch, payload? })` |
| **APP-2** | No Session, MCP tools, or Resolve API sections |
| **APP-3** | Discovery only when `contract_keys.length > 1` |
| **APP-4** | Tutorial Part 5 extract matches live prompt after ship |
| **APP-5** | Artifact-requiring branches show selected-branch cardinality and transport-correct input: singleton workspace path or multi-file list for a local MCP bridge, ordered artifact-reference arrays remotely, and no Hub-read host path |
| **APP-6** | Resumed parent prompts identify the returned child result and offer only declared-child activation plus the parent's own branch resolve calls |
| **APP-7** | Initial and resumed prompts use the same parent step identity; no duplicate-open or transparent process/session continuation claim appears |
| **APP-8** | Child-open guidance states that success yields the assignment and forbids further protocol writes from the stale invocation |
| **APP-9** | Every initial/resumed contract block starts with exactly `Protocol: murrmure.agent/v1` and adds no separate metadata section |
| **APP-10** | Every active branch contains deterministic compact full JSON Schema and separate artifact constraints; non-active scoped contracts remain summaries with discoverable full schemas |
| **APP-11** | Cancel/failure/custom branches use the same generated structure and schema-valid placeholders as every branch; no name-derived explanatory semantics appear |

---

## Out of scope

- Handler `on::key` — [handler-authoring-simplify](./2026-07-10-handler-authoring-simplify.md)
- Default step branches — [step-default-branches](./2026-07-10-step-default-branches.md)
