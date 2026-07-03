# Phase 03 — Flow engine completion

**Status:** ✅ complete  
**Execution order:** **3 / 10**  
**Feedback:** B1 [gate steps](../../../../feedbacks/2026-07-02-improvement-flow-engine-gate-steps.md) · B2 [step outputs](../../../../feedbacks/2026-07-02-improvement-flow-engine-step-outputs.md) · B3 [shell_spawn env](../../../../feedbacks/2026-07-02-improvement-shell-spawn.md)  
**Depends on:** [01](./01-apply-validation.md) (registry)  
**Decisions:** [04 resolve wire](./decisions/04-human-checkpoint-resolve-wire.md) · [05 checkpoint steps](./decisions/05-triggers-only-checkpoint-steps.md) · [06 on_resolve explicit](./decisions/06-checkpoint-on-resolve-explicit.md) · [08 payload_ref](./decisions/08-payload-ref-from-step-output.md)  
**Unblocks:** [05](./05-view-canvas-checkpoints.md), [06](./06-reference-workflow-preview-review.md)

---

## Problem

Three engine gaps block human/agent review loops:

1. **B1** — `checkpoint`/`gate` steps compile but are not dispatched (`advance.ts` invoke-only).
2. **B2** — `{{steps.*}}` templates never resolve (`exec_context.steps` empty) — views cannot show `preview_url`.
3. **B3** — `MURRMURE_INPUT` not passed to `shell_spawn` children.

Without B1+B2, [preview-review loop](./06-reference-workflow-preview-review.md) cannot run.

---

## B1 — Declarative checkpoint steps (spec)

IR kind **`checkpoint`** (compiler accepts legacy alias **`gate`** during migration).

### On checkpoint step entry

1. `createPendingGate` with `step_id`, `assignees`, manifest `view` → `view_ref`
2. Run `lifecycle` → `input-required`
3. Step memo → `working`
4. **Hold advance** — no subsequent steps until resolve

### On gate/checkpoint resolve ([decision 04](./decisions/04-human-checkpoint-resolve-wire.md))

**Request body (normative v2):**

```typescript
interface GateResolveRequest {
  disposition: "continue" | "cancel";
  output?: Record<string, unknown>;
}
```

**Engine behavior:**

1. Persist gate terminal status (internal map: `continue` → resolved path, `cancel` → cancelled path)
2. Set `exec_context.steps[step_id].output`:

```typescript
{
  ...input.output,
  disposition: input.disposition,
  resolved_at: ISO8601,
  resolved_by: actor_id,
}
```

3. **First checkpoint input merge** ([decision 05](./decisions/05-triggers-only-checkpoint-steps.md)): if step index 0 or `checkpoint.merge_input: true` (default true for index 0), shallow-merge `output` into `exec_context.input`
4. Apply **`on_resolve` branching** (below)
5. Call `advanceFlowAfterStep` when branch target allows

**Backward compat:** HTTP handler may accept legacy `decision` + `resume_data` + `form_values`; map to v2 during migration. New docs/views use v2 only.

**MCP:** `murrmure_resolve_gate` accepts same `{ disposition, output }`. Human path still resolves via **view submit → shell**, not agent MCP.

### Manifest schema extension

```yaml
triggers:
  manual: true
steps:
  - id: review
    checkpoint:
      view: preview-review
      assignees: ["{{input.reviewer}}"]
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
        default: { goto: done }       # REQUIRED
        cancel: { fail: true }        # REQUIRED
```

```typescript
// packages/contracts/src/flow/manifest.ts
FlowCheckpointStepSchema {
  view: string;
  assignees?: string[];
  merge_input?: boolean;  // default true for step index 0
  on_resolve: {
    when?: string;         // e.g. output.outcome
    values?: Record<string, { goto?: string; fail?: boolean }>;
    default: { goto?: string; fail?: boolean };  // REQUIRED
    cancel: { goto?: string; fail?: boolean };    // REQUIRED
  };
}
```

**Apply-time:** resolve `checkpoint.view` → `view_ref` on step IR.

**Legacy alias (optional):** `on_resolve.approved` / `on_resolve.rejected` map to disposition continue/cancel for unmigrated manifests.

### Branching semantics ([decision 06](./decisions/06-checkpoint-on-resolve-explicit.md))

**No silent engine defaults.** On resolve:

1. If `disposition: cancel` → apply **`on_resolve.cancel`** only
2. If `disposition: continue` → evaluate `when`/`values`; if no match → **`on_resolve.default`**
3. Targets: `{ goto: "<step_id>" }` (cycle detection max depth 32) or `{ fail: true }`
4. If `default`/`cancel` absent at runtime → fail run `checkpoint_routing_missing` (safety net)

| Resolve | Example | Behavior |
|---------|---------|----------|
| `continue`, `output.outcome: validated` | Approve | `goto: done` |
| `continue`, `output.outcome: changes_required` | Request changes | `goto: build` — **same run**, not cancel |
| `cancel` | Dismiss | per `on_resolve.cancel` |

**Lint (phase 01):** missing `default`/`cancel` — warn; strict fail.

---

## B2 — Step outputs (spec)

On `murrmure.action.completed` for an invoke step:

```typescript
exec_context.steps[step_id] = {
  status: "completed" | "failed",
  output: action_result,
  completed_at: ISO8601,
};
```

Templates `{{steps.build.output.preview_url}}` resolve in subsequent invoke params and checkpoint assignees.

**View context:** shell includes `steps` snapshot in `murrmure.view.context` (phase 05).

---

## B3 — shell_spawn env (spec)

| Variable | Source |
|----------|--------|
| `MURRMURE_INPUT` | `JSON.stringify(exec_context.input)` |
| (existing) | `MURRMURE_RUN_ID`, `MURRMURE_SESSION_ID`, … |

---

## payload_ref ([decision 08](./decisions/08-payload-ref-from-step-output.md))

Optional on checkpoint step. **MVP:** author sets `payload_ref` template from prior step output (e.g. `"{{steps.build.output.artifact_ref}}"`). **No** hub auto-snapshot of large payloads in v2 MVP. Gate record stores resolved ref when pending.

---

## Registry

Add `checkpoint` (and legacy `gate` alias) to `ENGINE_DISPATCH_KINDS`; phase 01 checkpoint warning removed when B1 ships.

---

## Definition of done

### Code

- [x] `buildCheckpointDispatch` in `advance.ts` + `advance-runner.ts`
- [x] `on_resolve` branch planner (goto; cycle detection max depth 32)
- [x] Resolve v2 wire + legacy alias mapping in HTTP handler
- [x] First-checkpoint input merge into `exec_context.input`
- [x] `mergeStepOutputIntoExecContext` on action complete
- [x] `FlowCheckpointStepSchema` + `triggers` schema in contracts; remove `start.requires_view`
- [x] `apply-index.ts` denormalizes checkpoint `view_ref`
- [x] `MURRMURE_INPUT` in `shell-spawn.ts`
- [x] `payload_ref` template resolution on gate create

### Tests

- [x] Unit: invoke → checkpoint pause → continue → next step
- [x] Unit: invoke → checkpoint → continue with changes_required → goto build → checkpoint again (2-round loop)
- [x] Unit: cancel disposition → `on_resolve.cancel`
- [x] Unit: missing `default` at runtime → `checkpoint_routing_missing`
- [x] Unit: `{{steps.build.output.x}}` resolves in invoke params
- [x] Unit: step 0 checkpoint output merges into `input`
- [x] Fixtures:
  - `fixtures/flow-engine/declarative-gate-chain.json`
  - `fixtures/flow-engine/step-output-chaining.json`
  - `fixtures/flow-engine/gate-loop-on-resolve.json` (preview-review shape)
  - `fixtures/flow-engine/murrmure-input-env.json`

### Docs (same PR)

- [ ] [current/product/spec.md](../../../current/product/spec.md) §5.6 — checkpoint runtime + `on_resolve` + resolve wire
- [x] [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md) — mark B1/B2 dependencies met
- [ ] [apps/docs/reference/http-api.md](../../../../apps/docs/reference/http-api.md) — `disposition` + `output`
- [x] Remove B1–B3 from known-gaps

### Proof

- [x] `preview-review-v2` example (phase 06 tree) completes 2-round loop in hub-core fixture without `open-confirm-gate.mjs`

---

*End of phase 03.*
