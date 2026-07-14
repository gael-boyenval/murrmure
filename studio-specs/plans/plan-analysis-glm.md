# Plan analysis — Tutorial 1 v3 realization (GLM review)

**Reviewer:** GLM 5.2 (independent architecture review)
**Date:** 2026-07-13
**Subject:** Do the active `studio-specs/plans/` bring the code into alignment with the v3 tutorial (`apps/docs/guide/tutorials/01-local-preview-review-v3/`)?
**Stance:** The v3 tutorial is the intended experience (XD target). Current code is **not** assumed correct; normative `studio-specs/current/` and the product north star remain binding, and conflicts are surfaced explicitly.
**Method:** Read the full v3 tutorial (index + 6 chapters) and all 11 active plans + `plans/README.md`; inspected schemas, hub-core flow engine, executors, view SDK, shell-web, handler parsing/lint, CLI commands and wizard, hub boot, Desktop bundle, normative bridges, and tests. Findings cite repository paths and line ranges. Confirmed defects are labeled **[C]**; hypotheses/needs-confirmation are labeled **[H]**; questions are labeled **[Q]**.

> **Scope note:** This is an analysis artifact only. No existing or other new file was modified. The worktree's extensive user changes are preserved.

---

## 1. Executive summary

The v3 tutorial describes a clean, six-beat path: `mrmr setup` → write a flat `my-dev-flow` manifest (linear steps with default `completed`/`failed` branches, one human `intake` with file-only `continue`/`cancel`) → build a `spec-intake` view with `useViewContract`/`submitBranch` → run from Desktop → add `shell_spawn` copy + agent `build` + `shell_spawn` cleanup handlers → archive + `git commit` from the agent's resolve payload.

**The tutorial is not realizable today, and the active plans cover most — but not all — of the gap.** Six confirmed blocking defects sit between the tutorial and the code; five of them have plans (all "Planned — not started"), one has **no plan at all**:

- **[C3, uncovered]** `{{steps.build.output.commit_message}}` in Part 6's `cleanup` `shell_spawn` command resolves to an **empty string**. `shell_spawn` command resolution (`packages/executors/src/shell-spawn.ts:133-140`) uses a flat binding map that does not include `steps.*.output.*`; only `resolveTemplateString` (`packages/hub-core/src/flow-engine/templates.ts:36-43`) handles that token, and it is wired for legacy `invoke` params / checkpoint `payload_ref`, not step-contract shell commands. No active plan addresses step-output chaining for step-contract shell handlers. Part 6's `git commit -m "" -m ""` fails.
- **[C1]** The setup wizard's default agent grant omits `step:resolve` (`packages/cli/src/wizard/capabilities.ts:2-9`), while `murrmure_resolve_step` requires it (`packages/hub-daemon/src/mcp-tool-registry.ts:35`, `routes/runs/resolve-step.ts:21`) and the normative spec says a grant without it *cannot* resolve steps (`studio-specs/current/bridges/grants-migration.md:44`). Part 5's `build` resolve is rejected.
- **[C2]** `branches` is **required** in `StepContractManifestStepSchema` (`packages/contracts/src/entities/step-contract.ts:75`) and branchless steps are **dropped** from the catalog (`packages/hub-core/src/flow-engine/step-contract-compile.ts:456` filters `isStepContractStep`, which is false for branchless steps — `:90`). The tutorial's `write_spec`/`cleanup` (no `branches`) do not compile, and `contract-keys.json` won't list `my-dev-flow.write_spec`.
- **[C4]** `HandlerOnSchema` only accepts `"step.opened"`/`"step.resolved"` literals or `{event:}` (`packages/contracts/src/entities/handler.ts:13-18`), and `buildHandlerIndex` indexes by `contract_keys` only (`packages/hub-core/src/index/parse-handlers.ts:44-62`). The tutorial's `on: step.opened::my-dev-flow.write_spec` fails validation and would never dispatch.
- **[C5]** The view SDK exposes `useViewSubmit`/`submit(params, artifacts?: ViewSubmitArtifact[])` with `content_base64` (`packages/view-sdk/src/app/provider.tsx:68-115`, `resolve-step.ts:7-11`) and `ViewAppContext.step` has only `step_id`/`branch_names`/`contract?` (`packages/view-sdk/src/types.ts:18-22`). The tutorial's `useViewContract`/`submitBranch`/`cancel`/`isViewContractError` API and `context.step.branches` do not exist.
- **[C6]** `validatePayloadSchema` checks `schema.required` against `payload` only (`packages/hub-core/src/flow-engine/step-resolve.ts:63-75`); `validateArtifactsOut` never *requires* declared slots (`packages/hub-core/src/flow-engine/step-artifacts.ts:61-75`); branch catalog entries carry no per-branch `artifact_slots` (`packages/contracts/src/entities/step-contract.ts:91-95`; merged at step level at `step-contract-compile.ts:434-437`). The tutorial's file-only `required: [spec]` is not enforced — Submit without a file silently succeeds.

Additional confirmed issues: the setup wizard creates `ui-sandbox`/`ui-production`, not a user-named `my-first-space` (**[H1], no plan**); the agent prompt protocol still emits `## Session`/`## Discovery`/`## Resolve API` and a placeholder `run_id: "<run_id>"` (**[H2]**); artifact paths are relative, not the "absolute path" the tutorial claims (**[H3], no plan**); `timeout_ms` is silently ignored for step-contract (detached) shell handlers (**[H6], no plan**); and the run-scratch path conflict (`.mrmr/dev/runs` in code vs `.mrmr.temp/runs` in normative bridges) is real (**[H4]**).

On the positive side, several tutorial assumptions are already true: `{{prompt}}` is supported in `shell_spawn` commands (`shell-spawn.ts:20,61,129-130`); `role` is derived from `presentation.view` (`step-contract-compile.ts:124-130`); `{{murrmure.step.*.artifact.*.path}}` resolves via `prompt_bindings` (`step-contract-slice.ts:276-309`); `mrmr space view init`/`mrmr view dev`/`mrmr space apply`/`mrmr space status`/`mrmr doctor`/`mrmr flow run`/`mrmr step resolve` all exist; the scaffold writes `handlers.yaml` (`version: 1\nhandlers: []`) and `space.yaml` (`apiVersion: murrmure.space/v1`) (`packages/cli/templates/space/manifest.json:2-3`); and `contract-keys.json` is written as `flow.manifest.name + "." + step_id` (`packages/cli/src/commands/space/apply.ts:45`), matching the tutorial's `my-dev-flow.write_spec`.

**Recommended correction:** keep the tutorial as the target; sequence the existing plans into four dependency-ordered phases, **add two missing plans** (step-output token chaining for shell handlers; wizard space-naming UX), **decouple** `flow-branch-api-simplify` and the `2026-07-13` shell-viz plan from the v3 critical path, and add a v3-tutorial contract test so drift is caught.

---

## 2. Scope of evidence examined

| Layer | Sources |
|---|---|
| Tutorial | `apps/docs/guide/tutorials/01-local-preview-review-v3/{index,01..06}.md` |
| Plans | `studio-specs/plans/README.md` + all 11 active plans |
| Schemas | `packages/contracts/src/entities/{step-contract,handler}.ts` |
| Flow engine | `packages/hub-core/src/flow-engine/{step-contract-compile,step-resolve,step-artifacts,exec-context,templates,step-contract-slice,space-home}.ts` |
| Executors | `packages/executors/src/{shell-spawn,invoke-shell-prompt}.ts` |
| View SDK + shell | `packages/view-sdk/src/{types,app/provider,app/resolve-step,app/index}.ts`; `packages/shell-web/src/lib/{view-app-context,view-resolve-adapter}.ts`; `packages/shell-web/src/routes/FlowPreviewPage.tsx` |
| Handler index | `packages/hub-core/src/index/parse-handlers.ts` |
| Hub boot / catalog | `packages/hub-daemon/src/main.ts`; `packages/hub-core/src/handlers/config.ts`; `apps/desktop/electrobun.config.ts` |
| CLI / wizard | `packages/cli/src/commands/{setup,space/init,space/apply,space/onboard,space/view-init,view/dev}.ts`; `packages/cli/src/wizard/{grant,capabilities}.ts`; `packages/cli/src/lib/space-scaffold.ts`; `packages/cli/templates/space/manifest.json`; `packages/cli/templates/views/vite-react/{src/App.tsx,dev/fixtures/intake.json}` |
| Capabilities / auth | `packages/hub-daemon/src/mcp-tool-registry.ts`; `routes/runs/resolve-step.ts`; `routes/runs/step-work-upload.ts` |
| Normative | `studio-specs/current/bridges/{step-contract,handlers,artifacts,grants-migration}.md`; `current/product/{spec,philosophy}.md`; `current/cli/spec.md`; `current/index.md`; `current/overview.md` |
| Tests / enforcement | `packages/cli/test/docs-proof.test.ts`; `packages/cli/test/preview-review-v2-example.test.ts` |

---

## 3. Findings by severity

### 3.1 Critical (block the v3 tutorial end-to-end)

#### C1 — Wizard default grant omits `step:resolve`; Part 5 `build` resolve is rejected
- **Evidence:** `AGENT_GRANT_CAPABILITIES = ["space:read","flow:run","flow:read","action:invoke","gate:resolve","journal:read"]` (`packages/cli/src/wizard/capabilities.ts:2-9`); `wizardMintAgentGrant` posts these as `scopes` (`packages/cli/src/wizard/grant.ts:23-30`). `murrmure_resolve_step` requires `step:resolve` (`packages/hub-daemon/src/mcp-tool-registry.ts:35`; `routes/runs/resolve-step.ts:21`; `routes/runs/step-work-upload.ts:26`). Normative: "Grant without `step:resolve` **cannot** resolve flow steps" (`studio-specs/current/bridges/grants-migration.md:44`); `current/cli/spec.md:402` ("hub enforces `step:resolve` on token").
- **Tutorial impact:** Part 5 `dev_build` (`complete: explicit`) requires the agent to call `murrmure_resolve_step(build, completed, {commit_message, description})`. With the wizard grant, that call is denied → `build` never resolves → run hangs or fails.
- **Plan coverage:** `2026-07-10-agent-grant-onboarding.md` §0.3 item 1 explicitly flags "missing `step:resolve`" and GO-4 fixes it. **But the plan is "Phase 0 not started" and blocks on research deliverables.** For the v3 tutorial, the `step:resolve` fix is a pure additive constant change and should not wait on Phase 0 vocabulary work.
- **Severity rationale:** A tutorial-following user connects the agent exactly as the wizard instructs and then hits an authorization denial on the first agent step.

#### C2 — `branches` required + branchless steps dropped; Parts 5/6 manifests don't compile
- **Evidence:** `StepContractManifestStepSchema` has `branches: z.record(StepBranchDefinitionSchema)` (not `.optional()`) (`packages/contracts/src/entities/step-contract.ts:75`). `isStepContractStep` returns `Boolean(step.branches && Object.keys(step.branches).length > 0)` (`step-contract-compile.ts:90`); `compileStepContractCatalog` does `contractSteps = manifest.steps.filter(isStepContractStep)` (`:456`) **before** flattening/compiling. `compileCatalogEntries` only processes `flat` rows derived from `contractSteps` (`:416-440`). `writeContractSnapshots` emits `contract_key = flow.manifest.name + "." + entry.step_id` only for catalog entries (`packages/cli/src/commands/space/apply.ts:43-52`).
- **Tutorial impact:** The tutorial's `write_spec` and `cleanup` steps have only `id` + `description` (Part 5 Step 1, Part 6 Step 1). With current code: (a) the manifest fails Zod validation at `branches` required; even if that were relaxed, (b) `write_spec`/`cleanup` are filtered out → the catalog contains only `intake` (and `build`, which has branches) → `contract-keys.json` does **not** include `my-dev-flow.write_spec` or `my-dev-flow.cleanup`, so the Part 5/6 handler `on` bindings have no matching catalog key, and `lintSpaceApplyBundle` raises `HANDLER_MISSING`. The flow graph is also wrong (`build.completed` cannot route to a `cleanup` that isn't in the catalog).
- **Plan coverage:** `2026-07-10-step-default-branches.md` proposes `applyDefaultBranches(flatSteps)` before `compileCatalogEntries`. **This is insufficient:** defaults must be injected **before the `filter(isStepContractStep)` at `:456`**, otherwise branchless steps are still dropped. The plan's "Code changes" row says `applyDefaultBranches(flatSteps)` runs before `compileCatalogEntries` but does not mention relaxing the schema (`branches` optional) in the same slice nor reordering the `contractSteps` filter. DB-1/DB-2/DB-5 imply these, but the implementation sketch is incomplete.
- **Severity rationale:** No linear step in the tutorial works; this is the spine of the flow.

#### C3 — `{{steps.build.output.*}}` does not resolve in `shell_spawn` commands (NO PLAN)
- **Evidence:** `shell_spawn` command resolution (`resolveShellInvocation`, `packages/executors/src/shell-spawn.ts:111-151`) replaces `{{space_root}}`, `{{prompt}}`, then a generic `{{([\w.]+)}}` against `bindings` from `buildInvokeTemplateBindings` (`packages/executors/src/invoke-shell-prompt.ts:38-58`). `bindings` contains only `action_name`, `space_id`, `run_id`, `session_id`, `space_root`, flattened `params.*`, and `murrmure.*` (from `murrmure_bindings`). It does **not** contain `steps.*.output.*`. The generic replacement returns `""` for unknown keys (`shell-spawn.ts:138`). The `{{steps.*.output.*}}` grammar is implemented in `resolveTemplateString` (`packages/hub-core/src/flow-engine/templates.ts:2,36-43`) but that function is used for invoke params / checkpoint `payload_ref`, not for `shell_spawn` `command`. Step outputs *are* captured into `exec_context.steps[step_id].output` on resolve (`step-resolve.ts:498-509`; `exec-context.ts:24-42`), and exposed to agents via `inputs_from_run` / `MURRMURE_INPUT` (`step-contract-slice.ts:78-90`), but they are **not** exposed as shell command tokens.
- **Tutorial impact:** Part 6 `cleanup_archive_commit` runs `git commit -m "{{steps.build.output.commit_message}}" -m "{{steps.build.output.description}}"`. Both tokens resolve to `""` → `git commit -m "" -m ""` → git rejects the empty commit message (the tutorial's own troubleshooting table even lists "`git commit` failed with empty `-m`", attributing it to a missing payload — but the real cause is the token not resolving even when the payload is present).
- **Plan coverage:** **None.** No active plan mentions `{{steps.*.output.*}}` in shell commands, nor reconciles the two token grammars the tutorial uses (`{{murrmure.step.*.artifact.*.path}}` in Part 5 vs `{{steps.*.output.*}}` in Part 6). The `handler-authoring-simplify` plan mentions `{{murrmure.step.*}}` token expansion only in passing; `run-scratch-path-normalize` mentions token path prefixes but not step-output tokens.
- **Severity rationale:** Part 6 is the tutorial's payoff (archive + commit). It cannot succeed as written. This is the single most important uncovered gap.
- **Security note for the future fix:** once `steps.*.output.*` is wired into shell command bindings, the substituted value (agent-controlled resolve payload) flows through `shellQuote(value)` (`shell-spawn.ts:139`). Any fix **must** continue to shell-quote these substitutions; raw interpolation would be a shell-injection vector via the agent's `commit_message`.

#### C4 — `on: step.opened::key` not supported; Parts 5/6 handlers fail apply and never dispatch
- **Evidence:** `HandlerOnSchema` = `union(HandlerLifecycleOnSchema, z.object({event:...}))` where `HandlerLifecycleOnSchema` = `enum("step.opened","step.resolved")` (`packages/contracts/src/entities/handler.ts:3-18`). `buildHandlerIndex` iterates `handler.contract_keys ?? []` and indexes by key × lifecycle (`packages/hub-core/src/index/parse-handlers.ts:44-62`); a handler with no `contract_keys` is never indexed. `matchStepOpenedHandlers(index, contract_key)` looks up `step_opened_by_key[contract_key]` (`:64-69`).
- **Tutorial impact:** Part 5/6 handlers use `on: step.opened::my-dev-flow.write_spec` (and `…build`, `…cleanup`) **without** `contract_keys` on the shell handlers. (a) Zod rejects the `on` string; (b) even if accepted, `write_spec_copy` has no `contract_keys` so it is never indexed for dispatch. `dev_build` uses both `on::key` and `contract_keys: [my-dev-flow.build]` (prompt-only) — the plan's intended shape.
- **Plan coverage:** `2026-07-10-handler-authoring-simplify.md` proposes exactly this (`on::key` parse, `contract_keys` prompt-only, default `cwd`/`delivery`). **Plan not started.** The plan's migration M1–M4 and acceptance HA-1..HA-7 are well-scoped.
- **Severity rationale:** No handler in the tutorial can apply or dispatch.

#### C5 — View SDK API (`useViewContract`/`submitBranch`) unshipped; Part 3 view won't run
- **Evidence:** `@murrmure/view-sdk/app` exports `useViewSubmit`/`useViewContext`/`useViewHubClient`/`useViewRuntime` (`packages/view-sdk/src/app/index.ts`, `provider.tsx`). `useViewSubmit()` returns `{ submit(params, artifacts?: ViewSubmitArtifact[]), cancel() }` where `ViewSubmitArtifact = { slot, filename, content_base64 }` (`provider.tsx:68-115`, `resolve-step.ts:7-11`) — authors must hand-roll `fileToBase64`. Branch selection is via `params.outcome` string (`resolve-step.ts:30-35`), not `submitBranch("continue", {files})`. `ViewAppContext.step` = `{ step_id, branch_names?, contract? }` with `contract` "declared but NEVER populated" (`types.ts:18-22`; the plan's own words). `buildViewAppContext` passes only `{ step_id, branch_names }` (`packages/shell-web/src/lib/view-app-context.ts:43-46`). The shell-web host adapter `mapViewSubmitToResolveStep` does not accept `artifacts_out` (`packages/shell-web/src/lib/view-resolve-adapter.ts:13-29`) — its `ResolveStepBody` has only `{branch, payload}`.
- **Tutorial impact:** Part 3's `App.tsx` imports `useViewContract`, `submitBranch`, `cancel`, `isViewContractError` from `@murrmure/view-sdk/app` and calls `submitBranch("continue", { files: { spec: specFile } })`. None of these symbols exist. The scaffolded `App.tsx` (`packages/cli/templates/views/vite-react/src/App.tsx`) uses the old `useViewSubmit`/`submit({ outcome: "validated" })`/`ctx.gate?.step_id` API, and the scaffolded fixture (`dev/fixtures/intake.json`) has a `gate` block with **no** `step` object — so the tutorial's "add `step.branches` inside the existing `step` object" diff is against a baseline that doesn't exist.
- **Plan coverage:** `2026-07-10-view-sdk-contracts-and-upload.md` owns this (Slices 1–4) and `2026-07-10-branch-schema-artifact-validation.md` Slice 3 owns the host bridge + context. **Both not started.** The plans are well-aligned with the tutorial target (`submitBranch`, `ViewAppContext.step.branches`, `ViewContractError`, hide base64).
- **Severity rationale:** Part 3 is the first interactive beat; the scaffolded code and the tutorial code use incompatible SDKs.

#### C6 — File-only `required: [spec]` not enforced; Part 4 Submit-without-file silently succeeds
- **Evidence:** `validatePayloadSchema` checks `schema.required` against `payload` only (`packages/hub-core/src/flow-engine/step-resolve.ts:63-75`) → `required: [spec]` looks for `payload.spec`. `validateArtifactsOut` returns `null` when `artifacts_out` is empty (`packages/hub-core/src/flow-engine/step-artifacts.ts:61-66`) → declared slots are never required. `StepCatalogBranchSchema` has no `artifact_slots` field (`packages/contracts/src/entities/step-contract.ts:91-95`); compile merges slots at step level from all branches (`step-contract-compile.ts:434-437`).
- **Tutorial impact:** Part 2 declares `intake.continue` with `schema.required: [spec]` + `artifact_slots.spec`. The tutorial explicitly states "Names in `schema.required` that match `artifact_slots` are **file slots**, not payload fields — there is no `spec_filename`". Today a resolve `{ branch: "continue", payload: {} }` (no file) passes both validators and the run succeeds without the spec — the opposite of the tutorial's contract.
- **Plan coverage:** `2026-07-10-branch-schema-artifact-validation.md` owns this (Slices 1–2) with a clear normative proposal (partition `required` into payload/artifact sets, reject missing required artifacts with `INVALID_ARTIFACTS`). **Plan not started; Phase 0 open questions 1–5 block Slice 1.**
- **Severity rationale:** The tutorial's flagship "file-only intake" contract is unenforced; the Cancel/Submit semantics in Part 4 are not guaranteed.

### 3.2 High

#### H1 — Setup wizard creates `ui-sandbox`/`ui-production`, not a user-named `my-first-space` (NO PLAN)
- **Evidence:** `DEFAULT_SPACES = [{slug:"ui-sandbox",...},{slug:"ui-production",...}]` (`packages/cli/src/commands/setup.ts:25-28`); Step 2 creates both by default (`:114-140`); Step 3 bundles "Scaffold mrmmure/, link, and apply" into one confirm (`:142`) and links to `createdSpaceIds[0]` (`:175`). The scaffold writes `space.yaml` with `slug: my-space` (`packages/cli/templates/space/manifest.json:3`).
- **Tutorial impact:** Part 1 says: "Spaces — creates the space on the hub. Name it `my-first-space`" and lists separate Init/Link/Apply/Grant steps; then instructs editing `slug: my-space` → `slug: my-first-space` and re-running `mrmr space apply`. The shipped wizard creates two fixed-name spaces and never prompts for `my-first-space`. Triple mismatch: scaffold default `my-space`, tutorial `my-first-space`, wizard `ui-sandbox`/`ui-production`.
- **Plan coverage:** **None.** `agent-grant-onboarding` touches only the Grant step; `hub-clean-slate-boot` is about seed contracts; no plan reconciles the wizard's space-creation UX with the tutorial. The scaffolded README also still instructs the manual `mrmr grant mint --space spc_... --label "cursor-agent"` path (`manifest.json:4`), contradicting the tutorial's "agent setup is wizard-only" stance — and `agent-grant-onboarding`'s doc-slice (GO-D2) lists the tutorial and `agents-mcp.md` but **not** the scaffold README.
- **Severity rationale:** The very first beat of the tutorial does not match observed behavior; a user following it verbatim cannot produce a space named `my-first-space`.

#### H2 — Agent prompt protocol still emits Session/Discovery/Resolve API and a placeholder run_id
- **Evidence:** `renderMurrmureProtocolEnvelope` emits `## Session`, `## Step contract`, `## Discovery`, `## Resolve API` blocks, all always-on (`packages/hub-core/src/flow-engine/step-contract-slice.ts:131-173`). `renderAgentStepContractMarkdown` emits `When ready: murrmure_resolve_step({ run_id: "<run_id>", step_id: "...", branch: "...", payload: { … } })` — a literal `<run_id>` placeholder and a generic `{ … }` payload (`:175-209`, esp. `:199`). `renderHandlerScopeMarkdown` already gates scope on `contract_keys.length <= 1` (`:256`).
- **Tutorial impact:** Part 5's "Extract — full prompt sent to the agent" shows `run_id: "run_01J8K2M4N6P0Q2R4"` (filled), `payload: { commit_message: "…", description: "…" }` (concrete), no `## Session`, no `## MCP tools`/`## Resolve API`, and `## Discovery` only for multi-key handlers. The live prompt today does not match this extract.
- **Plan coverage:** `2026-07-10-agent-prompt-protocol-simplify.md` APP-1..APP-4 cover exactly this. **Plan not started.** Well-scoped; the acceptance fixture is the Part 5 extract.
- **Severity rationale:** A tutorial that shows a literal prompt extract that the product does not reproduce undermines trust; APP-4 (extract matches live prompt) is a hard acceptance gate.

#### H3 — Artifact path is relative, not the "absolute path" the tutorial claims (NO PLAN)
- **Evidence:** `promoteArtifactsOut` stores `path = stableArtifactRelPath(...) = .mrmr/dev/runs/{run_id}/steps/{step_id}/{slot}/{filename}` (`packages/hub-core/src/flow-engine/step-artifacts.ts:124,25-32`). `buildArtifactMurrmureBindings` binds `step.{stepId}.artifact.{slot}.path = record.path` (the relative path) (`:167-178`); these become `murrmure.step.*.artifact.*.path` in `prompt_bindings` (`step-contract-slice.ts:305-307`) and are substituted (shell-quoted) into the command (`shell-spawn.ts:133-140`).
- **Tutorial impact:** Part 5 states the hub expands `{{murrmure.step.intake.artifact.spec.path}}` "to that **absolute path** on disk." It is actually a path **relative to the space root**. It works for `cp` only because `resolveCwd` defaults to `space_root` (`shell-spawn.ts:177-182`); if a handler overrides `cwd`, the relative path breaks silently.
- **Plan coverage:** **None.** `handler-authoring-simplify` standardizes the `cwd` default but does not address path absoluteness; `run-scratch-path-normalize` concerns the prefix, not relative-vs-absolute.
- **Severity rationale:** Doc/behavior mismatch plus a latent robustness bug (cwd override). Medium-high because it silently mis-teaches the contract.

#### H4 — Run scratch path: code `.mrmr/dev/runs` vs normative `.mrmr.temp/runs`
- **Evidence:** Code: `stepStableDirRelPath` → `.mrmr/dev/runs/{run_id}/steps/{step_id}` (`step-artifacts.ts:17-19`); `stepWorkdirRelPath` → `.mrmr/dev/runs/.../work` (`step-contract-slice.ts:38-40`); `activeStepContractRelPath` → `.mrmr/dev/runs/.../active-step-contract.json` (`:30-32`); shell prompt materialization `.mrmr/dev/runs/{runBare}` (`shell-spawn.ts:88`). Normative: `studio-specs/current/bridges/artifacts.md:87-88` (`.mrmr.temp/runs/...`); `step-contract.md:293`; `product/philosophy.md:182,195,301,496`. The handlers cutover migrated run paths `.mrmr.temp/runs → .mrmr/dev/runs` but bridges were not reconciled (per the plan's own statement).
- **Tutorial impact:** Part 4 uses `.mrmr/dev/runs/{run_id}/steps/intake/spec/` — **aligned with code**, not normative. The tutorial is correct-as-shipped; the normative bridges are stale.
- **Plan coverage:** `2026-07-10-run-scratch-path-normalize.md` Phase 0 recommends Option A (align normative → code, keep `.mrmr/dev/runs`). **Plan not started.** This is primarily a docs/spec reconciliation, but per the `murrmure-doc-sync` workspace rule, drift between `current/` and code is a **blocking** finding until resolved.
- **Severity rationale:** Normative/code drift; not tutorial-blocking (tutorial matches code) but workspace-rule-blocking for shipping the other plans.

#### H5 — Hub seed contracts / PACKAGE_CATALOG still present at first boot
- **Evidence:** `startHubDaemon` pins `cref_linear_demo` from `fixtures/hub/contracts/linear-demo-v2.json` on every boot (`packages/hub-daemon/src/main.ts:143-146`). `PACKAGE_CATALOG` installs `review-loop`/`brand-check`/`feature-spec` without a bundle (`packages/hub-core/src/handlers/config.ts:11-14,230`). Desktop copies `fixtures/hub/contracts` into `Resources/hub/contracts` (`apps/desktop/electrobun.config.ts:19`).
- **Tutorial impact:** Part 1 promises an empty first boot ("No spaces linked yet"). Seed contracts + phantom `brand-check`/`feature-spec` capabilities contradict that and the north star ("hub up, zero contracts"). Not strictly blocking the v3 flow (the user creates their own space), but it pollutes the empty state the tutorial describes.
- **Plan coverage:** `2026-07-10-hub-clean-slate-boot.md` CS-1..CS-9 cover this thoroughly. **Plan not started.**
- **Severity rationale:** Conflicts with the tutorial's first-screen promise and the product north star; also a `current/index.md` drift (still lists "Murrmure FDK" and `feature-spec` at `:31,38`).

#### H6 — `timeout_ms` silently ignored for step-contract (detached) shell handlers (NO PLAN)
- **Evidence:** `shouldDetachShell(context)` returns `Boolean(context.step_contract)` (`packages/executors/src/shell-spawn.ts:196-198`) → all step-contract handlers run via `runCommandDetached`, which has **no `setTimeout` timer** (`:273-362`). The non-detached `runCommand` path has the timer (`:256-259`). `timeout_ms` is read (`:450`) but only applied in the non-detached branch.
- **Tutorial impact:** Part 5 sets `timeout_ms: 10000` on `write_spec_copy` and `timeout_ms: 3600000` on `dev_build`, and describes `timeout_ms` as "Kill the shell if it runs longer than this." For step-contract handlers, no kill happens. A hung `cp`/`git`/agent runs forever (until manual cancel).
- **Plan coverage:** **None.** `handler-authoring-simplify` does not touch detached timeout behavior.
- **Severity rationale:** Operational/observability gap; the tutorial states a guarantee the code does not honor for the handler family it teaches.

### 3.3 Medium

- **M1 — `flow-branch-api-simplify` is not required for the v3 tutorial (decouple).** The tutorial uses the v2.2 routing vocabulary (`next: write_spec`, `next: null`, `fail_run: true`) plus default branches. The plan's `then`/`outcome`/`route` alternatives and `role`-deprecation are beyond v3. `role` derivation from `presentation.view` already exists (`step-contract-compile.ts:124-130`), so the plan's open `role` question is partly moot for v3 — the tutorial never sets `role` and the compiler already derives `human` from the view. **Recommendation:** do not gate v3 on this plan; treat it as future ergonomics. The plan itself says `step-default-branches` is "a concrete slice that can land first."
- **M2 — Normative `step-contract.md` describes the pre-v3 world.** It documents `next: null` as terminal (`:150`), `on: step.opened` (`:124`), old `submit(params, artifacts?)` API (`:300`), and `.mrmr.temp/runs` (`:293`). Multiple plans promise same-PR bridge updates (`step-default-branches`, `handler-authoring-simplify`, `branch-schema-artifact-validation`, `view-sdk-contracts-and-upload`, `run-scratch-path-normalize`). Per `murrmure-doc-sync`, landing code without these bridge updates is a blocking finding. Risk: with 5+ plans touching the same bridge, merge conflicts and partial updates are likely.
- **M3 — Scaffold README contradicts the tutorial's wizard-only agent story.** `manifest.json:4` instructs `mrmr grant mint --space spc_... --label "cursor-agent"`. The tutorial says agent setup is `mrmr setup` wizard-only. `agent-grant-onboarding` GO-D2 covers the tutorial and `agents-mcp.md` but does **not** list the scaffold README in allowed doc paths. Doc-sync scope gap.
- **M4 — View-init scaffold template + fixture are pre-v3.** `App.tsx` uses `useViewSubmit`/`submit({outcome:"validated"})`/`ctx.gate`; `intake.json` has a `gate` block and no `step`. The tutorial Part 3 fixture diff assumes a `step` object exists. `view-sdk-contracts-and-upload` Slice 4 mentions template/fixture updates but the tutorial's instructions don't match the current scaffold baseline — the slice must also rework the fixture to include a `step` object (not just `step.branches` inside an existing one).
- **M5 — No enforcement guards the v3 tutorial against drift.** `packages/cli/test/docs-proof.test.ts` contains zero references to `v3`, `local-preview-review-v3`, `spec-intake`, `my-dev-flow`, `useViewContract`, or `submitBranch`. The tutorial can describe unshipped APIs with no test catching it. No plan proposes a v3-tutorial contract test (e.g., assert the tutorial's manifest applies, the handler shape validates, the SDK imports resolve). Per `murrmure-doc-sync`, drift should be blocking — but it is currently undetectable.
- **M6 — `action:invoke` in wizard defaults is scope-creep for the v3 flow.** `capabilities.ts:5` includes `action:invoke`; the v3 tutorial flow is handlers-only (no `actions.yaml`). `agent-grant-onboarding` open Q4 asks whether to keep it. Not blocking, but the default grant should be the minimal "Tutorial 1 agent" set.
- **M7 — Two coexisting token grammars, undocumented for shell commands.** Part 5 uses `{{murrmure.step.*.artifact.*.path}}`; Part 6 uses `{{steps.*.output.*}}`. `templates.ts` implements both, but `shell_spawn` only wires the `murrmure.*` namespace (via `prompt_bindings`). No plan documents which grammar applies to `shell_spawn` `command` vs invoke params, nor reconciles them. Authoring-confusion risk.
- **M8 — `complete: auto` auto-resolve labels shell steps as `agent`.** `maybeAutoResolveExecutorStepAfterAction` requires `entry.role === "agent"` (`step-resolve.ts:710`) and `entry.branches.completed` (`:711`). `deriveRole` returns `"agent"` for any step without a view (`step-contract-compile.ts:124-130`), so `write_spec`/`cleanup` (shell) are role `agent`. Functionally OK with default branches, but semantically a `cp` is not an "agent" step. The `flow-branch-api-simplify` `role` discussion should clarify shell vs agent steps.

### 3.4 Low / observations

- **L1 — `studio-specs/current/index.md` still hosts an FDK section** (`:31` "Murrmure FDK", `:40` "Flow Dev Kit (FDK) — historical", `:38` feature-spec). `hub-clean-slate-boot` CS-7 flags this but defers. Normative FDK drift not fully resolved.
- **L2 — `overview.md:11`** describes Desktop as "Primary human path — gates, runs…" (legacy "gates" wording). Minor drift vs the step-contract world.
- **L3 — Two onboarding wizards** (`mrmr setup` and `mrmr space onboard`); the tutorial uses `setup`. Not a conflict, but two divergent entry points is a maintenance/user-confusion surface.
- **L4 — Label default inconsistency in the plan.** `grant.ts:20` defaults label to `"Cursor agent"`; `agent-grant-onboarding` §0.1 table says the wizard uses `"Worker agent"`. The plan's description is stale relative to code.
- **L5 — `mrmr space apply --strict` view-dist enforcement [H].** A `CHECKPOINT_VIEW_DIST_MISSING` lint is documented in `skill-developer/SKILL.md:120` and `flow-authoring.md:121`, and `engine-capabilities.ts:78` checks `dist_present && entry_present`. The tutorial's "`mrmr space apply --strict` requires `dist/index.html`" is roughly consistent, but the lint code name is `CHECKPOINT_*` (legacy checkpoint era), suggesting an incomplete cutover. **Needs confirmation** that this is a `strictLintFailures` entry and not just a warning. Not blocking.

---

## 4. Coverage / gap matrix (tutorial beat → plans → code status)

| Tutorial beat | Required code behavior | Relevant plan(s) | Code today | Status |
|---|---|---|---|---|
| **1. Launch + `mrmr setup`** | Empty first boot; single user-named space; wizard-only agent connect | `hub-clean-slate-boot`, `desktop-mcp-bridge-exposure`, `agent-grant-onboarding` | Seed contracts present (H5); wizard makes `ui-sandbox`/`ui-production` (H1); `step:resolve` missing (C1); scaffold README manual grant (M3) | **Partial; H1 + M3 uncovered** |
| **2. Flow manifest** | `branches` optional; default `completed`/`failed` from order; file-only `required: [spec]` | `step-default-branches`, `branch-schema-artifact-validation`, (`flow-branch-api-simplify` optional) | `branches` required (C2); branchless steps dropped (C2); `required` checks payload only (C6) | **Blocked (C2, C6)** |
| **3. Intake view** | `useViewContract`/`submitBranch`/`cancel`/`isViewContractError`; `context.step.branches`; `File` upload (no base64) | `view-sdk-contracts-and-upload`, `branch-schema-artifact-validation` Slice 3 | Old `useViewSubmit` + `content_base64` (C5); no `step.branches` in context (C5); host adapter drops artifacts (C6); scaffold/fixture pre-v3 (M4) | **Blocked (C5)** |
| **4. Run + journal + artifact on disk** | One canonical run-scratch path; artifact under `…/steps/intake/spec/` | `run-scratch-path-normalize` | Code `.mrmr/dev/runs` (tutorial-aligned); normative `.mrmr.temp/runs` (H4) | **Tutorial works; normative drift (H4)** |
| **5. Handlers + agent prompt** | `on: step.opened::key`; default cwd/delivery; slim prompt with filled `murrmure_resolve_step`; `step:resolve` grant; artifact path | `handler-authoring-simplify`, `agent-prompt-protocol-simplify`, `agent-grant-onboarding` | `on::key` unsupported (C4); prompt has Session/Discovery/Resolve API + placeholder run_id (H2); `step:resolve` missing (C1); artifact path relative not absolute (H3); timeout ignored (H6) | **Blocked (C1, C4, H2)** |
| **6. Cleanup + commit** | `{{steps.build.output.*}}` resolves in shell command; `git commit` from build payload | **NONE** | Token resolves to empty (C3) | **Blocked (C3, uncovered)** |
| **Cross: space home + flow detail** | (Tutorial runs from space home row Run; flow detail not used) | `2026-07-13-shell-space-home-and-flow-viz` | Flat `FlowPreviewPage`, two overlapping home cards | **Not required for v3 (enhancement)** |

---

## 5. Unanswered decisions / questions

**Must resolve before implementation:**

1. **[C3] Step-output token chaining for shell handlers.** Should `{{steps.*.output.*}}` be wired into `shell_spawn` command resolution (using `exec_context.steps`), or should handlers read prior resolve payloads via `MURRMURE_INPUT`/`inputs.json` env only (and the tutorial switch to that)? If wired in, must it always `shellQuote`? This is the largest uncovered decision.
2. **[C2] Default-branch injection ordering.** Confirm defaults are injected *before* the `isStepContractStep` filter and that `branches` becomes optional in the Zod schema in the same slice. (Plan sketch is ambiguous.)
3. **[C1] Default grant capability set.** Confirm `step:resolve` is added; decide whether `action:invoke`/`gate:resolve` remain for the v3 "Tutorial 1 agent" (`agent-grant-onboarding` open Q4). Should this wait on Phase 0 or land immediately?
4. **[H1] Wizard space-naming.** Does `mrmr setup` adopt a single user-named space (`my-first-space`), or does the tutorial switch to `ui-sandbox`? Reconcile scaffold `space.yaml` slug + README. No plan owns this.
5. **[H3] Artifact path absolute vs relative.** Make the `{{murrmure.step.*.artifact.*.path}}` token absolute, or fix the tutorial to say "relative to space root"? Affects handler `cwd` override safety.
6. **[H4] Run-scratch root.** Confirm Option A (`.mrmr/dev/runs`) and retire `.mrmr.temp/runs` for run scratch in normative bridges; keep `.mrmr.temp/` only for cross-space inbox (or unify per Option C). Phase 0 ADR needed.
7. **[C6] Per-branch `artifact_slots` in catalog schema.** Add `artifact_slots` to `StepCatalogBranchSchema` (branch-scoped) and resolve against branch id, or keep step-level merge with a separate required-artifact list? (`branch-schema-artifact-validation` Phase 0 Q3.)
8. **[C5] Host vs direct resolve for artifact steps.** Require the view SDK direct `resolveStep`+upload path for artifact steps, or extend the postMessage host protocol to carry `artifacts_out`? (`view-sdk-contracts-and-upload` Phase 0 Q2; `branch-schema-artifact-validation` Phase 0 Q4.)
9. **[H6] Detached shell timeout.** Enforce `timeout_ms` for detached step-contract shells (and emit a journal event on timeout), or document that `complete: explicit`/detached handlers are not timeout-bound and the tutorial should drop `timeout_ms` from `dev_build`?
10. **[M5] v3-tutorial enforcement.** Add a contract test asserting the tutorial's manifest applies, handlers validate, and SDK imports resolve? Which package should own it?

**Product/UX:** Does the tutorial's `mrmr setup` wizard step list (Connect, Spaces, Init, Link, Apply, Skill, Grant) need to match the shipped wizard's step grouping (Connect, Spaces, Init+Link+Apply, Skill, Grant) exactly, or is the tutorial's finer-grained list aspirational?

**API/schema:** Should `HandlerOnSchema` accept `step.opened::{flow_ref}.{step_id}` as a string pattern (handler plan Q1: `::` vs `.` vs `/` — proposed `::`)? Should `complete: auto` apply to shell steps with default `completed`/`failed` (it does, via `maybeAutoResolveExecutorStepAfterAction`, but only when `entry.branches.completed` exists — depends on C2)?

**Security/authorization:** Minimal default capability set for a "Tutorial 1 agent" (C1/M6)? With `steps.*.output.*` wired to shell, ensure all substitutions are shell-quoted (C3 security note). Artifact filename sanitization already uses `basename(normalize(...))` and shell-quoting (`step-artifacts.ts:52,118`; `shell-spawn.ts:139`) — preserve.

**Observability:** Journal event for detached shell timeout (H6)? Journal already records `STEP_RESOLVED` with `payload` + `artifacts_out` (`step-resolve.ts:564-577`), so step outputs are auditable; but a hung detached handler has no terminal event until manual cancel.

**Federation:** `artifactPathsForInputs` uses `steps.{stepId}.artifact.{slot}.path` (plural `steps.`) (`step-artifacts.ts:180-192`) while `buildArtifactMurrmureBindings` uses `step.{stepId}.artifact.{slot}.path` (singular, under `murrmure.`). Two artifact-path namespaces coexist. Cross-space/cross-machine artifact path semantics are not reconciled by any plan — relevant to the north-star federation goal but not v3-blocking.

---

## 6. Risk register

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | Part 6 `cleanup` commits empty message (C3); tutorial end-to-end fails | Critical | High (certain today) | New plan: wire step-output tokens into shell commands (or switch tutorial to `MURRMURE_INPUT`); always shell-quote |
| R2 | Part 5 `build` resolve denied (C1); agent cannot finish | Critical | High | Add `step:resolve` to `AGENT_GRANT_CAPABILITIES` immediately; do not gate on Phase 0 |
| R3 | Parts 5/6 manifests fail apply (C2); `HANDLER_MISSING` on `write_spec`/`cleanup` | Critical | High | `step-default-branches`: optional `branches` + inject defaults before filter; update plan sketch |
| R4 | Parts 5/6 handlers fail validation/dispatch (C4) | Critical | High | `handler-authoring-simplify`: `on::key` schema + parse + index; ship before/with tutorial |
| R5 | Part 3 view uses unshipped SDK (C5) | Critical | High | `view-sdk-contracts-and-upload` + scaffold/fixture rework (M4) |
| R6 | File-only intake not enforced (C6); wrong run outcomes | Critical | High | `branch-schema-artifact-validation` Slices 1–2 |
| R7 | Wizard UX mismatch (H1) erodes trust at beat 1 | High | High | New wizard slice or update tutorial to `ui-sandbox`; reconcile scaffold |
| R8 | Prompt extract in Part 5 doesn't match live prompt (H2) | High | High | `agent-prompt-protocol-simplify` (APP-1..APP-4) |
| R9 | Normative bridges drift (H4, M2) → `murrmure-doc-sync` blocks shipping | High | High | `run-scratch-path-normalize` + per-plan same-PR bridge updates; coordinate bridge edits |
| R10 | Hub seed contracts contradict empty-first-boot promise (H5) | Medium | High | `hub-clean-slate-boot` |
| R11 | `timeout_ms` not enforced for detached handlers (H6); hung runs | Medium | Medium | New slice or doc change; journal timeout event |
| R12 | Relative artifact path breaks under `cwd` override (H3) | Medium | Low | Absolutify token or document relative-to-space-root |
| R13 | No v3-tutorial enforcement (M5); silent drift recurs | Medium | High | Add contract test; extend `docs-proof` |
| R14 | 5+ plans edit `step-contract.md` / scaffold concurrently (M2, M4) | Medium | Medium | Sequence bridge edits; single owner per PR |
| R15 | `flow-branch-api-simplify` treated as v3 dependency (M1) | Medium | Medium | Explicitly decouple; v3 needs only `step-default-branches` |
| R16 | Detached shell timeout + no journal event (H6) — observability | Medium | Medium | Emit `STEP_FAILED`/timeout event; surface in flowchart |

---

## 7. Recommended sequencing & done-gates (dependency-aware correction)

The objective is to preserve the tutorial as the target while making the plans implementable and sufficient. Sequencing is dependency-ordered; each slice carries its own doc-sync done-gate (bridge + tutorial + skill + `docs-proof` in the same PR, per `murrmure-doc-sync`).

### Phase A — Unblock the manifest / handler / resolve / view core (must be first)

**A1. `step-default-branches` (C2)** — *no dependencies*
- Add: `branches` optional in `StepContractManifestStepSchema`; inject default `completed`/`failed` **before** the `isStepContractStep` filter at `step-contract-compile.ts:456`; default `completed.next` from step order; default `failed.fail_run`.
- Done gate: `write_spec`/`cleanup` (branchless) compile into the catalog; `contract-keys.json` includes `my-dev-flow.write_spec` and `my-dev-flow.cleanup`; `build.completed` routes to `cleanup` without authored `next`; v2.2 manifests with explicit `branches` unchanged.
- **Plan correction:** update the plan's "Code changes" to explicitly relax the Zod schema and reorder the filter; the current sketch (`applyDefaultBranches(flatSteps)` before `compileCatalogEntries`) is insufficient because `flat` is derived from the already-filtered `contractSteps`.

**A2. `handler-authoring-simplify` (C4)** — *depends on A1 (handler `on::key` references catalog keys that A1 injects)*
- Add: `on: step.opened::{flow}.{step}` string pattern to `HandlerOnSchema`; parse in `buildHandlerIndex`; index by extracted key; `HANDLER_MISSING` from `on::key`; `contract_keys` prompt-only when `on::key` set; default `cwd: space_root`, `delivery: fail_fast`; legacy compat with deprecation warning.
- Done gate: tutorial Part 5/6 handlers `mrmr space apply --strict` clean; `write_spec_copy` dispatches on `write_spec` open; `dev_build` dispatches on `build` open; omitted `cwd` runs at space root; omitted `delivery` fails fast.

**A3. `branch-schema-artifact-validation` (C6)** — *depends on A1 (branch catalog entries)*
- Add: per-branch `artifact_slots` on `StepCatalogBranchSchema`; `partitionRequiredFields`; `validateRequiredArtifacts`; reject missing required artifact with `INVALID_ARTIFACTS`; lint `schema.required` artifact names must exist in branch `artifact_slots`.
- Done gate: `intake` resolve without `spec` returns 400; resolve with only `artifacts_out` (empty payload) succeeds on file-only branch; mixed `reviewer`+`spec` branch partitions correctly.

**A4. `agent-grant-onboarding` — `step:resolve` fix only (C1)** — *no dependencies; do not wait on Phase 0*
- Add `step:resolve` to `AGENT_GRANT_CAPABILITIES` (GO-4); decide `action:invoke` (open Q4).
- Done gate: a wizard-connected agent can call `murrmure_resolve_step` and `murrmure_space_status` end-to-end.
- **Plan correction:** pull the `step:resolve` fix out of Phase 0 as a fast-path slice; Phase 0 vocabulary/UX work can proceed in parallel but must not block this.

**A5. `view-sdk-contracts-and-upload` (C5) + `branch-schema-artifact-validation` Slice 3** — *depends on A3 (per-branch catalog slots) for context shape*
- Add: `ViewAppContext.step.branches` (schema + artifact_slots + `required`); `useViewContract`/`submitBranch`/`cancel`/`isViewContractError`; `File`/`Blob` upload (hide base64); `buildViewAppContext` maps `active_human_step.branches`; host adapter forwards `artifacts_out`.
- Done gate: tutorial Part 3 `App.tsx` runs as written; missing file shows inline `ViewContractError`; hub still rejects invalid resolve (server is sole enforcement).
- **Plan correction:** Slice 4 must also **rework the scaffold** (`templates/views/vite-react/src/App.tsx`, `dev/fixtures/intake.json`) so the fixture includes a `step` object with `branches` (not just `step.branches` inside a non-existent `step`), and the scaffold `App.tsx` uses the new API.

### Phase B — Prompt + token + path correctness

**B1. `agent-prompt-protocol-simplify` (H2)** — *depends on A1 (default branches in slice) and A2 (contract_keys prompt-only)*
- Slim `renderMurrmureProtocolEnvelope` (drop Session/MCP tools/Resolve API; gate Discovery on `contract_keys.length > 1`); `renderAgentStepContractMarkdown` emits full `murrmure_resolve_step({run_id, step_id, branch, payload})` with live ids + concrete payload fields.
- Done gate: Part 5 extract matches live prompt byte-for-byte (APP-4); no `## Session`.

**B2. NEW plan — step-output token chaining for shell handlers (C3)** — *depends on A2 (shell handler dispatch)*
- Decide canonical grammar: either wire `{{steps.*.output.*}}` (or a new `{{murrmure.steps.*.output.*}}`) into `resolveShellInvocation` using `exec_context.steps`, or switch the tutorial to read `MURRMURE_INPUT`/`inputs.json`. **Always shell-quote substituted values.** Reconcile the `{{murrmure.step.*}}` vs `{{steps.*}}` grammars in docs.
- Done gate: Part 6 `cleanup` `git commit -m "{{steps.build.output.commit_message}}"` populates from the `build` resolve payload; unit test asserts non-empty substitution; security test asserts shell quoting of malicious payload.
- **This is the most important plan addition.**

**B3. `run-scratch-path-normalize` (H4)** — *independent; coordinate with B2 (token path docs)*
- Phase 0 ADR Option A (`.mrmr/dev/runs`); single `runScratchPaths()` helper; update `artifacts.md`, `step-contract.md`, `philosophy.md`; `docs-proof` bans `.mrmr.temp/runs` in user docs.
- Done gate: tutorial Part 4 one `ls` path, no disclaimer; normative reconciled; `rg '.mrmr.temp/runs' packages/hub-core` → 0.

### Phase C — Wizard / UX / boot alignment

**C1. NEW slice — wizard space-naming UX (H1, M3)** — *independent*
- Either: `mrmr setup` single-space happy path with user-chosen slug (`my-first-space`), separate Init/Link/Apply confirms matching the tutorial; or: update the tutorial to use `ui-sandbox` and drop the `my-first-space`/slug-edit instructions. Reconcile scaffold `space.yaml` slug + README (remove manual `grant mint --label` instruction).
- Done gate: tutorial Part 1 wizard steps match observed behavior exactly; scaffold README aligns with wizard-only agent story.
- **Plan correction:** add this slice to `agent-grant-onboarding`'s doc scope or a new small plan; list the scaffold README as an allowed doc path.

**C2. `hub-clean-slate-boot` (H5, L1)** — *independent*
- Remove seed pin, `PACKAGE_CATALOG`, Desktop contracts copy; move fixture to `test-utils/`; audit stubs; archive/deprecate FDK in `current/index.md`.
- Done gate: first boot 0 pinned contracts; Desktop starts without `Resources/hub/contracts`; `brand-check` install → 404; Part 1 "No spaces linked yet" is true.

**C3. `desktop-mcp-bridge-exposure` (verify)** — *independent; low risk*
- Confirm MB-1..MB-7 (bundled bridge in `shared.json`, grant snippet uses bundled path, dev-mode parity).
- Done gate: fresh Desktop install → wizard grant → Cursor MCP → `murrmure_space_status` succeeds.

### Phase D — Ergonomics / enforcement (can follow v3)

- **D1. `2026-07-13-shell-space-home-and-flow-viz`** — enhancement; **not required for v3 beats** (the tutorial runs from the space-home row Run button, which exists today). Sequence after v3 is unblocked; cite it as the flow-detail experience improvement.
- **D2. `flow-branch-api-simplify`** — research; **decouple from v3**. v3 needs only `step-default-branches` (A1). Do not block v3 on `then`/`outcome`/`role` decisions.
- **D3. v3-tutorial enforcement (M5)** — add a contract test: the tutorial's `my-dev-flow` manifest applies under `--strict`; the Part 5/6 handlers validate; `import { useViewContract, submitBranch, cancel, isViewContractError } from "@murrmure/view-sdk/app"` resolves; the Part 5 prompt extract matches `renderAgentStepContractMarkdown` output. Extend `docs-proof` or add `packages/cli/test/tutorial-v3-contract.test.ts`.
- **D4. Timeout enforcement for detached shells (H6)** — new slice or doc change; emit journal event on timeout.
- **D5. Doc/naming cutover (L5, M2)** — rename `CHECKPOINT_VIEW_DIST_MISSING` to a step-contract-era code; coordinate all `step-contract.md` edits.

### Cross-cutting done-gates (every slice)

- Normative bridge + tutorial + skill updated in the **same PR** (`murrmure-doc-sync`).
- `docs-proof` and `strictLintFailures` green.
- `CHANGELOG.md` entry when operator-visible (grant defaults, wizard UX, first boot, paths).
- No new `.mrmr.temp/runs` in `packages/hub-core` after B3; no `fixtures/hub` in production packages after C2.

---

## 8. Highest-priority blockers

1. **[C3] No plan covers `{{steps.build.output.*}}` resolution in `shell_spawn` commands — Part 6 `cleanup` cannot commit.** (Uncovered; requires a new plan — §7 B2.)
2. **[C1] Wizard default grant missing `step:resolve` — Part 5 `build` resolve is rejected.** (Plan exists but not started and gated on Phase 0; pull the fix forward — §7 A4.)
3. **[C2] `branches` required + branchless steps dropped — Parts 5/6 manifests don't compile.** (Plan exists but the implementation sketch is incomplete re: filter/schema ordering — §7 A1.)
4. **[C4] `on: step.opened::key` unsupported — Parts 5/6 handlers fail apply and never dispatch.** (Plan exists, not started — §7 A2.)
5. **[C5] View SDK `useViewContract`/`submitBranch` unshipped — Part 3 view won't run.** (Plan exists, not started; scaffold/fixture also pre-v3 — §7 A5.)
6. **[C6] File-only `required: [spec]` not enforced — Part 4 Submit-without-file silently succeeds.** (Plan exists, not started — §7 A3.)
7. **[H1] Wizard creates `ui-sandbox`/`ui-production`, not `my-first-space` — Part 1 first beat mismatch.** (No plan — §7 C1.)

Resolving blockers 1–6 is necessary and (with the plan corrections above) sufficient to make the v3 tutorial runnable end-to-end. Blocker 7 is a UX/trust issue at the front door that should be fixed in the same slice window. `flow-branch-api-simplify` and the `2026-07-13` shell-viz plan are **not** on the v3 critical path and should be sequenced after.
