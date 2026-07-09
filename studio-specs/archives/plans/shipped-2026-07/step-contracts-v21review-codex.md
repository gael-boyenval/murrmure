# Review - Murrmure v2.1 Unified Step Contracts

## Verdict

The direction is correct (single step contract model, view-first human fulfillment), but this spec should **not** be adopted as written. It still carries transitional mechanics that preserve the old split, and those mechanics conflict with the owner constraints ("simplest foundation", "no compatibility shims", "rebuild is acceptable").

Reality check from the current codebase confirms how deep the split still is:
- `packages/hub-daemon/src/mcp-tool-registry.ts` exposes separate gate and invoke-era tools (`murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate`) and no step-native resolve API.
- `packages/contracts/src/flow/manifest.ts` keeps parallel author-facing nouns (`invoke`, `gate`, `checkpoint`) with no single contract block.
- `packages/hub-core/src/flow-engine/advance.ts` and `packages/hub-core/src/flow-engine/checkpoint-runner.ts` operate as separate runners for invoke vs checkpoint progression.
- `packages/shell-client/src/client.ts` and `packages/shell-web/src/routes/RunPage.tsx` resolve by `gate_id` (`/v1/gates/:gate_id/resolve`), not `step_id`.
- `studio-specs/plans/2026-07-07-phase-a-findings.md` already documents race/finality pain from dual completion paths (`ACTION_TIMED_OUT` while later completion still arrives).

Given those facts, v2.1 should become a **hard-cut contract kernel rewrite**, not an additive bridge. External API can be smaller than proposed: one mutating step API (`resolve_step`) plus existing read APIs (`get_run`/`wait_for_run`) is enough for foundation. `invoke_step` should remain an internal engine transition, not a public tool. `wait_for_step` can be an optional convenience later, not kernel-critical.

Adopt the concept, reject the migration shape.

## Inconsistencies Table

| spec section | issue | fix |
|---|---|---|
| Unified step API | `invoke_step` duplicates engine dispatch responsibility already implied by `invoke.action`; this creates two authorities that can open steps. | Remove public `invoke_step`. Engine is sole activator. External callers only resolve current active step. |
| Unified step API (migration aliases) | Alias strategy (`complete_action`, `wait_for_gate`) violates owner "no compatibility shims". | No aliases. Ship one canonical API, update docs/examples/tests in same cut. |
| HTTP shim for `gate.resolve` | `POST /v1/gates/:id/resolve -> step resolve` keeps gate noun alive and leaks old model into new kernel. | Delete gate resolve surface; view submit must call step resolve directly with `run_id + step_id`. |
| One API, all step IDs | Text says same handler for parent/child, but behavior depends on hidden dispatch policy and actor type; this is still a split model in disguise. | Normalize: state machine owns activation, routes own transitions, actors only submit branch outcomes. |
| Nested routing vocabulary | Nested uses `complete|continue|goto|fail` while top-level uses `goto|fail`; two routing grammars increase cognitive and implementation complexity. | Use one routing schema everywhere: `on.<branch>.to: <qualified_step_id|@end|@fail>` plus optional merge policy. |
| Nested routing + locality rule | "Never reference top-level IDs" conflicts with need to leave child graph and continue run, introducing special `complete: parent` semantics. | Allow qualified IDs globally; reserve `@parent` only if hierarchy retained, otherwise flatten IDs and remove special parent verbs. |
| Sequencing invariant | "One active child", "first child auto-activates", and "agent invokes next child" introduce mixed control rules likely to drift from graph semantics. | Make sequencing purely edge-driven: engine activates exactly one next node from resolved branch edge; no manual child invoke. |
| Prompt/environment injection | Proposed token matrix is too large; it reintroduces fragile text contracts and index-time token governance burden. | Inject one JSON contract (`MURRMURE_STEP_CONTRACT`) + one JSON context (`MURRMURE_RUN_CONTEXT`) + a tiny set of path vars. |
| Step artifacts/temp paths | Spec adds `.mrmr.temp/runs/...` while retaining inbox/outbox as first-class paths; this is dual path mental model. | Adopt one run-scoped filesystem contract for executors; keep inbox/outbox as internal transfer implementation detail only. |
| Executors and completion modes | `explicit_resolve` plus retained `shell_exit` and complete-action mapping risks reintroducing multiple completion semantics. | Kernel completion is always branch resolve. Shell exit adapter is internal and must emit same resolve operation. |
| Journal migration | Dual-writing legacy and new events extends split lifecycle and complicates monotonic memo guarantees. | Emit one canonical event family (`mrmr.step.*`) and migrate projections in one release cut. |
| Phase plan | Current phased plan is bridge-heavy and keeps old+new models running together for too long. | Replace with clean rebuild sequence (schema, engine, API, shell, docs) with no runtime compatibility layer. |

## Foundation Proposal

The clean foundation is: **one step graph, one step transition API, one projection model**.

Authoring can remain ergonomic, but runtime must be normalized immediately to a single contract IR:
- every step has `id`, `actor` (`agent|human|system`), `branches`, `schema`, optional artifacts contract, and branch routes;
- routes always point to a next qualified step id or terminal symbol;
- engine exclusively controls activation;
- all fulfillers (agent, view, internal adapter) resolve through the same branch transition.

Minimal external control plane:
1. `murrmure_resolve_step` (write, idempotent, schema/artifact-validated, terminal-safe)
2. `murrmure_get_run` / `murrmure_wait_for_run` (read; step wait can be added later as sugar)

No `invoke_step` tool in public surface. Activation belongs to the run state machine, not to remote callers.

```mermaid
flowchart TD
  A[Run created] --> B[Engine activates next step]
  B --> C[Step state: working or input-required]
  C --> D[Resolver submits branch via resolve_step]
  D --> E[Validate auth + schema + artifacts + idempotency]
  E --> F[Commit terminal step memo]
  F --> G[Apply branch route]
  G -->|to next step id| B
  G -->|@end| H[Run completed]
  G -->|@fail| I[Run failed]

  J[get_run / wait_for_run] -.read model.-> B
  J -.read model.-> C
  J -.read model.-> F
```

### Clean rebuild sequence (no shims)

1. **Cut schema first**
   - Replace manifest runtime model in `packages/contracts/src/flow/manifest.ts` with a single step contract shape (still allow ergonomic author YAML, but compile to one IR only).
   - Remove parallel invoke/gate/checkpoint runtime nouns from IR.

2. **Replace engine core**
   - Replace split runners in `packages/hub-core/src/flow-engine/advance.ts` and `packages/hub-core/src/flow-engine/checkpoint-runner.ts` with one transition runner.
   - Enforce monotonic terminal memos and reject late resolves by default.

3. **Replace API + MCP in one cut**
   - Remove `murrmure_complete_action`, `murrmure_wait_for_gate`, `murrmure_resolve_gate` from `packages/hub-daemon/src/mcp-tool-registry.ts`.
   - Add only step-native tool(s) and step-native HTTP route(s).

4. **Replace shell client and shell-web**
   - Update `packages/shell-client/src/client.ts` and `packages/shell-web` pages/components to operate on pending step projections, not gates.
   - Keep ViewCanvasHost as primary human path; route submissions directly to step resolve.

5. **Unify artifacts path contract**
   - Expose one run-scoped artifact/workdir surface to executors.
   - Keep exchange/inbox/outbox internals behind artifact service only.

6. **Regenerate examples/docs/tests**
   - Rewrite preview-review and docs/tutorials to the single contract model.
   - No alias docs, no migration branch logic, no dual event assertions.

## Delete List

Remove the following from current v2 foundation:
- Gate as first-class runtime protocol noun for flow steps (`/v1/gates/*` for normal step progression, gate-only MCP tools, gate-only shell resolve path).
- `murrmure_complete_action` as a separate conceptual completion endpoint.
- Any compatibility aliases between gate and step APIs.
- Dual journal semantics for step completion (`action.*` and `gate.*` both treated as step terminals for the same flow progression contract).
- Split flow progression runners (invoke path and checkpoint path as independent codepaths).
- Author-facing parallel models where both invoke and checkpoint are runtime-primary instead of one contract schema.
- Route vocabulary split (`complete|continue|goto|fail` nested vs top-level `goto|fail`).
- Token-heavy prompt DSL as kernel dependency.
- Public reliance on `inbox/outbox` path specifics in step contracts.
- Legacy `decision`/`disposition` dual wire semantics.

## Keep List

Keep as minimal kernel primitives:
- Run/session identity and lifecycle model.
- Step memo projection table (with strict monotonic terminal semantics).
- Capability and flow ACL enforcement.
- Artifact exchange service and inline payload cap enforcement.
- ViewCanvasHost-first human fulfillment UX from shell-web.
- Read APIs (`get_run`, `wait_for_run`) and run graph projection capability.

## Top 5 Spec Changes

1. **Drop public `invoke_step`; keep only `resolve_step` as the write primitive.**  
   Step activation is internal engine behavior. This eliminates redundant control channels and race classes.

2. **Replace dual routing grammars with one universal branch route model.**  
   Every branch maps to exactly one `to` target (`qualified step id`, `@end`, `@fail`) and optional merge mode.

3. **Hard-remove shims, aliases, and dual events from the plan.**  
   No `complete_action` alias, no `gate.resolve` shim, no one-release dual-write. Clean cut only.

4. **Reduce prompt injection to contract JSON + context JSON.**  
   Keep token surface tiny and deterministic; avoid combinatorial `{{murrmure.*}}` token growth.

5. **Adopt a single run-scoped artifact filesystem contract.**  
   Executor-facing paths should be step/run scoped and stable. Inbox/outbox stay internal transport details.

Codex reviewer
