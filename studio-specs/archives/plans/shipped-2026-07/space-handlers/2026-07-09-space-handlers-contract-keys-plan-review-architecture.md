# Plan review — Architecture & north star

**Reviewer:** architecture
**Plan:** 2026-07-09-space-handlers-contract-keys-plan.md
**Date:** 2026-07-09
**Verdict:** PASS WITH AMENDMENTS

## Executive summary

The plan is architecturally sound and, on its central move, strongly advances the north star: it deletes `executor.action` from flow manifests and replaces it with space-owned **handlers keyed by `contract_keys`**. That single change is the most north-star-aligned decision in the document — it removes a deployment/execution contract (`executor.action`) that today sits inside the portable protocol graph (`packages/hub-core/src/flow-engine/step-open.ts:103`), and it is exactly what "the same flow may run in different spaces with different execution policies; binding is explicit, not baked into the flow" (north star §4.3) demands. Briefing removal, the unified `.mrmr/` tree, the merged `space.yaml` link, and the `on: step.opened | step.resolved | event:` unification of the two dispatch paths (H-1/H-4) are all correct and reduce, not grow, kernel surface.

I am **not** failing the plan because none of its choices *block* federation — the direction is federation-native. But five issues must be amended before implementation:

1. **Missing touch points in `@murrmure/contracts`.** `executor` is compiled into `StepContractCatalogEntry` and the flow manifest schema. The code map lists none of the contracts-package files, so the "remove executor" work is under-scoped and its blast radius is hidden.
2. **`flow_name` as the contract-key namespace is a federation collision risk.** Keys are declared as `{flow_name}.{qualified_step_id}` off a human-chosen `name:`, not a stable `flow_id` or `graph_digest`. Two catalogs with a `preview-review` flow collide; this undercuts the very cross-space portability the plan is built for.
3. **Over-scoped codegen.** Emitting `catalog.json` + `contract-keys.json` + `handlers.schema.json` + `murrmure-contracts.d.ts` on every apply commits the kernel to TypeScript-specific and JSON-Schema artifacts. `.d.ts` privileges one harness/language and edges toward "agent-runtime platform" tooling (north star §8.2). Ship `contract-keys.json` first; defer the rest.
4. **Multi-phase dual dispatch path.** Handlers dual-read alongside `actions.yaml`/`executors.yaml`/`hooks.yaml` from Phase 2 through Phase 5. There are no external consumers of a v1 pre-release, so this dual path buys nothing and violates the "no dual-path migrations lasting multiple phases" bar. Collapse into the `HANDLER-CUTOVER` PR.
5. **`MURRMURE_HUB_TOKEN` injected into shell env is an unspecified security + federation surface.** New for `complete: cli`, but token scope, lifetime, and *which hub* (local vs remote orchestrator) are undefined.

Fix these and the verdict is a clean PASS.

---

## North star compliance matrix

| North star section / rule | Plan section | Compliant? | Notes |
|---|---|---|---|
| §1.2 coordination layer, not how teams run agents | H-1/H-2 collapse; handlers own execution | ✅ | Removes execution contract from protocol graph |
| §1.3 unopinionated about implementation (prompts, setup) | Handler `prompt`/`command` space-owned; briefing removed | ✅ | Hub renders space-owned templates only |
| §2.1 event-based orchestration kernel | `on: step.opened / step.resolved / event:` | ✅ | Unifies step lifecycle + custom events into one matcher |
| §2.2 not a workflow runtime / agent framework | `complete` modes, `mrmr step resolve`, codegen | ⚠️ | Mostly kernel-appropriate; `.d.ts`/JSON-Schema codegen drifts toward framework tooling |
| §2.4 does not define agents; harness-agnostic | Handlers hold `command`, not agent config | ✅ | `cursor agent …` is space-authored, not hub-owned |
| §3.1 core is event-driven (journal events) | `mrmr.step.opened/resolved`, `kill_on` | ✅ | Matches existing journal model (`JOURNAL_EVENT_TYPES.STEP_OPENED`) |
| §3.3 any authorized client may participate | MCP `resolve_step` + new `mrmr step resolve` CLI | ✅ | Both hit same HTTP resolve — no divergent path |
| §3.4 triggers first-class | Event handlers (`brief.requested`) via same file | ✅ | Folds hooks into handlers |
| §4.1 flows/views portable without per-target forks | `.mrmr/flows/`, `.mrmr/views/`, bindings | ✅ | Content vs execution split is explicit |
| §4.2 contracts describe work, not local execution | Flow = graph only; no action names | ✅ | Core win of the plan |
| §4.3 same flow, different spaces, explicit binding | `contract_keys` + execution policy table | ✅ | Per-step vs subgraph-owner from one manifest |
| §4.4 cross-repo/machine/team from day one | `link.host`, `.mrmr/dev/` gitignore, `target_space` deferred | ⚠️ | `flow_name` namespace + run-scoped transfers weaken cross-team correlation (see federation section) |
| §5.1 Murrmure owns the wire | Hub: lifecycle, match, resolve API | ✅ | |
| §5.2 flows own orchestration shape | Manifest v3 graph-only | ✅ | |
| §5.3 views own presentation | Human steps → `presentation.view` retained | ✅ | No regression |
| §5.4 spaces own execution | Handlers + `complete` modes | ✅ | "Who resolves" is space policy — correct layer |
| §6 human experience via custom views | Human steps unchanged; resolve via view submit | ✅ | Plan does not touch view primacy |
| §7 observability | `list_handlers`, coverage, `space_health`, codegen | ✅ | Author + agent observability both covered |
| §8.1 no space-specific execution in portable flows | Deprecation table removes `executor`/`invoke`/`gate` | ✅ | Directly enforced with CI bans |
| §8.2 do not grow into agent-runtime/business-logic platform | Codegen (`.d.ts`), bindings sources (`npm:`), scaffold | ⚠️ | Trim speculative surface (see simplicity audit) |
| §8.4 don't optimize for single-repo/machine | Phase 1 "hard cutover in monorepo"; dual-read Phase 2–5 | ⚠️ | Acceptable because target repo is the monorepo itself, but dual path is inconsistent with the hard-cutover posture |
| §8.6 do not assume single client/trigger path | `remote_hub` type, `target_space` deferred | ✅ | Placeholders kept, not built |

Two items sit at ⚠️ that touch §4.4 (federation) and §8.2 (platform creep) — these drive the amendments, not a FAIL, because the *default* path stays kernel-shaped.

---

## Layer boundary audit

Flow vs hub vs handler vs view boundaries are respected. Verified against the actual engine:

- **Handler matching → hub-core flow-engine.** Correct. Dispatch decisions live today in `packages/hub-core/src/flow-engine/step-open.ts` (the `input.entry.executor?.action` branch at `:103`). Replacing that branch with a `contract_keys` match keeps the decision in the kernel where lifecycle already lives. ✅
- **Prompt assembly → `packages/executors/src/invoke-shell-prompt.ts`.** Correct layer. Scope-slice + active-slice assembly extends `assembleStructuredAgentPrompt` / `resolveInvokePrompt` (already the seam that injects the contract markdown). The briefing block to delete is literally there (`invoke-shell-prompt.ts:176-190`). ✅
- **`mrmr step resolve` → `packages/cli`.** Correct. It wraps the existing `POST …/resolve` that backs `murrmure_resolve_step` (`packages/hub-daemon/src/mcp-handlers.ts:163`). CLI and MCP converging on one HTTP endpoint is the right non-divergent design. ✅
- **Handler `complete` policy → handler file, engine honors it.** Correct: "who resolves after dispatch" is space execution policy (§5.4), and the engine's auto-resolve seam already exists (`maybeAutoResolveExecutorStepAfterAction`, `packages/hub-core/src/flow-engine/step-resolve.ts:631`). Driving it from handler `complete: auto` instead of catalog `executor.action` is a clean substitution. ✅

**One layer concern:** the plan puts contract **codegen** in `packages/hub-core/src/contracts/codegen.ts` (kernel package) while its output is an author-time, filesystem-emitted, partly language-specific artifact set. The *catalog compile* belongs in hub-core (it already lives near `step-contract-compile.ts`), but *file emission* and `.d.ts`/JSON-Schema generation are CLI/authoring concerns. The plan already has an apply-side hook (`packages/cli/src/commands/space/apply.ts`) and an offline `space contracts` command — emission should live there, with hub-core exposing only the compiled catalog. Keep the kernel free of TS-string-literal generation.

No view-layer violation: human steps keep `presentation.view`; nothing pushes orchestration into views.

---

## Architectural touch point audit

### Code map verification (exists? right layer?)

Existing files referenced by the plan — all verified present and at the right layer:

| Plan reference | File | Exists | Layer OK |
|---|---|---|---|
| Step open dispatch | `packages/hub-core/src/flow-engine/step-open.ts` | ✅ | hub-core ✅ |
| Auto-resolve | `packages/hub-core/src/flow-engine/step-resolve.ts` (`maybeAutoResolveExecutorStepAfterAction:631`) | ✅ | hub-core ✅ |
| Prompt assembly | `packages/executors/src/invoke-shell-prompt.ts` | ✅ | executors ✅ |
| Shell env token | `packages/executors/src/shell-spawn.ts` | ✅ | executors ✅ |
| Run paths | `packages/hub-core/src/flow-engine/step-contract-slice.ts` | ✅ | hub-core ✅ |
| Delete briefing | `packages/hub-core/src/flow-engine/space-briefing.ts` | ✅ | hub-core ✅ |
| Space link | `packages/cli/src/lib/space-link-file.ts` | ✅ | cli ✅ |
| Wake relay | `packages/mcp-bridge/src/wake-relay.ts` | ✅ | mcp-bridge ✅ |
| Skill install | `packages/cli/src/skill/install.ts` | ✅ | cli ✅ |
| Space doctor | `packages/cli/src/lib/space-doctor.ts` | ✅ | cli ✅ |
| Apply hook | `packages/cli/src/commands/space/apply.ts` | ✅ | cli ✅ |
| MCP (`list_handlers`) | `packages/hub-daemon/src/mcp-handlers.ts` (`list_step_contracts:253`, `resolve_step:163`) | ✅ | hub-daemon ✅ |

New files (`parse-handlers.ts`, `parse-bindings.ts`, `handler-catalog-lint.ts`, `contracts/codegen.ts`, `step-resolve.ts` CLI, `space-doctor-skills.ts`, scaffold/contracts commands) land in sensible packages. `hub-core/src/contracts/` does not exist yet — fine as a new dir, subject to the emission-vs-compile split above.

### Missing touch points

These are load-bearing for the cutover and are **absent from the code map**:

1. **`packages/contracts/src/flow/manifest.ts`** — the flow manifest schema. Removing `executor:` / `invoke:` / `gate:` and adding explicit `role:` (manifest v3) is a schema change here. Not listed.
2. **`packages/contracts/src/entities/step-contract.ts`** — `StepContractCatalogEntry` carries `executor` (used at `step-open.ts:103`, `step-resolve.ts:492`, `step-catalog.ts:54,63`). The catalog shape must change; the plan treats "no action names" as a manifest-only edit but it propagates into the compiled catalog type.
3. **`packages/hub-core/src/flow-engine/step-contract-compile.ts`** — compiles manifest → catalog and today embeds `executor`. Must stop embedding it. Not listed.
4. **`packages/hub-core/src/flow-engine/step-catalog.ts`** — `shouldAutoResolveExecutorStep` (`:58`) and `requiresExplicitResolve` (`:48`) key off `entry.executor?.action`. These are the exact functions Phase 3's `complete` wiring replaces; they belong in the code map.
5. **`packages/hub-core/src/hooks/dispatch.ts`** and **`packages/hub-daemon/src/hook-dispatch.ts`** — the code map lists only `hooks/matcher.ts` for "hook migration," but dispatch of matched hooks lives in these two files. Folding `hooks.yaml` into handler `on.event` touches all three.
6. **Legacy parsers to retire** — `parse-actions.ts`, `parse-executors.ts`, `parse-hooks.ts`, and the `hooks-alias.ts` shim exist under `packages/hub-core/src/index/`. Phases 2/5 reference "deprecate/delete parsers" in prose but the code map omits them, hiding the deletion surface.
7. **`resolveMurrmureRoot` / space-directory resolution** — Phase 1 mentions it; `packages/cli/src/lib/space-directory.ts` (and callers) resolve `murrmure/` today and must learn `.mrmr/`. Not in the code map.

### Touch points that should NOT be changed

- **`packages/hub-daemon/src/mcp-handlers.ts` `resolve_step` (`:163`)** — do not fork resolve logic for the CLI. `mrmr step resolve` must call the same HTTP route. The plan says this; keep it.
- **View / gate resolution path** — human steps already resolve via `resolveFlowStep` from view submit. Do not route human steps through handler dispatch; the plan's "human steps not listed on shell handlers" rule is correct and must hold (anti-pattern #9).
- **`JOURNAL_EVENT_TYPES` / journal append shape** — matching and `kill_on` should ride existing `STEP_OPENED`/`STEP_RESOLVED` events, not introduce a parallel event stream.

---

## Simplicity audit

### Over-abstraction risks

- **Contract codegen (4 artifacts).** `contract-keys.json` is genuinely useful for authoring DX and doctor/CLI `--branch` validation. But `handlers.schema.json` (generated JSON Schema) and `murrmure-contracts.d.ts` (TS string-literal unions) are speculative and language-specific. `.d.ts` in particular privileges TypeScript consumers, which contradicts harness/language agnosticism (north star §2.4). **Recommendation:** Phase 2 ships `contract-keys.json` only; move `handlers.schema.json` and `.d.ts` to an explicitly-flagged, opt-in follow-up.
- **`bindings.yaml` with five source prefixes** (`local:`, `space:`, `catalog`, `npm:`, `path:`). `npm:` implies a publishing pipeline that does not exist and is out of scope; `path:` is flagged "advanced." **Recommendation:** implement `local:` + `space:` + `catalog` now; leave `npm:`/`path:` as documented-but-unimplemented to avoid dead code and premature registry semantics.
- **Three `complete` modes + new CLI + env token.** Replacing one heuristic (`shouldAutoResolveExecutorStep`) with three explicit modes is a net *clarity* win and is fine. The cost is the new `MURRMURE_HUB_TOKEN`-in-env surface (see federation). Keep the modes; scope the token carefully.
- **Two skill packages + `--variant` + 6 doctor codes.** Reasonable but front-loaded. Could ship as one skill with an agent/developer section split first, then package-split when a real consumer-only worker exists. Low priority.

### What to delete vs what to add

**Delete (plan already commits — good):** `space-briefing.ts` generation and the briefing prepend (`invoke-shell-prompt.ts:176-190`); `link.json`; `executors.yaml` as a required file; `.mrmr.temp/`, `murrmure/`, `.murrmure/` trees; `executor.action` from manifests/catalog.

**Add — but leaner than proposed:** handler parser + `HandlerIndex` + lint (keep); `contract-keys.json` (keep); `list_handlers` MCP (keep); `mrmr step resolve` (keep). Defer: `.d.ts`/JSON-Schema codegen, `npm:`/`path:` bindings.

### Compatibility debt timeline concerns

This is the plan's weakest area against the "no multi-phase dual path" bar:

- **Phase 1** = hard cutover for **layout** ("no `murrmure/` + `.mrmr/` coexistence after PR merges").
- **Phase 2** = handlers indexed but **dual-read** old `actions.yaml` alongside new handlers.
- **Phase 3** = `HANDLER-CUTOVER` single PR removes `actions.yaml` from the example.
- **Phase 5** = "Delete legacy `actions.yaml`/`hooks.yaml`/`executors.yaml` parsers after deprecation window."

So dispatch runs a dual path from Phase 2 to Phase 5. This is inconsistent with the Phase 1 hard-cutover posture and unjustified for a pre-release with in-repo example spaces as the only consumers. **Recommendation:** treat handler dispatch like layout — introduce the parser (Phase 2) but keep it inert/internal, then flip dispatch and delete the legacy parsers *in the same `HANDLER-CUTOVER` milestone*. Do not ship a released dual dispatcher.

---

## Event model & federation

### Event-driven orchestration coverage

Strong. `on: step.opened | step.resolved` and `on: { event: { type, source? } }` unify step lifecycle and custom events behind one matcher, riding the existing journal (`STEP_OPENED`/`STEP_RESOLVED`) and the existing hook matcher (`packages/hub-core/src/hooks/matcher.ts`). `kill_on` gives asynchronous cancellation a declarative home. This satisfies north star §3.1–§3.4.

### Cross-machine / cross-team readiness

Good bones: `link.host` per machine, `.mrmr/dev/` gitignored, `space_id` committed for team-shared identity, `remote_hub` handler type and `target_space` deferred but named. The contract-key indirection is the correct enabler for "same flow, different space, explicit binding" (§4.3).

### Gaps blocking / weakening federation

1. **`flow_name` namespace collision (significant).** `contract_key := {flow_name}.{qualified_step_id}` off manifest `name:` (plan line 120). Federation means many catalogs/spaces; two independently-authored `preview-review` flows produce colliding keys, and a worker binding flows from multiple catalogs cannot disambiguate. The plan already computes a `graph_digest` and flow ids (`flw_…`). **Recommendation:** make the *stored/index* key flow-identity-qualified (e.g. bind `contract_keys` to a flow `ref` in `bindings.yaml`, resolved to `flow_id`/digest at apply), while keeping `flow_name` as the *authoring* ergonomic. Without this, keys are not true "protocol addresses" across spaces — they are locally-unique names.
2. **Run-scoped transfers vs session-as-unit-of-truth.** Cross-space handoff materializes to `dev/runs/{run_id}/transfers/{transfer_id}/` (plan line 649). Philosophy elevates the **session** as the cross-space correlation noun (philosophy.md §Session; north star §7.2 "sessions are the unit of shared truth"). A multi-run session spanning spaces may need session-scoped correlation, not only run-scoped paths. Confirm run-scoping does not orphan cross-space artifacts from their session; at minimum record `session_id` on the transfer manifest.
3. **`MURRMURE_HUB_TOKEN` in shell env — scope/lifetime/hub undefined.** For a remote orchestrator, "the hub" a woken worker resolves against may not be local. The plan lists the env var (plan lines 400, 437) but not: token scope (run-scoped vs grant), TTL, or which hub URL is injected. Injecting a reusable grant token into process env is also a secrets-exposure risk (visible in process listing / child inheritance). **Recommendation:** mint a short-lived, run-scoped resolve token per dispatch (resolves open question #6 toward the safer option) and inject the target hub URL explicitly.
4. **`space.yaml` root inference is single-binding.** "Hub infers project root from `.mrmr/` location" (plan line 598) assumes one host binding. Philosophy notes a space has one identity but many host bindings (teammate clone, CI runner). Ensure `link.space_id` (shared) vs `link.host` (per-machine) genuinely supports N bindings for one identity — the merged-file design should not regress multi-host binding.

None of these *block* the architecture, but #1 and #3 must be amended because they touch the plan's core federation promise.

---

## Required plan amendments (numbered)

1. **Add contracts-package touch points.** Extend the code map with `packages/contracts/src/flow/manifest.ts` (drop `executor`/`invoke`/`gate`, add `role`) and `packages/contracts/src/entities/step-contract.ts` (`StepContractCatalogEntry` executor removal), plus `packages/hub-core/src/flow-engine/step-contract-compile.ts` and `step-catalog.ts` (`shouldAutoResolveExecutorStep`, `requiresExplicitResolve`). These are the real blast radius of "no action names."
2. **Qualify contract keys by flow identity, not `flow_name`.** Bind `contract_keys` to a flow `ref` (→ `flow_id`/`graph_digest`) at apply so keys are collision-free across catalogs/spaces; keep `flow_name` only as the authoring shorthand. Update §"Contract keys (normative)" and the matching rules accordingly.
3. **Trim codegen to `contract-keys.json` for the first milestone.** Move `handlers.schema.json` and `murrmure-contracts.d.ts` to an opt-in follow-up; do not couple the kernel to TS/JSON-Schema artifact generation. Emit files from CLI/apply, not from `hub-core`.
4. **Collapse the dual dispatch path into `HANDLER-CUTOVER`.** Do not ship a released engine that reads both `actions.yaml`/`executors.yaml`/`hooks.yaml` and handlers. Introduce parsing inert in Phase 2, flip dispatch and delete legacy parsers in the same milestone (align with the Phase 1 hard-cutover posture). List the legacy parsers/aliases to delete in the code map.
5. **Specify the resolve token + target hub for shell dispatch.** Mint a short-lived, run-scoped token per dispatch; inject the target hub URL; document scope/TTL and non-inheritance. Resolve open questions #6 and #7 here.
6. **Record `session_id` on run-scoped transfers.** Keep run-scoped paths, but ensure cross-space transfer manifests carry `session_id` so the session remains the correlation truth (north star §7.2).
7. **Add missing hook-dispatch touch points.** Include `packages/hub-core/src/hooks/dispatch.ts` and `packages/hub-daemon/src/hook-dispatch.ts` alongside `hooks/matcher.ts` for the `on.event` migration.
8. **Add `resolveMurrmureRoot`/space-directory resolver** (`packages/cli/src/lib/space-directory.ts` and callers) to the Phase 1 code map for the `murrmure/` → `.mrmr/` walk-up change.
9. **Reduce `bindings.yaml` sources** to `local:`/`space:`/`catalog` for the shipped slice; mark `npm:`/`path:` documented-not-implemented.

---

## Atomic cutover recommendations

The plan's named single-PR milestones are the right instinct but not yet sufficient:

- **`HANDLER-CUTOVER` (Phase 3)** — good, but as written it lands *after* a Phase 2 that already ships dual-read. Fold the legacy-parser deletion and dispatch flip into this one milestone so no released build runs two dispatchers (amendment #4). Its acceptance already bans `executor.action` in `examples/flows/**` — extend that ban to the compiled catalog type and the legacy parsers.
- **Phase 1 layout cutover** — already atomic and hard ("no coexistence"), with a concrete CI guard (`rg '\.mrmr\.temp|murrmure/' …` → 0). Keep. Add the contracts-schema change (amendment #1) to whichever PR removes `executor` so the manifest schema and the catalog type flip together — a manifest without `executor` but a catalog type still carrying it would be an incoherent intermediate.
- **Missing atomic milestone: contract-key identity.** Amendment #2 (flow-id-qualified keys) should be its own small, testable cutover *before* `HANDLER-CUTOVER`, because it changes what a key *means*; retrofitting identity-qualification after handlers ship would be a second migration.

With these, the cutover set is: (A) `.mrmr/` layout + briefing removal + manifest/catalog `executor` schema drop [atomic], (B) contract-key identity qualification [atomic], (C) `HANDLER-CUTOVER` = handler dispatch + `complete` wiring + delete legacy parsers [atomic]. That sequencing avoids any released dual path and keeps each schema change coherent.

---

## Verdict rationale

**PASS WITH AMENDMENTS.** The plan's spine — contract-key handlers replacing `executor.action`, flow/execution decoupling, briefing removal, unified `.mrmr/` — is the most federation-correct direction available and is faithful to the north star's ownership boundaries and event model. It does not centralize UI over views, does not turn the hub into an agent runtime on the default path, and lands its changes at the correct layers (verified against `step-open.ts`, `step-resolve.ts`, `invoke-shell-prompt.ts`, `mcp-handlers.ts`). It falls short of a clean PASS only on scoping/precision: hidden contracts-package touch points, a `flow_name` key namespace that is not federation-safe, over-scoped codegen, a multi-phase dual dispatch path, and an unspecified shell-dispatch token. All are correctable within the existing phase structure without changing the architecture.
