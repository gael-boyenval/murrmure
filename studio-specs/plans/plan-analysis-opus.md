# Independent architecture review — Tutorial 1 v3 vs. the 2026-07-10/07-13 plans

**Reviewer:** Opus (independent, 1 of 3)
**Date:** 2026-07-13
**Premise (as instructed):** The v3 tutorial (`apps/docs/guide/tutorials/01-local-preview-review-v3/`) is the **experience/design target (XD)**. The `studio-specs/plans/` items are supposed to bring code into alignment with that tutorial. Current code is *not* assumed correct; the tutorial is *not* to be changed merely to match implementation. Conflicts with normative `studio-specs/current/` and the product north star are surfaced explicitly, not silently resolved.

**Method:** Read the full v3 tutorial (index + Parts 1–6) and all 11 active plans + `plans/README.md`. Traced each tutorial-visible behavior into shipped code (contracts schemas, hub-core flow-engine, executors, view-sdk, shell-web, hub-daemon routes, CLI wizard) to test whether the plans are (a) implementable and (b) sufficient to make the tutorial run. Findings are labelled **[CONFIRMED]** (verified in code), **[QUESTION]**, or **[HYPOTHESIS]**.

---

## 1. Executive summary

The tutorial describes a clean, minimal six-beat flow. **As of today the tutorial is not runnable end-to-end** — every one of Parts 2–6 depends on behavior that does not exist yet. The plan set covers *most* of that gap, but I found **one first-order tutorial requirement that no plan owns** (the `triggers:` vs required `start:` manifest field), **one security-grade defect in the tutorial's own handler design** (unescaped `{{…}}` interpolation into `shell: true` commands), and **substantial overlap/sequencing hazards** between the two view/branch plans and between `step-default-branches` and its parent research plan.

Highlights:

- **7 confirmed hard blockers** stand between the tutorial and a green run. 6 are owned by plans; **1 (trigger field) is uncovered**.
- The two most tutorial-critical fixes (`branch-schema-artifact-validation`, `view-sdk-contracts-and-upload`) **overlap heavily** — both edit `active_human_step.branches`, `buildViewAppContext`, `mapViewSubmitToResolveStep`, and dev fixtures. Uncoordinated, they will collide.
- Three plans are still **Phase 0 research (not started)** — `flow-branch-api-simplify`, `handler-authoring-simplify`, `agent-grant-onboarding`, plus `run-scratch-path-normalize` (Phase 0 decision) and `branch-schema-artifact-validation` (Phase 0 open questions). The tutorial has already been written to the *unratified* target shape of all of them, so the docs currently describe behavior that neither ships nor has an approved contract.
- **No test or fixture space exercises the v3 tutorial** (`my-dev-flow` / `spec-intake` appear only in docs and plans). There is no executable proof the target is coherent.
- Normative `studio-specs/current/` **still disagrees with shipped code** on run-scratch paths; the tutorial matches code, not the spec.

**Bottom line:** the plans are directionally right and mostly implementable, but they are not yet a *sufficient, sequenced, deconflicted* program. Before implementation, resolve the trigger-field gap, deconflict the two view/branch plans into one ownership boundary, ratify the three Phase-0 research decisions the tutorial already assumes, and add an executable tutorial fixture as the acceptance gate.

---

## 2. What the tutorial actually requires (behavior inventory)

| Beat | Tutorial-visible requirement | Evidence in tutorial |
|------|------------------------------|------------------------|
| P1 | `mrmr setup` wizard is the only agent-connect path (Grant step); space appears empty (no example flow); bundled MCP bridge (no npm install) | `01-launch-and-create-space.md` §3, checkpoint |
| P2 | Manifest header uses **`triggers: { manual: true }`**; linear steps need only `id`+`description`; `intake` declares explicit `continue`/`cancel`; `continue` is **file-only** (`required:[spec]`, no `spec_filename`) | `02-build-minimal-flow.md` §1–2 |
| P3 | View imports `useViewContract`, `submitBranch`, `isViewContractError`; `context.step.branches` carries the compiled branch contract; `submitBranch("continue",{files:{spec}})` (no base64) | `03-build-intake-view.md` §3 |
| P4 | File-only resolve succeeds with empty payload; artifact lands under **`.mrmr/dev/runs/{run_id}/steps/intake/spec/`** | `04-run-and-understand.md` §3–4 |
| P5 | `write_spec` (no `branches`), `build` (custom `completed` schema only); handler `on: step.opened::my-dev-flow.write_spec`; `complete: auto`/`explicit`; `contract_keys` prompt-only; slim agent prompt with full `murrmure_resolve_step` per branch | `05-extend-flow-and-handlers.md` §1–5 |
| P6 | `cleanup` (no `branches`); handler interpolates `{{steps.build.output.commit_message}}`/`description` into `git commit`; `{{murrmure.step.intake.artifact.spec.path}}` | `06-cleanup-and-commit.md` §1–2 |
| Cross | Desktop flowchart / journal reading; “Run” affordance; branch/gate/fail visualization | `04` §5; `2026-07-13` plan |

---

## 3. Findings by severity

### CRITICAL

#### C-1 — `triggers:` is not a shipped field; `start:` is required and unaliased. **No plan owns this.** [CONFIRMED]

The tutorial manifest (every part from P2) is:

```yaml
apiVersion: murrmure.flow/v1
name: my-dev-flow
triggers:
  manual: true
```

But the contract requires `start` and treats `triggers` as an optional, **unused** sibling:

```114:126:packages/contracts/src/flow/manifest.ts
export const FlowManifestSchema = z.object({
  apiVersion: z.literal("murrmure.flow/v1"),
  name: z.string(),
  description: z.string().optional(),
  triggers: FlowStartConditionsSchema.optional(),
  start: FlowStartConditionsSchema,
  ...
```

- `parseFlowManifest` calls `FlowManifestSchema.safeParse(raw)` with **no `triggers`→`start` normalization** (`packages/hub-core/src/index/parse-flow-manifest.ts:58`). A manifest with only `triggers` fails validation (`start` required).
- Even if it parsed, the compiler and indexer read `manifest.start` directly: `compile.ts:92` (`start: manifest.start`) and `apply-index.ts:83,86` (`flow.manifest.start`, `flow.manifest.start.requires_view`) — the latter would throw on `undefined`.

**Impact:** The tutorial's very first `mrmr space apply` (P3/P4) fails at manifest validation. **None of the 11 plans mention `triggers` vs `start`.** `flow-branch-api-simplify` covers *branch* routing and `role`, not the top-level trigger field. This is a first-order gap in plan coverage, not just an implementation detail.

**Secondary conflict:** shipped `start.requires_view` is a **flow-level** required view; the tutorial's model is "views attach to steps via `presentation.view`, never to triggers" (`02` §Triggers). The relocation/deprecation of `requires_view` is also unowned.

**Decision needed:** rename `start`→`triggers` (breaking, needs migration/dual-read) **or** alias `triggers` as canonical with `start` deprecated. Add a plan or fold into `flow-branch-api-simplify` scope.

---

#### C-2 — File-only intake resolve fails today; the fix's contract is still Phase-0 open. [CONFIRMED]

The tutorial's `intake.continue` is `schema.required:[spec]` + `artifact_slots.spec`, submitted with **empty payload**. Shipped resolve validates `required` against **payload only**:

```63:75:packages/hub-core/src/flow-engine/step-resolve.ts
function validatePayloadSchema(
  schema: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): string | null {
  if (!schema || schema.type !== "object") return null;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    if (payload[key] === undefined || payload[key] === null) {
      return `Missing required field '${key}' in resolve payload`;
    }
  }
  return null;
}
```

So `continue` resolve returns **400 `INVALID_PAYLOAD` "Missing required field 'spec'"** even when the file is uploaded — the tutorial's P4 "Submit → success" cannot happen. Owned by `branch-schema-artifact-validation` (Slice 2), which is correct in principle. **But that plan's Phase 0 (questions 1–5) is unresolved** — including whether artifact slots need `properties.spec` JSON-Schema entries and per-branch vs step-level catalog slots. The catalog today merges `artifact_slots` at **step level** across branches (`step-contract-compile.ts:434-437`), so per-branch enforcement (needed for mixed `reviewer`+`spec` cases) does not yet exist. Implementable, but not yet fully specified.

---

#### C-3 — Handler dispatch cannot see the tutorial's handlers. [CONFIRMED]

Two independent shipped constraints break P5/P6 handlers:

1. `on` only accepts the literal strings `step.opened`/`step.resolved` or an event object — **not** `step.opened::my-dev-flow.write_spec`:

```13:18:packages/contracts/src/entities/handler.ts
export const HandlerOnSchema = z.union([
  HandlerLifecycleOnSchema,
  z.object({ event: HandlerEventFilterSchema }),
]);
```

`HandlersFileSchema.safeParse` therefore rejects `write_spec_copy` and `cleanup_archive_commit` (which use `on: step.opened::…` and **omit** `contract_keys`).

2. Even with a legal `on`, dispatch is indexed purely by `contract_keys`:

```44:62:packages/hub-core/src/index/parse-handlers.ts
export function buildHandlerIndex(file: HandlersFile): HandlerIndex {
  ...
  for (const handler of file.handlers) {
    for (const key of handler.contract_keys ?? []) {
      if (isLifecycleOn(handler.on, "step.opened")) addByKey(step_opened_by_key, key, handler);
      ...
```

A handler with empty `contract_keys` is never indexed → never dispatched. The tutorial's `write_spec_copy`/`cleanup_archive_commit` carry no `contract_keys`, so they would silently never run.

Owned by `handler-authoring-simplify` (`on::key` parsing + `contract_keys` prompt-only). **Status: Phase 0 research, not started.** Directionally sound and implementable, but the tutorial (P5) already documents the *target* shape as if shipped.

---

#### C-4 — Steps without `branches` are dropped from the catalog. [CONFIRMED]

`write_spec` and `cleanup` are authored with `id`+`description` only. Two shipped facts break this:

- `StepContractManifestStepSchema.branches` is **required** (`step-contract.ts:75`). (Top-level `FlowStepSchema.branches` is optional at `manifest.ts:95`, so a bare step parses at the manifest level, but nested steps do not.)
- More decisively, `compileStepContractCatalog` filters to steps that *have* branches, so a branchless step never becomes a catalog entry and never opens:

```89:91:packages/hub-core/src/flow-engine/step-contract-compile.ts
export function isStepContractStep(step: FlowStep | StepContractManifestStep): boolean {
  return Boolean(step.branches && Object.keys(step.branches).length > 0);
}
```

```456:463:packages/hub-core/src/flow-engine/step-contract-compile.ts
  const contractSteps = manifest.steps.filter(isStepContractStep) as StepContractManifestStep[];
  ...
  flattenManifestSteps(contractSteps, null, null, flat);
```

Owned by `step-default-branches` (inject `completed`/`failed`; compute `completed.next` from array order). Well-scoped and implementable. **Note:** the downstream auto-resolve path already expects an injected `completed` branch and role=`agent`:

```708:711:packages/hub-core/src/flow-engine/step-resolve.ts
  if (input.complete_mode !== "auto") return false;
  const entry = catalogEntryForStep(input.catalog, input.step_id);
  if (!entry || entry.role !== "agent" || entry.presentation?.view) return false;
  if (!entry.branches.completed) return false;
```

`deriveRole` returns `agent` when there's no view/handler hint (`step-contract-compile.ts:124-130`), so a shell `write_spec` correctly qualifies for auto-resolve *once default branches inject `completed`*. The three fixes (C-3 dispatch, C-4 default branches, this auto-resolve) form a **hard dependency chain**: none of P5/P6 works unless all three land.

---

#### C-5 — Command injection via `{{…}}` interpolation into `shell: true`. [CONFIRMED — security]

The tutorial's own P6 handler is:

```yaml
command: |
  ...
  git commit -m "{{steps.build.output.commit_message}}" -m "{{steps.build.output.description}}"
```

`commit_message`/`description` are **agent-produced** resolve-payload values. Template substitution is plain `String(value)` with **no shell escaping**:

```36:43:packages/hub-core/src/flow-engine/templates.ts
  out = out.replace(STEPS_OUTPUT_PATTERN, (_, stepId: string, field?: string) => {
    ...
    const value = readPath(output, field);
    return value === undefined || value === null ? "" : String(value);
  });
```

…and the executor runs the resolved string with a shell:

```235:237:packages/executors/src/shell-spawn.ts
    const child = spawnFn(command, {
      ...
      shell: true,
```

An agent that emits `commit_message: '"; rm -rf ~ #'` (maliciously or by hallucination) executes arbitrary shell in the linked repo. The `{{prompt}}` path is delivered via stdin (safer — `shell-spawn.ts:60-61`), but `{{steps.*.output.*}}` and `{{murrmure.step.*.artifact.*.path}}` are not. **No plan addresses shell-token escaping**, and `handler-authoring-simplify` Q5 ("multiline `command:` → `bash -lc` joined script") would *widen* the surface. Given the north-star "spaces own execution" stance this is partly space responsibility, but the platform ships the vulnerable pattern **as the canonical tutorial**. Must be addressed (escape interpolated values, or document argv-array handlers, or sandbox) before promoting the tutorial as the reference.

---

### HIGH

#### H-1 — Tutorial's happy-path agent cannot resolve: wizard grant omits `step:resolve`. [CONFIRMED]

`murrmure_resolve_step` requires `step:resolve`:

```35:35:packages/hub-daemon/src/mcp-tool-registry.ts
  { name: "murrmure_resolve_step", required_scope: "step:resolve", ... },
```

(HTTP route enforces the same: `resolve-step.ts:21` `requireCapability(auth,"step:resolve",…)`.) But the setup-wizard default grant does **not** include it:

```1:11:packages/cli/src/wizard/capabilities.ts
export const AGENT_GRANT_CAPABILITIES = [
  "space:read", "flow:run", "flow:read", "action:invoke", "gate:resolve", "journal:read",
] as const;
```

The tutorial states agent setup is "wizard-only on the happy path" (P1 Grant step). So an agent connected exactly as the tutorial instructs **cannot resolve `build`** (P5) — the run stalls. Owned by `agent-grant-onboarding` (audit item 0.3.1, GO-4) — but that plan is **Phase 0 research, not started**, and GO-4 is contingent on an audit rather than a committed fix. This is a one-line default change with product/security implications (least privilege) that should be fast-tracked. Also note P5's flow is handler-dispatched, so `action:invoke` may be *unnecessary* for the tutorial agent — the default set is simultaneously missing `step:resolve` and possibly over-broad.

#### H-2 — `branch-schema-artifact-validation` and `view-sdk-contracts-and-upload` overlap and can collide. [CONFIRMED]

Both plans edit the same surfaces for the same end (branch contract in view context):

| Surface | branch-schema (Slice 3) | view-sdk (Slices 1–3) |
|---------|--------------------------|------------------------|
| `active_human_step.branches` | "Denormalize branch contracts into run `active_human_step`" | Slice 1: "Extend `ActiveHumanStep` with `branches`" |
| `buildViewAppContext` | "passes `step.branches`" | Slice 2: same |
| `mapViewSubmitToResolveStep` | "align … include `artifacts_out`" | Slice 2: "forwards artifacts" |
| `ViewStepContext.branches` type | defines it | defines it (richer, with `required` derived) |
| dev fixtures `step.branches` | Slice 3 | Slice 2/4 |

Two different `ViewBranchContract` shapes are proposed (branch-schema omits the derived `required` flag; view-sdk includes it). Without a single owner, these produce merge conflicts and divergent context types. **Recommendation:** collapse the shared SDK/shell/context work into one plan (view-sdk owns SDK + shell context + `active_human_step`), and let branch-schema own **only** hub-core compile + resolve enforcement (Slices 1–2). Make view-sdk depend on branch-schema Slice 1 (per-branch catalog slots) explicitly.

#### H-3 — `step-default-branches` may be invalidated by its own parent research plan. [CONFIRMED sequencing risk]

`step-default-branches` is billed as "a concrete slice that can land first" of `flow-branch-api-simplify`. But `flow-branch-api-simplify` Phase 0 is explicitly considering **renaming/replacing** `next`/`fail_run`/`continue`/`cancel` (Options A–D) and deciding whether `next:null` survives. If defaults ship first (`completed.next` from order, `failed.fail_run`) and the parent research later chooses `then:`/`outcome:` vocabulary, the compiler's default-injection and the tutorial's authored branches churn twice, and the tutorial must be rewritten again. **Either** freeze the branch vocabulary decision (`flow-branch-api-simplify` Phase 0 exit) **before** shipping defaults, **or** explicitly accept the double-migration and record it.

#### H-4 — No executable coverage of the v3 tutorial. [CONFIRMED]

`my-dev-flow` / `spec-intake` appear only in tutorial docs and plan prose — no `test-utils/` space, no CLI/e2e test builds or runs this flow (grep across repo returns only docs + plans). The pre-existing `preview-review-v2` example has a test (`packages/cli/test/preview-review-v2-example.test.ts`), so the pattern exists. Without a `my-dev-flow` fixture + apply/run test, "the tutorial is the target" has no enforcement, and doc-sync (workspace rule) cannot detect drift between the six chapters and shipping behavior. This should be a required done-gate for the program, not an afterthought.

#### H-5 — Normative `current/` disagrees with code (and the tutorial) on run scratch paths. [CONFIRMED]

Bridges still say `.mrmr.temp/runs/…`:

```87:88:studio-specs/current/bridges/artifacts.md
.mrmr.temp/runs/{run_id}/steps/{qualified}/work/     # scratch
.mrmr.temp/runs/{run_id}/steps/{qualified}/{slot}/   # stable after resolve
```

Shipped code and the tutorial (P4) use `.mrmr/dev/runs/…`. Per the doc-sync rule, `current/` wins for shipped behavior — but here `current/` is *stale*, not authoritative. `run-scratch-path-normalize` (Phase 0 decision, Option A = align spec→code) is the right fix and matches the tutorial. Until it lands, the tutorial technically contradicts a normative bridge. Low implementation risk; needs the ADR/decision recorded so the tutorial's single-path claim is defensible.

---

### MEDIUM

#### M-1 — Two token namespaces for "prior-step data" are author-facing and inconsistent. [CONFIRMED]
The tutorial uses `{{murrmure.step.intake.artifact.spec.path}}` (P5) and `{{steps.build.output.commit_message}}` (P6). Both are supported by `templates.ts` (`MURRMURE_STEP_ARTIFACT_PATTERN` and `STEPS_OUTPUT_PATTERN`), so this is **not** a functional defect. But it is a learnability defect: two prefixes (`murrmure.step.*` vs `steps.*`) for conceptually identical "read something an earlier step produced." Compile-time lint only validates `{{murrmure.*}}` tokens (`step-contract-compile.ts:228-259`), so a typo'd `{{steps.buld.output.x}}` silently expands to empty string with no warning. No plan addresses token-namespace unification or `{{steps.*}}` lint coverage.

#### M-2 — `agent-prompt-protocol-simplify` acceptance is a brittle golden-string match. [CONFIRMED]
APP-4 requires the live prompt to match the P5 "Extract" verbatim (down to `run_id: "run_01J8K2M4N6P0Q2R4"`). Whitespace/ordering drift will make the tutorial-as-fixture assertion flaky. Recommend asserting structure (each branch has a full `murrmure_resolve_step` call; no `## Session`/`## MCP tools`/`## Resolve API`; Discovery only when `contract_keys.length>1`) rather than byte-exact text. The plan itself does not specify how the fixture tolerates the live `run_id`.

#### M-3 — `hub-clean-slate-boot` is broad and lightly connected to the tutorial. [CONFIRMED scope]
It *supports* P1 ("choose No example flow; space appears empty") and the north-star "hub up, zero contracts" first boot — good. But CS-1..CS-9 (remove seed pin, `PACKAGE_CATALOG`, move fixtures, CI guards, spec edits) is a large blast radius that touches many tests and Desktop packaging, with only an indirect tutorial payoff. It should be sequenced *independently* of the tutorial-critical chain (C-1..C-4, H-1) so it doesn't gate the tutorial, and its CS-7 stub audit (bootstrap-token coupling) should not block CS-1..CS-4.

#### M-4 — `desktop-mcp-bridge-exposure` is verification, but its gaps are real prerequisites. [CONFIRMED as plan-typed]
The plan is "verify & close gaps," and the code anchors it claims exist do exist (`resolveMcpBridgeCommand` in `space-doctor-mcp.ts`, ViewDev route `ViewDevPage.tsx`, `view dev`/`space view init` CLI commands all present). But P1's "no npm install" promise rests on MB-1..MB-7 actually passing on a packaged build — the plan's own open questions (dev vs packaged parity, macOS bundle path stability) are unverified. Treat as a real gate for P1, not a formality.

#### M-5 — `2026-07-13` shell plan depends on unshipped branch semantics. [CONFIRMED]
Slice 4 (branch fan-out, gate shape, fail terminal) and Slice 5 (step-meta: branches/contracts/handlers) assume: (a) default `completed`/`failed` render identically to explicit (depends on `step-default-branches`), (b) handler→step resolution server-side (depends on `handler-authoring-simplify`'s `on::key`, since matching by `on::key` vs `contract_keys` changes the resolver), and (c) per-branch contract shape (depends on the view-sdk/branch-schema contract). It correctly lists these as "Related," but its Phase-0 decisions (esp. #8 live-run parity) and done-gates should be **blocked** on those plans, else the visualization renders a branch model that later changes. Also `buildFlowPreviewGraph()` does not exist yet (`graph.ts` has only `buildRunGraph`/`buildStepContractRunGraph`), so Slice 3 is net-new, not a refactor.

#### M-6 — Scaffold/SDK default shape vs tutorial "replace App.tsx". [HYPOTHESIS]
P3 says `mrmr space view init` scaffolds a view, then the author *replaces* `src/App.tsx` with `useViewContract`/`submitBranch` code. The shipped SDK exports `useViewSubmit`/`useViewContext` (`view-sdk/src/app/index.ts`), not `useViewContract`/`submitBranch`/`isViewContractError`. If the scaffold template ships the old API while the tutorial pastes the new one, `npm run build` fails until view-sdk Slice 3 lands *and* the template is updated (view-sdk Slice 4 covers the template + fixtures). Ensure template + SDK + tutorial ship atomically; otherwise P3 Step 5 (`npm run build`) breaks.

---

### LOW / OBSERVATIONS

- **L-1 [CONFIRMED]** `deriveRole` already derives `human` from `presentation.view` (`step-contract-compile.ts:124-130`). `flow-branch-api-simplify` B-3 ("`role` redundancy") and `step-default-branches` ("`role: human` derived") are **partly already done** — the research should acknowledge current behavior to avoid re-litigating a solved point. The remaining question is only whether explicit `role:` in YAML should be *rejected* vs *tolerated*.
- **L-2 [CONFIRMED]** `space-home.ts` confirms the `2026-07-13` current-state claims: `your_flows` (`:127-129`) and `available_to_run` (`:131-133`) overlap; `recent_completed.splice(20)` (`:194`) caps server-side with no scroll. Plan's problem statement is accurate.
- **L-3 [QUESTION]** The tutorial's `intake` keeps `continue`/`cancel`, while linear steps use injected `completed`/`failed`. This is intentional (`step-default-branches` non-goal: no rename of human branches), but it means authors see *two* branch vocabularies in one manifest. Confirm this is the desired end state vs a stopgap that `flow-branch-api-simplify` will unify.
- **L-4 [OBSERVATION]** `mcp_bridge`/grant/desktop plans are largely orthogonal to the flow-engine chain and can proceed in parallel with their own owners.

---

## 4. Coverage / gap matrix (tutorial behavior → owning plan → status)

| Tutorial behavior | Owning plan(s) | Plan status | Implementable? | Gap / risk |
|-------------------|----------------|-------------|----------------|------------|
| `triggers:{manual:true}` accepted | **none** | — | n/a | **C-1 uncovered gap** |
| Empty space on first boot | hub-clean-slate-boot | not started | Yes | M-3 broad scope |
| Wizard-only agent connect | agent-grant-onboarding | Phase 0 not started | Yes | H-1 `step:resolve` |
| Bundled MCP bridge, no npm | desktop-mcp-bridge-exposure | verify | Likely | M-4 unverified on packaged build |
| Linear steps `id`+`description` only | step-default-branches | not started | Yes | H-3 vocab churn |
| Default `completed`/`failed` routing | step-default-branches | not started | Yes | depends on flow-branch decision |
| `intake` file-only `required:[spec]` | branch-schema-artifact-validation | not started (Phase 0 open) | Yes | C-2 per-branch slots + Phase 0 |
| View `useViewContract`/`submitBranch` | view-sdk-contracts-and-upload | not started | Yes | H-2 overlap; M-6 template atomicity |
| `context.step.branches` populated | view-sdk **and** branch-schema | not started | Yes | **H-2 overlap** |
| Resolve file-only succeeds | branch-schema-artifact-validation | not started | Yes | C-2 |
| Artifact under `.mrmr/dev/runs/…` | run-scratch-path-normalize | Phase 0 decision | Yes | H-5 spec drift |
| Handler `on: step.opened::flow.step` | handler-authoring-simplify | Phase 0 not started | Yes | C-3 |
| `contract_keys` prompt-only | handler-authoring-simplify | Phase 0 not started | Yes | C-3 |
| `complete: auto` shell resolve | (shipped) + step-default-branches | partial | Yes | needs injected `completed` (C-4) |
| Slim agent prompt / per-branch resolve | agent-prompt-protocol-simplify | not started | Yes | M-2 golden-string |
| `{{steps.build.output.*}}` in cleanup | (shipped templates) | shipped | Yes | **C-5 injection**; M-1 namespace |
| Desktop flowchart + Run in header | 2026-07-13 shell plan | not started | Yes | M-5 depends on branch/handler plans |

---

## 5. Unresolved decisions / questions to close before implementation

1. **Trigger field (C-1):** rename `start`→`triggers`, or alias `triggers` as canonical with `start` deprecated? Migration/dual-read? Where does `requires_view` go (flow-level dies; steps use `presentation.view`)? — *no current owner.*
2. **View/branch ownership (H-2):** single boundary — hub-core (compile+resolve) vs SDK/shell (context+upload+validation). One `ViewBranchContract` shape.
3. **Branch vocabulary freeze (H-3/L-3):** ratify `flow-branch-api-simplify` Phase 0 (keep `next`/`fail_run` or move to `then:`/`outcome:`) **before** `step-default-branches` compiler work, or accept double migration. Decide final state of `continue`/`cancel` on human steps.
4. **Default capabilities (H-1):** add `step:resolve`; audit whether `action:invoke` is needed for the handler-dispatched tutorial; least-privilege default set; where defaults live (mint vs space record vs auto-mint).
5. **Artifact-slot contract (C-2):** per-branch catalog slots; do slots need `properties.*` entries; optional-slot convention; agent `artifacts_out` parity with view path (branch-schema Phase 0 Q1–5).
6. **Run-scratch canonical path (H-5):** Option A (`.mrmr/dev/runs`) confirmed and back-ported into `current/bridges/*` and `philosophy.md`.
7. **Shell interpolation safety (C-5):** escape `{{…}}` values before shell substitution, or provide argv-array handler type, or sandbox; reconcile with `bash -lc` proposal.
8. **Live-run parity (M-5):** does branch/gate/fail visualization apply to `buildRunGraph` too, and on what schedule.
9. **Tutorial fixture (H-4):** commit a `test-utils/spaces/my-dev-flow` + apply/run test as the program's acceptance gate.

---

## 6. Risk register

| ID | Risk | Severity | Likelihood | Mitigation |
|----|------|----------|------------|------------|
| R-1 | Trigger field gap means the tutorial never applies; discovered late | Critical | High (currently true) | Add owned plan/decision (C-1) *first*; add fixture apply test |
| R-2 | Two view/branch plans collide on shared files | High | High if uncoordinated | Merge ownership (H-2); land branch-schema Slice1 before view-sdk |
| R-3 | Default branches ship, then branch vocab changes → double migration + tutorial rewrite | High | Medium | Freeze Phase-0 vocab (H-3) before compiler work |
| R-4 | Agent stalls on `build` (no `step:resolve`) after users follow tutorial exactly | High | High | Fast-track H-1 default-cap fix + doctor warning |
| R-5 | Shell injection via agent-authored commit message | High | Medium | Escape interpolation / argv handlers (C-5) before promoting tutorial |
| R-6 | Tutorial docs describe unratified APIs (all 3 research plans) → doc-sync rule violated now | Medium | High (currently true) | Mark chapters as "target/preview" until plans land, or gate doc merge on plan ratification |
| R-7 | `hub-clean-slate-boot` breaks existing tests / Desktop packaging | Medium | Medium | Sequence independently; test-helper pin (`pinLinearDemoContract`); CI guard |
| R-8 | Golden-string prompt fixture flaky | Low | Medium | Structural assertions (M-2) |
| R-9 | Scaffold template ships old SDK API → P3 build fails | Medium | Medium | Ship SDK + template + tutorial atomically (M-6) |
| R-10 | Shell viz renders a branch model that later changes | Medium | Medium | Block 2026-07-13 Slices 4–5 on default-branches + handler plans |
| R-11 | Normative `current/` stays stale on scratch path | Low | Medium | Land run-scratch ADR + back-port bridges (H-5) |

---

## 7. Recommended sequencing & done-gates (dependency-aware; tutorial preserved as target)

**Wave 0 — Decisions (blocking, no code):**
- D0.1 Resolve **C-1 trigger field** (assign owner; pick alias vs rename). *Gate:* decision recorded; schema/compile plan drafted.
- D0.2 Ratify **branch vocabulary** (`flow-branch-api-simplify` Phase 0 exit). *Gate:* `next`/`fail_run` kept or replacement chosen.
- D0.3 Deconflict **view/branch ownership** (H-2). *Gate:* one plan owns SDK+shell+context; one owns hub compile+resolve; one `ViewBranchContract`.
- D0.4 **Default capabilities** decision incl. `step:resolve` (H-1) and **run-scratch path** Option A (H-5). *Gate:* ADR/decision notes committed.
- D0.5 **Shell interpolation safety** decision (C-5). *Gate:* escaping/argv approach chosen.

**Wave 1 — Flow-engine core (unblocks P2/P5/P6 skeleton):**
1. Trigger field acceptance (C-1) — *gate:* tutorial manifest parses + applies.
2. `step-default-branches` (C-4) — *gate:* `write_spec`/`cleanup` compile with injected `completed`/`failed`; DB-1..DB-6.
3. `handler-authoring-simplify` `on::key` + dispatch + `contract_keys` prompt-only (C-3) — *gate:* HA-1..HA-7; tutorial handlers pass strict apply.
4. Verify auto-resolve chain end-to-end for `write_spec` (shell `complete:auto`).

**Wave 2 — Human intake (unblocks P3/P4):**
5. `branch-schema-artifact-validation` Slices 1–2 (per-branch catalog slots + resolve partition) (C-2) — *gate:* file-only resolve succeeds; mixed payload+file works.
6. `view-sdk-contracts-and-upload` Slices 1–3 + template (H-2/M-6) — *gate:* `submitBranch("continue",{files:{spec}})` with inline error; context.branches populated; template matches tutorial; `npm run build` green.

**Wave 3 — Agent build (unblocks P5 agent step):**
7. Default-capabilities fix incl. `step:resolve` (H-1) — *gate:* wizard-connected agent resolves `build`.
8. `agent-prompt-protocol-simplify` (M-2, structural assertions) — *gate:* APP-1..APP-4.

**Wave 4 — Polish / parallel tracks (non-blocking):**
9. `run-scratch-path-normalize` back-port to `current/` (H-5).
10. `hub-clean-slate-boot` (independent track, M-3).
11. `desktop-mcp-bridge-exposure` verify on packaged build (M-4).
12. `2026-07-13` shell viz (M-5) after Waves 1–2.

**Program-level done-gate (H-4):** a committed `test-utils/spaces/my-dev-flow` fixture whose apply + two-run scenario (Cancel→failed, Submit→…→cleanup) passes in CI, plus `docs-proof` coverage tying the six chapters to that fixture.

---

## 8. Highest-priority blockers (fix/decide first)

1. **C-1 — `triggers:` vs required `start:`.** Uncovered by any plan; blocks the tutorial's first `apply`. Assign an owner and a schema/migration decision *now*.
2. **H-2 — deconflict `branch-schema-artifact-validation` and `view-sdk-contracts-and-upload`.** They edit the same files toward the same goal; land order and ownership must be fixed before either starts.
3. **C-2 + C-3 + C-4 dependency chain.** File-only resolve, `on::key` dispatch, and default branches must all land (with the auto-resolve chain verified) or Parts 4–6 cannot run.
4. **H-1 — add `step:resolve` to default grant.** One-line fix with security review; without it the tutorial-connected agent stalls at `build`.
5. **C-5 — shell interpolation injection.** Decide escaping/argv strategy before promoting the tutorial's `git commit` handler as the reference pattern.
6. **H-3 — freeze branch vocabulary before compiling defaults**, to avoid a second tutorial rewrite.
7. **H-4 — add an executable `my-dev-flow` fixture** as the acceptance gate that makes "the tutorial is the target" enforceable.
