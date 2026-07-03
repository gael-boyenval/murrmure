# Phase 01 — Apply validation

**Status:** ✅ complete (2026-07-03)  
**Execution order:** **1 / 10**  
**Feedback:** [feedbacks/2026-07-02-improvement-space-apply-validation.md](../../../../feedbacks/2026-07-02-improvement-space-apply-validation.md)  
**Decisions:** [05 triggers/checkpoint lint](./decisions/05-triggers-only-checkpoint-steps.md) · [06 on_resolve lint](./decisions/06-checkpoint-on-resolve-explicit.md) · [14 doc tracker warn](./decisions/14-doc-tracker-warn-from-phase-01.md)  
**Blocks:** honest scaffolds (04), wizards (08)

---

## Problem

`mrmr space apply` compiles step kinds the engine does not dispatch (notably `checkpoint`/`gate` until phase 03). Authors trust YAML that **looks** valid and discover gaps at runtime. Referenced views may lack built `dist/` at apply time.

## Outcome

Single source of truth **`ENGINE_DISPATCH_KINDS`** in `hub-core`, consumed by:

- Apply lint (CLI + hub `warnings[]`)
- Phase 03 advance dispatch (checkpoint added when shipped → lint auto-clears)

### Lint checks (v1)

| Check | Default | `--strict` |
|-------|---------|------------|
| Step kind not in `ENGINE_DISPATCH_KINDS` | warn | fail |
| `invoke.action` missing from index | warn | fail |
| Executor binding missing for action | warn | fail |
| Checkpoint `view` id not found under `murrmure/views/` | warn | fail |
| View package exists but **`dist/` missing** or manifest `entry` absent | warn | fail |
| Legacy `start.requires_view` in manifest | warn (migrate to step 0 checkpoint) | fail |
| Legacy `start:` key without `triggers:` | warn (`DEPRECATED_START_KEY`) | warn (not fail) |
| Checkpoint missing `on_resolve.default` | warn | **fail** |
| Checkpoint missing `on_resolve.cancel` | warn | **fail** |
| Checkpoint after `invoke`, no loop-back hint in `values` | warn | warn |
| `on_resolve.when` set but `values` empty | warn | fail |
| `goto` target step id not in manifest | warn | fail |

Lint codes: `CHECKPOINT_ON_RESOLVE_DEFAULT_MISSING`, `CHECKPOINT_ON_RESOLVE_CANCEL_MISSING`, `CHECKPOINT_LOOPBACK_HINT`, `CHECKPOINT_VIEW_DIST_MISSING`, `DEPRECATED_START_KEY`.

Pre-phase-03: `checkpoint`/`gate` in manifest → warn with pointer to known gap B1.

**Not linted at apply:** `dev/fixtures/`, dev server state — only **artifact present** at apply time ([decision 02](./decisions/02-view-dev-loop.md)).

---

## Definition of done

### Code

- [x] `packages/hub-core/src/flow-engine/engine-capabilities.ts` — exported `ENGINE_DISPATCH_KINDS`
- [x] `lintFlowEngineCapabilities(ir, index)` + cross-ref lint (all rows above)
- [x] CLI: warnings on stdout; `--strict` exit 1
- [x] Hub apply: `warnings: [{ flow_id, step_id, code, message }]`
- [x] **`check:doc-tracker`** script — **warn-only** from this phase ([decision 14](./decisions/14-doc-tracker-warn-from-phase-01.md))

### Tests

- [x] `packages/cli/test/space-apply.test.ts` — checkpoint manifest warns pre-03; strict fails; dist missing fails under strict
- [x] Fixture `studio-specs/current/fixtures/space-apply/unsupported-step-kind.json`
- [x] Fixture `studio-specs/current/fixtures/space-apply/checkpoint-on-resolve-missing.json`

### Docs (same PR)

- [x] [current/cli/spec.md](../../../current/cli/spec.md) — `space apply --strict`, checkpoint view/dist lint
- [x] Skill `reference/flow-authoring.md` — apply-time warnings
- [x] [apps/docs/guide/known-gaps.md](../../../../apps/docs/guide/known-gaps.md) — B5 removed; B1 notes apply warnings
- [x] [00-doc-skill-mcp-tracker.md](./00-doc-skill-mcp-tracker.md) — phase 01 rows checked

### Proof

```bash
pnpm test --filter @murrmure/cli -- space-apply
mrmr space apply --strict   # fails on checkpoint-only flow before phase 03
pnpm check:doc-tracker      # warn-only; no exit 1 until phase 10
```

User: author sees warning **before** Run, not after failed run.

---

*End of phase 01.*
