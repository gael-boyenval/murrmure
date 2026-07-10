# Plan review — Vertical slices & orchestration loop

**Reviewer:** vertical-slices  
**Plan:** 2026-07-09-space-handlers-contract-keys-plan.md  
**Date:** 2026-07-09  
**Verdict:** PASS WITH AMENDMENTS

## Executive summary

The plan’s architectural target is strong and largely north-star aligned: it cleanly separates flow protocol from space execution, moves matching to contract keys, and removes action-name coupling (L26-L37, L452-L513). The main gap is execution shape: the remediation roadmap is still mostly horizontal by subsystem (layout, parser/index, engine, docs), which delays the first end-to-end shippable slice until late Phase 3 (L819-L908). For a reliable Codex dev -> Opus review -> Composer fix loop, each slice needs explicit entry criteria, bounded file scope, deterministic test gates, and explicit fix targets; this is not yet encoded in the plan. The plan is also trying to ship many optional surfaces alongside the core cutover (multiple new commands/tools/health endpoints), which increases review noise and slows convergence (L220-L228, L900-L907). With a vertical re-slice and orchestration tracking artifact, this can become execution-ready without changing core architecture.

## Vertical slice assessment

- Current phase shape is largely horizontal:
  - Phase 1 is mostly filesystem/runtime migration + briefing removal (L819-L837).
  - Phase 2 is mostly schema/index/tooling (L840-L857).
  - Phase 3 is runtime dispatch + completion semantics (L860-L878).
  - Phase 4-5 are schema/docs/doctor/health hardening (L881-L907).
- Result: the first true user-visible protocol-to-execution behavior lands only after large cross-cutting refactors, producing broad diffs and weak reviewability.

### Proposed VS-0..VS-6 slices

| Slice | End-to-end value | Scope (mapped to current plan) | Touch points | Loop exit criteria |
|---|---|---|---|---|
| **VS-0 Decision lock + orchestration scaffold** | Removes ambiguity before coding starts | Resolve open questions blocking runtime semantics (L1009-L1017); create orchestration tracker; add handler decision record (L811-L814) | `studio-specs/current/bridges/handlers.md`, orchestration tracking doc | All blocking decisions marked decided; each upcoming slice has entry/exit gates and test commands |
| **VS-1 Minimal handler E2E (single agent step)** | First shippable contract-key dispatch path | Handler parser/index + basic lint (subset of L844-L849), step.opened matching for one agent step (subset of L864), one fixture path in preview-review (L874-L876) | `parse-handlers.ts`, `handler-catalog-lint.ts`, `step-open.ts`, fixture tests | `write_spec` opens -> exactly one handler dispatches -> step resolves -> run advances, with legacy fallback still intact |
| **VS-2 Nested build→review loop (subgraph owner)** | Demonstrates multi-key ownership model | Multi-key scope slices + kill_on behavior (L865-L867), explicit policy for human key handling (L283, L1013) | `step-open.ts`, `invoke-shell-prompt.ts`, nested-loop integration tests | `build-loop`/`review` iteration works under one handler session; no ambiguous dispatch on human-opened steps |
| **VS-3 Completion semantics + resolve CLI** | Makes script/CLI/agent completion deterministic | `complete: auto|cli|explicit` wiring (L327-L389, L868), `mrmr step resolve` + env token path (L390-L438, L869-L870) | `step-resolve.ts`, `shell-spawn.ts`, resolve tests | `auto` and `cli` both pass integration; branch/payload validation errors are explicit and test-covered |
| **VS-4 `.mrmr/` cutover + briefing deletion** | Delivers final runtime layout and removes filesystem briefing dependency | Layout/path migration + hard cutover work (L823-L829), remove briefing generation/injection (L535-L537, L827), run artifacts under `.mrmr/dev` (L824-L826) | root/path resolvers, artifact helpers, `space-link-file.ts`, `wake-relay.ts`, delete `space-briefing.ts` | Grep gate clean, E2E run succeeds from `.mrmr` only, no briefing references remain |
| **VS-5 Bindings + event handlers + doctor coverage** | Enables worker/cross-space consumption and event-driven hooks in one loop | Bindings parse/resolve (L845, L612-L637), hook migration to `on.event` (L867), doctor lint wiring (L904) | `parse-bindings.ts`, hook matcher, doctor modules | Worker space with bindings runs catalog flow; `brief.requested` event handler path works; doctor flags expected gaps |
| **VS-6 Legacy deletion + docs/skills/health hardening** | Final convergence and cleanup | Remove legacy parsers (L907), docs/skills split and checks (L885-L891), optional health endpoints (L905-L906) | parser cleanup, docs/spec tests, skill installer/doctor | No legacy execution path; docs/tests pass; rollout notes complete |

## Build → review → fix loop readiness

### Per-slice loop packets

| Slice | Dev scope (Codex) | Review checklist (Opus) | Fix scope (Composer) | Done gate |
|---|---|---|---|---|
| **VS-1** | Add minimal handler parse/index + one dispatch path only | Single-handler match, no protocol regression, one-fixture green, no unrelated path churn | Fix only review findings in touched files; do not add new commands/features | Fixture integration + unit tests pass; diff limited to declared files |
| **VS-2** | Add multi-key/scope and nested-loop routing | Human/agent role boundaries preserved, no double-dispatch, prompt assembly still space-owned | Fix dispatch/prompt regressions and ambiguity findings | Nested build/review loop test proves one-owner policy |
| **VS-3** | Implement completion mode routing and `step resolve` CLI | Branch validation, failure-mode determinism, token handling safety, no stuck-working regressions | Fix mode-specific bugs; keep CLI surface minimal | `auto`/`cli` tests pass with explicit negative cases |
| **VS-4** | Migrate layout and delete briefing path | No stale path refs, compatibility/migration behavior explicit, observability unchanged | Fix migration misses and path regressions | Search gate and E2E run confirm clean cutover |
| **VS-5** | Add bindings + event handler + doctor checks | Federated worker scenario works, hook parity maintained, doctor severity correct | Fix failed lint/drift paths and event mapping issues | Worker+catalog fixture and event test pass |
| **VS-6** | Remove legacy paths; finish docs/skills/health | No hidden fallback remains; docs match runtime; no unnecessary abstraction added | Fix residual cleanup regressions only | Legacy parsers removed, docs-proof and doctor tests pass |

### What is missing for orchestration

- No explicit **slice packets** defining: allowed files, required tests, and out-of-scope constraints per slice.
- No explicit **review artifact format** (severity rubric, blocking vs non-blocking, reproducible commands).
- No explicit **fix target contract** (Composer should patch only accepted findings from review artifact).
- No mandatory **entry gate** tying open questions (L1009-L1017) to slice readiness.
- No explicit **PR sizing rule** (max touch points / max changed files) to keep diffs reviewable.

### `orchestration.md` tracking format suggestion

Create `studio-specs/plans/orchestration/2026-07-09-space-handlers-contract-keys-orchestration.md` with one section per slice:

```markdown
# Orchestration — space handlers contract keys

## VS-1 Minimal handler E2E
Status: READY | IN_DEV | IN_REVIEW | IN_FIX | DONE

### Entry criteria
- Open questions resolved: [Q3 human keys], [Q7 cli branch validation]
- Base fixture green on main

### Dev packet (Codex)
- Goal:
- Allowed files:
- Required tests:
- Out of scope:

### Review packet (Opus)
- Checklist:
  - portability/federation
  - one-handler-per-step invariant
  - no flow-level execution coupling
  - simplicity/delete-over-wrap
- Commands to run:

### Fix packet (Composer)
- Input: review report link
- Fix scope: accepted blocking findings only
- Must not change: (list)

### Exit criteria
- Tests:
- Invariants verified:
- Artifacts: PR, review report, fix diff
```

## Simplicity & touch points

### Over-engineering risks

1. **Too many new surfaces at once**: command/tool expansion (`space contracts`, scaffold, coverage, list handlers, health, run context) appears before core cutover stabilizes (L220-L228, L905-L907).
2. **Optional wildcard matching too early**: prefix/wildcard matching is explicitly optional (L130, L955) and should stay deferred until exact-key behavior is hardened.
3. **Codegen breadth may be premature**: four generated artifacts in first wave (L167-L172) can be reduced initially to `contract-keys.json` + schema.
4. **Hard cutover timing risk**: strict no-coexistence immediately in Phase 1 (L829) increases migration blast radius before first handler E2E proof.

### Right touch points vs wrong places to change

- **Right touch points** (already mostly correct):
  - handler parse/lint/index in hub-core index path (L965-L967)
  - dispatch in step-open and resolve in step-resolve (L967-L969)
  - prompt assembly in executors prompt builder (L972)
  - CLI resolve command and shell env injection (L969-L971)
- **Wrong places / avoid**:
  - avoid re-embedding execution policy in flow schema/compiler while removing `executor.action`
  - avoid adding hub-owned step-task prompting logic beyond contract/context slices (space owns prompts)
  - avoid broad doctor/health endpoint expansion before core dispatch parity is proven

### Deletion opportunities

- Delete `space-briefing.ts` as soon as VS-4 passes (L535-L537, L985).
- Timebox dual-read compatibility and explicitly schedule parser removals (L848, L907).
- Remove `link.json` compatibility once `space.yaml link:` migration test passes (L598-L608, L661).
- Keep `murrmure-developer` out of runtime prompt path (L687-L693, L731).

## North star alignment

| North star section | Alignment evidence in plan | Gaps / violations to close |
|---|---|---|
| **1. Purpose** | Clear coordination split and handoff model (L26-L33, L93-L101) | Add per-slice observability handoff checks so “done and understood” is measurable |
| **2. What it is / is not** | Event-kernel framing and space-owned execution are explicit (L76-L90, L95-L102) | Keep optional tooling/features from inflating platform scope before core behavior lands |
| **3. Event-based orchestration** | Lifecycle events and handler `on.event` integration are central (L77-L80, L126-L133, L294-L307, L867) | Add explicit tests for non-step triggers in the vertical roadmap, not only in late phases |
| **4. Portability & federation** | `executor.action` removal and bindings model strongly support portability (L26-L33, L612-L637) | Add mandatory worker+catalog acceptance slice; current success criteria are mostly single-repo centric |
| **5. Ownership boundaries** | Responsibility table is strong (L95-L101); flow protocol-only target is strong (L452-L503) | Clarify human-step keys in handler scope (L283, L1013) to prevent boundary blur |
| **6. Human experience** | Human roles and presentation views remain explicit in flow shape (L465-L498) | Ensure subgraph-owner slices do not unintentionally prioritize shell-only UX over view-driven human steps |
| **7. Observability** | `space_status`, list handlers, doctor, health intent present (L541-L548, L735-L752, L900-L907) | Add per-slice journaling and MCP-output assertions as hard done gates |
| **8. Design discipline** | Anti-patterns section is explicit and strong (L911-L923) | Sequence should enforce “minimal change first”; current phase order is still architecture-layered |

## Required plan amendments (numbered, actionable)

1. **Replace `Remediation phases` with vertical slices VS-0..VS-6.**  
   - **Where:** `## Remediation phases` (L804-L908).  
   - **Why:** Current ordering is subsystem-horizontal and delays first shippable behavior.

2. **Add a dedicated orchestration tracker with dev/review/fix packets per slice.**  
   - **Where:** New companion `orchestration.md` referenced from this plan near remediation section.  
   - **Why:** Needed to spawn Codex/Opus/Composer loops deterministically.

3. **Promote open questions into explicit entry gates, not trailing notes.**  
   - **Where:** `## Open questions` (L1009-L1017) + VS-0 entry criteria.  
   - **Why:** Unresolved semantics currently block reliable implementation/review.

4. **Narrow VS-1 to one-step E2E and defer optional surfaces.**  
   - **Where:** Phase 2/3 work lists (L844-L870).  
   - **Why:** Establish core behavior before expanding commands/endpoints.

5. **Move hard `.mrmr/` cutover after first handler E2E proof, with explicit temporary compatibility window.**  
   - **Where:** Phase 1 hard-cutover item (L829).  
   - **Why:** Reduce migration blast radius and improve bisectability.

6. **Define human-step key policy as explicit schema, not comment-level convention.**  
   - **Where:** Handler example note (L283) and open question #3 (L1013).  
   - **Why:** Prevent ambiguous dispatch and role-boundary regressions.

7. **Make `complete: cli` branch correctness testable in-slice.**  
   - **Where:** Doctor lint mention (L776) and open question #7 (L1017).  
   - **Why:** Avoid “working forever” failures and branch drift.

8. **Add federation acceptance criteria as first-class exit gates.**  
   - **Where:** Success criteria/manual sign-off (L926-L947).  
   - **Why:** North star requires cross-space/cross-machine viability, not only local examples.

9. **Introduce a simplicity budget per slice (max files/touch points + no new abstraction without second consumer).**  
   - **Where:** New subsection under remediation/orchestration loop.  
   - **Why:** Keeps PRs reviewable and avoids abstraction creep.

10. **Create a deletion ledger with planned removal slice for each legacy path.**  
    - **Where:** Path migration/deprecation references (L651-L667, L848, L907).  
    - **Why:** Enforces “delete don’t wrap” and prevents indefinite dual paths.

11. **Require per-slice observability assertions.**  
    - **Where:** Add to each slice’s acceptance criteria.  
    - **Why:** North star section 7 expects shared, inspectable truth for each increment.

12. **Pin reviewable diff boundaries from the code map.**  
    - **Where:** `## Code map (target)` (L961-L986) reused as per-slice allowlists.  
    - **Why:** Enables focused Opus review and faster Composer fix cycles.

## Suggested rewritten phase/slice outline

1. **VS-0 — Decision lock + orchestration scaffolding**  
   Finalize Q1/Q3/Q6/Q7 (L1011-L1017), publish orchestration packets, and mark required tests/checklists.

2. **VS-1 — Minimal handler E2E (single agent step)**  
   Ship parser/index + step-open matching for one fixture step, with legacy fallback still present.  
   **Gate:** one deterministic run from step open to resolve.

3. **VS-2 — Nested subgraph owner loop**  
   Ship multi-key scope behavior, kill_on semantics, and explicit human-step policy.  
   **Gate:** build->review->changes_required loop passes under one-owner policy.

4. **VS-3 — Completion modes + `mrmr step resolve`**  
   Ship `auto|cli|explicit`, resolve CLI, token/env handling, and failure-path tests.  
   **Gate:** auto and cli completion are deterministic and validated.

5. **VS-4 — `.mrmr/` layout cutover + briefing removal**  
   Migrate paths and remove briefing injection/generation.  
   **Gate:** no old-path references; `.mrmr/dev` runtime works E2E.

6. **VS-5 — Bindings + event handlers + doctor integration**  
   Ship worker-space bindings and `on.event` parity with hooks plus doctor checks.  
   **Gate:** worker+catalog scenario and `brief.requested` event path both pass.

7. **VS-6 — Legacy deletions + docs/skills/health hardening**  
   Remove old parsers, complete docs/skills split, then add non-core health endpoints.  
   **Gate:** no hidden legacy fallback; docs/tests and doctor expectations are aligned.

This keeps architecture direction intact while converting implementation into reviewable, end-to-end vertical increments suitable for repeated Codex -> Opus -> Composer orchestration.
