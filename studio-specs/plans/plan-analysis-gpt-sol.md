# Independent architecture review — Tutorial 1 v3 implementation plans

**Reviewer:** GPT-5.6 Sol  
**Date:** 2026-07-13  
**Scope:** `apps/docs/guide/tutorials/01-local-preview-review-v3/`, all active plans in `studio-specs/plans/`, relevant current normative specifications, implementation, schemas, tests, fixtures, CLI, Desktop, shell, View SDK, and execution runtime.

## Review stance and confidence

The v3 tutorial is treated as the intended experience and product-design target. Current code is evidence about feasibility and migration needs, not the authority to which the tutorial should be retrofitted. `studio-specs/current/` remains normative for shipped behavior; conflicts between it and the tutorial are called out explicitly and require deliberate spec amendments.

Finding labels:

- **Confirmed defect/conflict** — directly evidenced in repository text or code.
- **Plan defect** — a required change is absent, contradictory, or assigned ambiguously.
- **Decision required** — several valid designs exist and implementation should not choose implicitly.
- **Hypothesis/risk** — plausible failure requiring a test or design proof before being accepted as fact.

## Executive summary

The tutorial is a strong target: it keeps flows protocol-only, makes custom views the primary human surface, and leaves execution in space-owned handlers. The active plan set recognizes most individual deltas, but it is **not yet sufficient or safe to implement as written**. It lacks a single vertical-slice contract and contains several blockers that would leave the documented tutorial unusable even if every listed plan were completed literally.

The most important confirmed blockers are:

1. **The tutorial's trigger-only manifest does not parse.** The tutorial authors only `triggers:`, while `FlowManifestSchema` still requires `start:` and the compiler reads `manifest.start`. No active plan owns the canonical `triggers` cutover.
2. **The tutorial's shell handler commands are broken under current template quoting.** The executor already single-quotes replacement values, while the tutorial wraps placeholders in double quotes. The resulting command includes literal quote characters in paths/messages. The same executor also ignores `timeout_ms` for detached step-contract handlers.
3. **Default branches are not a contained schema change.** Steps without `branches` are currently excluded from step-contract detection, catalog compilation, IR generation, reachability analysis, and handler coverage. The default-branches plan names only part of this pipeline. It also leaves the tutorial's implicit role semantics in conflict with the normative bridge.
4. **The View SDK target has no safe, coherent transport contract.** Current views receive the shell token, are same-origin-capable, call mutation APIs directly, and fall back to host submission after errors. The two artifact/view plans overlap but do not settle least privilege, dev-mode behavior, duplicate resolve prevention, upload limits, or the public API names already used by the tutorial.
5. **There is no executable v3 tutorial acceptance fixture or progressive E2E.** The current docs-proof list excludes the entire v3 tutorial. Static prose checks would not catch the trigger failure, handler quoting failure, missing required artifact, or cleanup hazards.

The recommended correction is to create one tutorial-v3 architecture decision packet, then deliver a minimal end-to-end vertical slice in dependency order: canonical manifest normalization → compiled branch/role contract → handler execution semantics → branch-scoped artifact enforcement → secure view transport/SDK → onboarding and Desktop acceptance → operator visualization. Broader nested branch grammar research, recent-list polish, and exact prompt formatting should not gate the functional tutorial slice.

## Tutorial target distilled into testable behavior

The complete tutorial establishes the following target:

1. Fresh Desktop starts with no linked spaces and gives CLI-first onboarding instructions (`01-launch-and-create-space.md`, lines 5–20).
2. `mrmr setup` creates/selects a space, initializes an empty `.mrmr/`, links, applies, optionally installs skills, and connects an agent in one guided pass (Part 1, lines 45–81).
3. A trigger-only, protocol-only flow manifest is valid; `triggers.manual: true` permits Desktop/CLI manual start (Part 2, lines 19–58).
4. Linear steps may contain only `id` and `description`; the compiler supplies `completed` and `failed` routing (Part 2, lines 60–73).
5. Human intake uses explicit `continue`/`cancel` branches and a file-only contract expressed as `schema.required: [spec]` plus `artifact_slots.spec` (Part 2, lines 75–125).
6. A custom view receives the compiled per-branch contract, validates locally, uploads a `File`, resolves `continue`, and can resolve `cancel` without file validation (Part 3, lines 43–125).
7. `mrmr view dev` starts Vite, injects fixture contract context, and logs submissions without creating a real run (Part 3, lines 127–175).
8. Desktop starts a run, renders the custom view in the primary canvas, records journal transitions, and exposes the promoted artifact under one canonical gitignored run path (Part 4, lines 29–128).
9. Space handlers bind `step.opened::{flow}.{step}`, default to the linked space root and fail-fast delivery, and distinguish automatic shell completion from explicit agent completion (Part 5, lines 45–89).
10. The agent receives a concise Task plus generated protocol containing complete, live `murrmure_resolve_step` calls and returns schema-validated commit metadata (Part 5, lines 148–243).
11. Cleanup archives the spec and commits agent-produced subject/body, after which journal, repository, and run artifact all agree (Part 6, lines 36–104).

## Coverage and gap matrix

| Tutorial capability | Contributing active plan(s) | Evidence in current implementation/spec | Coverage judgment |
|---|---|---|---|
| Empty first boot and first-space onboarding | `hub-clean-slate-boot`; `shell-space-home-and-flow-viz` | Hub boot still pins `linear-demo-v2`; Desktop spec still lists `Resources/hub/contracts/` (`current/desktop/spec.md`, lines 51–61) | **Mostly covered**, but clean-state Desktop E2E and normative Desktop cleanup must be explicit |
| Bundled MCP bridge | `desktop-mcp-bridge-exposure` | Desktop menu emits bundled command or placeholder token (`apps/desktop/src/menus.ts`, lines 18–41); discovery contract exists | **Covered as verification**, but token provenance and packaged/dev parity remain gates |
| Setup wizard agent connection | `agent-grant-onboarding` | Wizard grant defaults omit `step:resolve` (`wizard/capabilities.ts`, lines 1–9) and only print a snippet (`commands/setup.ts`, lines 228–253) | **Covered directionally**, still blocked on Phase 0 and security profile |
| `triggers:`-only manifest | None | Schema requires `start:` (`contracts/src/flow/manifest.ts`, lines 114–125); compiler copies `manifest.start` (`flow-engine/compile.ts`, line 92) | **Uncovered blocker** |
| Default linear branches | `step-default-branches`; broader `flow-branch-api-simplify` | `branches` required in nested step type and omitted steps are not recognized by `isStepContractStep` (`step-contract.ts`, lines 58–77; compiler lines 89–101) | **Partially covered; plan scope is incomplete** |
| File-only branch contract | `branch-schema-artifact-validation` | Resolve validates all `required` names against payload and artifact slots are step-merged (`step-resolve.ts`, lines 63–75, 482–490; compiler lines 420–437) | **Covered directionally**, formal contract and upload security unresolved |
| Contract-aware View SDK | `view-sdk-contracts-and-upload`; overlapping Slice 3 above | Context has only `branch_names` and unused `contract` (`view-sdk/src/types.ts`, lines 17–22) | **Covered but duplicated and internally inconsistent** |
| View dev contract fixtures | `view-sdk-contracts-and-upload` | Scaffold fixture is gate-oriented and has no `step.branches` (`templates/.../intake.json`, lines 1–13) | **Covered**, but no dev transport/mode definition |
| Canonical run scratch path | `run-scratch-path-normalize` | Code uses `.mrmr/dev/runs` (`step-artifacts.ts`, lines 17–22); normative bridges use `.mrmr.temp/runs` (`current/bridges/step-contract.md`, lines 291–300) | **Covered**, Phase 0 must precede docs/tests |
| Simplified handler binding/defaults | `handler-authoring-simplify` | Current schema accepts only bare lifecycle and dispatch indexes `contract_keys` (`handler.ts`, lines 3–18; `parse-handlers.ts`, lines 44–61) | **Covered directionally**, but shell quoting, timeout, role, and canonical key identity are missing |
| Concise generated agent protocol | `agent-prompt-protocol-simplify` | Current renderer always emits Session/Discovery/Resolve sections and placeholder run id (`step-contract-slice.ts`, lines 131–208) | **Covered**, but depends on finalized branch/artifact contract |
| Archive + git commit | None beyond handler simplification | Tutorial command uses shared paths and `git add -A`; no v3 execution test exists | **Uncovered operational/security work** |
| Space home and flow visualization | `shell-space-home-and-flow-viz` | Current home duplicates local runnable flows; graph linearizes catalog (`space-home.ts`, lines 127–141; `graph.ts`, lines 170–233) | **Covered as operator UX**, but plan omits auth, pinning, cross-space identity, and payload details |
| Full tutorial acceptance | None | `docs-proof.test.ts` `TUTORIAL_PAGES` lists v1 and tutorials 2/3 but not v3 (lines 15–38); no `my-dev-flow` test exists | **Uncovered blocker** |

## Findings by severity

### Blocker 1 — `triggers:` is documented as canonical but is not executable

**Type:** Confirmed defect + missing plan.

The tutorial's first manifest contains `triggers.manual` and no `start` (`02-build-minimal-flow.md`, lines 19–28). The current Zod schema makes `start` required even though `triggers` is optional (`packages/contracts/src/flow/manifest.ts`, lines 114–125). `parseFlowManifest` performs no normalization before validation (`hub-core/src/index/parse-flow-manifest.ts`, lines 51–67), and IR compilation uses only `manifest.start` (`flow-engine/compile.ts`, line 92). Existing templates silently carry both keys, which is why current reference fixtures pass.

This also contradicts the shipped CLI/spec language that says `start:` is deprecated in favor of `triggers:` (`engine-capabilities.ts`, lines 141–169). It is not a tutorial-vs-code cosmetic mismatch: Part 3's first `mrmr space apply` cannot succeed.

**Required plan correction**

- Add an explicit manifest start-condition cutover slice.
- Make `triggers` canonical in the parsed model and compiled IR.
- Accept legacy `start` for a defined compatibility window; define behavior when both are present and disagree. Recommended: hard error on conflict, deterministic normalization when equal.
- Update `FlowManifest`, `FlowIr`, scheduler, event-start matching, preview payloads, templates, current specs, fixtures, skills, and docs-proof together.
- Add parse/compile/run tests for trigger-only, start-only legacy, equal dual-key, conflicting dual-key, and absent start conditions.

### Blocker 2 — Tutorial shell commands conflict with executor quoting, and step timeouts are not enforced

**Type:** Confirmed defect + plan defect.

The executor replaces every non-prompt `{{key}}` with `shellQuote(value)` (`packages/executors/src/shell-spawn.ts`, lines 125–140). The tutorial then wraps placeholders itself:

- `cp "{{murrmure.step.intake.artifact.spec.path}}" ...` (Part 5, lines 56–63)
- `git commit -m "{{steps.build.output.commit_message}}" ...` (Part 6, lines 45–54)

After substitution, the author-provided double quotes contain the executor's single-quoted string. The shell sees literal single quotes as part of the argument. The copy path will not name the promoted artifact, and commit messages will contain unintended quote characters. The handler-authoring plan repeats the same broken quoted token in its target example (lines 87–104).

The tutorial also says `timeout_ms` kills long commands (Part 5, lines 68–75). All step-contract shell invocations are detached because `shouldDetachShell` returns true whenever `context.step_contract` exists (`shell-spawn.ts`, lines 196–198). `runCommandDetached` has no timeout parameter or timer (lines 273–361). Thus the 10-second copy/cleanup and one-hour agent limits are not enforced.

The tutorial claims the artifact token expands to an absolute path (Part 5, lines 79–87), but promoted artifacts store a space-relative `.mrmr/dev/...` path and template resolution returns it unchanged (`step-artifacts.ts`, lines 124–141; `templates.ts`, lines 44–53). The command can validly use a relative path because cwd is the space root, but the documented contract is false.

**Required plan correction**

- Define one normative shell-template rule: placeholders represent complete shell arguments and authors must not quote them, or placeholders are raw strings and require explicit safe filters. The current automatic quoting model is safer; document and lint against `"{{...}}"`/`'{{...}}'`.
- Add exact resolved-command tests using the tutorial handlers, including spaces, apostrophes, `$()`, backticks, newlines, and leading dashes.
- Enforce `timeout_ms` in detached execution, with process-group termination and one terminal callback.
- State whether artifact `.path` is absolute or space-relative and make code, prompt bindings, specs, and tutorial agree.
- Decide whether multiline commands run under `/bin/sh`, `bash -lc`, or an explicit configured shell; do not leave this to implementation.

### Blocker 3 — Default branches require a full compiler-pipeline change and an explicit role decision

**Type:** Confirmed implementation constraint + incomplete plan + normative conflict.

The default-branches plan treats the change mainly as making `branches` optional and injecting catalog routes. Current behavior depends on branch presence at every stage:

- `StepContractManifestStep` requires `branches` (`contracts/src/entities/step-contract.ts`, lines 58–77).
- `isStepContractStep` returns true only for a non-empty branch map (`step-contract-compile.ts`, lines 89–101).
- The compiler filters top-level steps through that predicate (lines 443–470).
- IR conversion drops branchless steps from step-contract flattening (`flow-engine/compile.ts`, lines 20–33).
- Reachability and handler lint derive their universe from the compiled catalog.

Unless all those paths are changed, tutorial `write_spec` and `cleanup` become `wait`/missing steps rather than defaulted step contracts.

Role semantics are also unresolved. The normative step bridge says a step with neither view nor explicit agent role is `system` (`current/bridges/step-contract.md`, lines 162–170), while the compiler defaults such a step to `agent` (`step-contract-compile.ts`, lines 124–130). The tutorial omits role on `write_spec`, `build`, and `cleanup` but expects handler dispatch; `complete:auto` itself refuses non-agent entries (`step-resolve.ts`, lines 691–727).

The default-branches plan also contradicts itself: it says authored `completed` branches may omit `next` (lines 65–93), then lists custom schema/artifact slots as a reason to write explicit `next` (lines 95–100).

**Required plan correction**

- Define a step discriminator independent of authored branch presence. A top-level plain `{id, description}` step in a step-contract flow must compile as a step contract, not a legacy `wait`.
- Define how mixed legacy and unified steps are distinguished after `branches` becomes optional.
- Decide and normatively record the implicit role needed by the tutorial. Recommended minimal rule: `presentation.view` → human; otherwise a defaultable protocol step is executor-owned/agent for handler coverage. If `system` remains meaningful, require an explicit marker or a separate engine-owned step shape.
- Update schema, normalization, IR, catalog, graph, reachability, handler lint, runtime bootstrap, and strict-apply tests as one slice.
- Define empty `branches: {}` as an error, not an alias, to avoid accidental semantic changes.

### Blocker 4 — View mutation/auth/transport is internally contradictory

**Type:** Confirmed security conflict + plan defect + decision required.

Normative security treats user UI as untrusted script and says public view context excludes privileged tokens (`current/build-capability/09-security-execution-boundaries.md`, lines 8–16 and 47–72). Current step views receive the shell token in `ViewAppContext` (`view-sdk/src/types.ts`, lines 3–12), and the shell passes `getShellToken()` into the iframe (`shell-web/src/hooks/useStepCanvasBinding.tsx`, lines 39–46). The iframe enables `allow-same-origin` (`view-sdk/src/ViewHostFrame.tsx`, lines 33–40). The SDK then uses that token to upload and resolve directly (`view-sdk/src/app/provider.tsx`, lines 68–103).

This contradicts comments and docs calling it a read-only token (`view-sdk/src/types.ts`, lines 7–9; `apps/docs/reference/view-sdk.md`, lines 57–80). In practice, the tutorial requires `step:resolve`, so the token cannot be read-only. A malicious or compromised view can exfiltrate whatever shell token it receives and call any capability it carries.

Transport behavior is also unsafe:

- On any direct upload/resolve error, `useViewSubmit` posts a host submit and then rethrows (`provider.tsx`, lines 75–97). This can create a duplicate resolve after an ambiguous network response.
- The current host message shape cannot carry artifacts (`view-sdk/src/types.ts`, lines 42–47; shell adapter lines 7–29).
- Proposed dev fixtures include a fake `run_id`; a new direct `submitBranch` would try a real upload unless the context has an explicit dev mode/transport.
- Upload and resolve require broad `step:resolve`; only run-scoped tokens get an explicit run-id check (`hub-daemon/routes/runs/resolve-step.ts`, lines 35–43). The plan never defines a view-specific step/branch scope.

**Required plan correction**

Choose one canonical mutation path before SDK implementation:

1. **Recommended:** host-mediated upload/resolve. The view receives no mutation token. `submitBranch` sends structured payload/files to the trusted host, which performs upload and resolve with shell credentials. Dev host logs the same message without network mutation.
2. If direct API remains, mint a short-lived token constrained to one run, one step, allowed branches, and upload/resolve only; never expose the general shell token. Remove error fallback or use idempotency keys with a status-recovery protocol.

In either design:

- Add `context.mode: "production" | "dev"` and an explicit transport/version.
- Remove `allow-same-origin` unless there is a documented necessity and compensating isolation.
- Define origin/CSP behavior for hub-hosted and Vite dev views.
- Make upload+resolve idempotent as one SDK operation.
- Threat-model malicious views, token exfiltration, oversized uploads, stale contexts, replay, double-click, and run terminal races.

### Blocker 5 — No executable Tutorial 1 v3 conformance gate

**Type:** Confirmed test gap.

`packages/cli/test/docs-proof.test.ts` lists tutorial v1 and tutorials 2/3 but omits every v3 page (lines 15–38). There is no fixture or test using `my-dev-flow`, `spec-intake`, `write_spec_copy`, or `cleanup_archive_commit`. Existing reference tests validate a different, explicit-branch preview-review workflow.

This gap explains why the trigger-only parse failure and shell quoting mismatch can coexist with a tutorial described as the target.

**Required plan correction**

Create a dedicated `test-utils/spaces/tutorial-v3` fixture and a progressive acceptance suite:

- Parse/strict-apply each authored manifest stage from Parts 2, 3, 5, and 6.
- Scaffold and typecheck the exact Part 3 view API.
- Exercise dev-mode missing-file validation without network mutation.
- Start cancel and submit runs through HTTP/shell bindings.
- Upload and verify artifact bytes/path.
- Execute the exact copy and cleanup commands in an isolated temporary git repository.
- Verify journal ordering, branch payload, run lifecycle, archive, and commit subject/body.
- Add a clean Desktop/setup/MCP smoke gate where platform support allows; retain a documented manual packaged-app check for what cannot be automated.

### High 1 — Artifact requirements are overloaded onto JSON Schema without a complete lowering contract

**Type:** Decision required + plan gap.

The tutorial intentionally writes `schema.required: [spec]` while `spec` is an artifact slot, not a payload property. The artifact-validation plan proposes partitioning `required` names by matching slot keys. This preserves tutorial ergonomics but is not ordinary JSON Schema semantics:

- Generic validators such as AJV will look for `payload.spec`.
- A referenced schema string/ref cannot be partitioned without resolving the schema first.
- A payload property and artifact slot with the same name are ambiguous.
- `properties`, `additionalProperties`, nested requirements, `oneOf`, and conditional schemas have undefined interaction with files.
- Current catalog merges artifact slots across all branches, so branch-specific limits can overwrite one another (`step-contract-compile.ts`, lines 420–437).

**Recommended contract**

Keep the tutorial authoring sugar, but lower it at apply time into an explicit compiled branch contract:

```text
payload_schema
payload_required[]
artifact_slots{}
artifact_required[]
```

Reject payload-property/artifact-slot name collisions. Resolve schema refs at apply or reject artifact sugar with unresolved refs. Runtime, View SDK, prompt renderer, and graph meta must consume the compiled partition rather than reimplementing name matching.

Also specify duplicate `artifacts_out` slots, optional slots, empty files, MIME/extension policy, filename normalization, per-branch limits, and whether artifact order matters.

### High 2 — Upload enforcement occurs too late and leaves orphaned scratch data

**Type:** Confirmed implementation gap + plan gap.

The upload endpoint decodes the complete base64 body and writes it before it knows the branch or slot (`step-work-upload.ts`, lines 8–76). `max_bytes` is enforced only during promotion (`step-artifacts.ts`, lines 104–125). A client can therefore consume memory/disk far beyond a declared 1 MiB slot and then cancel or fail resolve. `Buffer.from(..., "base64")` is permissive, so the current `try/catch` is not a strict base64 validator.

Neither artifact plan defines cleanup for uploads abandoned after validation failure, cancel, timeout, or terminal run.

**Required changes**

- Include slot/branch in upload authorization or mint an upload intent from the active branch contract.
- Apply request and decoded-byte limits before/while writing; prefer streaming multipart or bounded decoding.
- Define scratch retention and cleanup on cancel, terminal run, failed resolve, and daemon restart.
- Add quotas and observability for upload rejection and cleanup.

### High 3 — The cleanup tutorial is not safe under concurrency or a dirty repository

**Type:** Missing requirements and plan.

The tutorial uses global mutable paths `specs/current/spec.md` and `specs/archive/spec.md`, then executes `git add -A`. Two runs in one space can overwrite/move each other's spec. Re-running replaces the same archive name. `git add -A` stages unrelated pre-existing work, deleted files, local credentials accidentally present in the repo, and changes from another concurrent agent. A no-op build makes `git commit` fail even if the workflow otherwise succeeded.

The north star requires sessions/runs to be the shared truth and explicitly designs for concurrent/cross-machine participation. A tutorial may be simple, but its command handler must not silently violate run isolation.

**Required decision**

- Either explicitly serialize this tutorial flow per space and fail a second concurrent run with a typed reason, or namespace repository staging/archive paths by run/spec identity.
- Require a clean worktree at run start or record a baseline and stage only an allowlist/pathspec.
- Decide whether the spec itself belongs in the commit and avoid `git add -A`.
- Validate commit subject/body constraints and handle “nothing to commit”.
- Record resulting commit SHA in cleanup output/journal; subject/body alone are insufficient observability.
- Test agent failure, user cancellation, dirty worktree, concurrent runs, existing archive, no-op build, missing git identity, and non-git directory.

### High 4 — The two view/artifact plans overlap ownership and can produce divergent contracts

**Type:** Plan defect.

`branch-schema-artifact-validation` Slice 3 and `view-sdk-contracts-and-upload` Slices 1–4 both claim:

- active-human-step branch contract exposure,
- shell context mapping,
- host artifact forwarding,
- View SDK types and validation,
- fixture changes.

They also propose slightly different public surfaces. The tutorial imports `isViewContractError` and destructures `submitBranch`; the View SDK plan says `useViewContract` returns `{ branches, validate, submit, cancel }` while separately showing a `submitBranch` function. The artifact plan names `validateResolveContract`; the SDK plan names `validateBranchResolve`.

**Required correction**

Assign ownership once:

- Artifact plan: authoring normalization, compiled branch contract, hub enforcement, upload authorization.
- View SDK plan: transport protocol, browser types/helpers, host integration, dev context, author API.
- One shared contract package/type generated from the compiled wire shape.
- Lock exact exports (`useViewContract`, `submitBranch`, `cancel`, `ViewContractError`, `isViewContractError`) with type tests using the tutorial source verbatim.

### High 5 — Plan sequencing is not dependency-safe

**Type:** Plan defect.

Nearly every relevant plan says Phase 0 is blocking, but the plans do not define a shared decision order. Examples:

- View context depends on branch-scoped artifact catalog.
- Prompt rendering depends on final required payload/artifact partition.
- Visualization depends on compiled default branches and final route semantics.
- Handler dispatch simplification depends on implicit role and canonical contract-key identity.
- Tutorial Part 1 agent success depends on both bundled bridge discovery and corrected grant capabilities.
- Docs already present target APIs before any implementation decision has shipped.

Implementing plans independently risks multiple incompatible catalog/context schemas and repeated tutorial rewrites.

**Required correction**

Create a shared dependency/index section in `studio-specs/plans/README.md` with one decision owner and frozen interfaces before slices start. The recommended sequence appears below.

### High 6 — Grant onboarding does not yet define least privilege or successful verification

**Type:** Confirmed defect + decision required.

The wizard profile omits `step:resolve`, so the Part 5 agent cannot complete `build` (`wizard/capabilities.ts`, lines 1–9). The onboarding plan correctly catches this. It does not yet settle:

- Why a default coding agent needs `gate:resolve` or `action:invoke` for this tutorial.
- Whether `flow:run`, `flow:read`, and `journal:read` are needed by the build agent.
- How a grant created before the flow is applied can be restricted by flow ACL.
- Whether setup actually writes config, activates the grant, or merely prints a snippet.
- What “verify” means after IDE reload and how setup resumes.
- Rotation/revocation and multiple agents per space.

The tutorial says the wizard is self-contained and follows through reload and verify (Part 1, lines 65–67), while current setup only prints a one-time token and snippet (`commands/setup.ts`, lines 228–253).

**Recommended minimal profile**

Use a named, versioned `tutorial-builder` profile with only `space:read`, `step:resolve`, and any proven discovery capability. Add capabilities only from an acceptance trace. Mint a separate short-lived per-dispatch resolve token for handler agents where possible; do not rely on the long-lived IDE grant for step completion.

### High 7 — Static/live graph plan lacks source-of-truth, authorization, and federation rules

**Type:** Plan defect + decision required.

The visualization plan says to build a graph from “manifest/IR/catalog” but these are not interchangeable. Defaults exist only after compilation; a live run must use its pinned digest, not the latest applied catalog. Handler bindings can change after run start. The plan does not say whether meta displays the binding at execution time or current configuration.

Additional gaps:

- `FlowPreviewPayload` currently has no `can_run`, but the plan requires a header Run button conditioned on it (`shell-client/src/types.ts`, lines 219–232).
- Dedupe “by `flow_id`” can collapse distinct origin/digest entries; current federation code itself uses `(flow_id, origin_space_id)` for uniqueness (`space-home.ts`, lines 114–124).
- `available_to_run` is built only from local `allFlows`, not the federated set (lines 127–141), so unioning the two current arrays does not satisfy the cross-space product model.
- Exposing handlers/branch schemas to `flow:read` actors may leak private space topology or sensitive schema metadata. Product spec requires sanitized flow preview.
- A branching work step is not necessarily a human gate. Rendering every branch as a “gate-like” diamond conflates work, decision, and human input.
- One shared fail node loses branch-specific failure reason unless edge labels and meta retain it.

**Required correction**

- Static preview source: latest compiled catalog + IR at one digest.
- Live graph source: run-pinned catalog/IR snapshot; include explicit “current config differs” metadata if handlers changed.
- Extend preview authorization payload with server-computed `can_run`, `can_preview`, redacted meta, and origin identity.
- Define a globally stable flow identity for list dedupe.
- Add federation/redaction tests and cross-space “available to run” behavior.
- Model a step node and a decision/fan-out node separately when needed; reserve human-gate semantics for human presentation.

### High 8 — Run-scratch path decision must include lifecycle, federation, and compatibility

**Type:** Normative conflict + plan gap.

The path-normalization plan correctly identifies `.mrmr.temp/runs` vs `.mrmr/dev/runs`. Option A is consistent with shipped code and tutorial. The decision cannot be only a spelling choice:

- `.mrmr.temp` is still normative for cross-space inbox/outbox and recovery (`current/bridges/artifacts.md`, lines 74–89).
- Step artifact paths are currently stored relative to the space root, while cross-space artifacts have transfer IDs and canonical hub copies.
- Old run records may still point at the deprecated tree.
- Cleanup/retention for `.mrmr/dev/runs` is unspecified.
- Federated/remote spaces have no local path, yet artifact tokens and tutorial handlers assume one.

The ADR should explicitly separate local run scratch from exchange artifacts, define retention and migration/read behavior, and state that this tutorial requires a local binding.

### High 9 — Handler binding identity and portability are underspecified

**Type:** Decision required.

The proposed `on: step.opened::my-dev-flow.build` uses manifest `name` as the flow ref. Current lint builds keys from `flow.manifest.name` (`handler-catalog-lint.ts`, lines 31–51), while normative handlers say `flow_ref` may be flow ID or graph-digest-qualified (`current/bridges/handlers.md`, lines 40–48). Names can collide across origins, and renaming a portable flow silently orphans handlers.

Before shipping `on::key`, define:

- local authoring alias versus canonical indexed key,
- collision behavior across origin spaces,
- rename migration/lint,
- how remote/federated handlers bind,
- whether graph digest is part of execution binding,
- what key is shown in prompts, status, and visualization.

### Medium 1 — Broad branch API research should not gate Tutorial 1

`flow-branch-api-simplify` attempts to unify nested and top-level routing, role, branch structure, and schema versioning. Only default top-level branches are necessary for the v3 tutorial. A full v3 grammar redesign increases migration risk and conflicts with the tutorial's currently documented explicit `next`/`fail_run` model.

Recommendation: land a narrowly specified normalization layer that preserves existing explicit v2.2 manifests and the tutorial syntax. Defer unified nested grammar until the minimal tutorial E2E is stable. If a later authoring version is chosen, use a real `apiVersion` migration rather than silently changing `murrmure.flow/v1`.

### Medium 2 — Prompt formatting plan is useful but not the first functional dependency

The prompt plan improves agent comprehension, but the exact removal of Session and Discovery blocks is not required to make the tutorial run. More important prerequisites are live IDs, correct role/branch contracts, artifact-vs-payload distinction, cancellation behavior, and a valid resolve grant.

The renderer must not label artifact requirements as payload requirements. Add prompt snapshot tests only after the compiled branch contract is frozen. Exact prose should not be a wire contract unless versioned.

### Medium 3 — Shell space-home polish is coupled too tightly to graph correctness

The July 13 plan combines:

- home payload migration,
- list dedupe,
- scroll styling,
- a new static graph API,
- live graph branch semantics,
- authorization-sensitive handler metadata.

These have different risk and dependency profiles. Recent-list scrolling is independent and not required by the tutorial. Unified list/home copy helps Part 1/4, while static graph is an observability deliverable. Step meta is a security-sensitive later slice.

Split into separate changes so home polish cannot mask or delay graph correctness.

### Medium 4 — Clean-slate boot is relevant but over-bundled

Removing production seed contracts is necessary for the Part 1 empty state. Deleting `PACKAGE_CATALOG`, moving all fixtures, auditing bootstrap tokens, and cleaning stale FDK specs are broader repository hygiene. Keep the fresh-boot behavioral gate atomic; follow with fixture/catalog cleanup if needed.

The plan must update `current/desktop/spec.md`, which still normatively bundles seed contracts, and prove both a new data directory and an existing upgraded data directory. “Zero pinned contracts” should not delete user-applied contracts on restart.

### Medium 5 — Current specs are internally stale beyond the plans' named paths

Examples:

- `current/cli/spec.md` says `space init` creates legacy action/executor/hook stubs (lines 229–237), while `space-scaffold.ts` and `templates/space/manifest.json` now create only handlers, space metadata, and dev gitignore.
- `current/product/spec.md` and `current/bridges/step-contract.md` still require explicit branches and dual `start`/`triggers` examples.
- `apps/docs/reference/view-sdk.md` documents gate/free-shape submit and a read-only token, not the target step branch contract.
- `current/desktop/spec.md` still lists bundled seed contracts.

Each implementation slice needs a broader doc-sync inventory than currently listed. The workspace documentation rule makes these blocking, not cleanup for later.

## Plan-by-plan scope assessment

| Plan | Assessment | Required correction |
|---|---|---|
| `hub-clean-slate-boot` | Relevant to Part 1; mostly implementable | Split fresh-boot gate from broad stub cleanup; include upgrade preservation and Desktop spec |
| `desktop-mcp-bridge-exposure` | Necessary verification | Clarify placeholder token vs minted grant snippet; test dev, packaged macOS, path-with-spaces, app relocation |
| `agent-grant-onboarding` | Necessary and correctly research-first | Decide least-privilege profile, write/activate/verify flow, reload recovery, rotation, multiple agents |
| `flow-branch-api-simplify` | Over-broad for v3 | Defer nested grammar redesign; do not block minimal defaults |
| `step-default-branches` | Necessary but incomplete | Expand to detection, normalization, IR, role, lint, graph, handler coverage, compatibility |
| `handler-authoring-simplify` | Necessary but incomplete | Add shell quoting, timeout, process cancellation, key identity, exact tutorial command tests |
| `agent-prompt-protocol-simplify` | Helpful, depends on contracts | Sequence after compiled branch/artifact contract and grant path |
| `branch-schema-artifact-validation` | Necessary | Own compiler/hub enforcement only; formalize lowered contract and bounded upload |
| `view-sdk-contracts-and-upload` | Necessary | Own secure host/SDK transport; lock public API; define dev mode and idempotency |
| `run-scratch-path-normalize` | Necessary normative reconciliation | Add retention, migration/read policy, local-vs-exchange boundary, remote-space behavior |
| `shell-space-home-and-flow-viz` | Valuable operator UX, partly tutorial-relevant | Split home, graph, and meta; add pinning, auth/redaction, federation, identity |
| **Missing: start-condition cutover** | Blocking | Add plan for canonical `triggers` normalization and legacy `start` migration |
| **Missing: tutorial cleanup safety** | Blocking for Part 6 | Add isolated staging/concurrency/git contract |
| **Missing: v3 conformance/E2E** | Blocking | Add exact progressive fixture and automated/manual acceptance |

## Unresolved decisions and questions

### Product and UX

1. Is a cancelled tutorial run normatively `failed` or `cancelled`? The tutorial says failed; preserve that unless the product explicitly distinguishes user abort from failure.
2. Should a second run of this tutorial be allowed while one is active in the same space? If yes, repository paths must be per-run; if no, define lock UX.
3. Is the Part 6 commit a pedagogical example only, or a supported safe default? The current `git add -A` behavior should not be blessed as production-safe.
4. Does setup write MCP config automatically, offer a copy step, or only print? How does it verify after IDE reload without losing wizard state?
5. Should flow detail visualization be required before the first successful run, or can it land after the core tutorial path?

### Flow/API/schema

6. What is the canonical start field and conflict rule for dual `start` + `triggers`?
7. What makes a branchless step a unified step contract rather than a legacy `wait`?
8. What is the implicit role of a plain linear step, and how does that agree with handler coverage and `complete:auto`?
9. Is `schema.required + artifact_slots` only authoring sugar? What exact compiled/wire contract do runtime and SDK consume?
10. How are schema refs resolved before artifact/payload partitioning?
11. Is `next` inferred only for `completed`, for any non-failure branch, or by branch-name convention? The rule must not accidentally route `cancel`.
12. What is the stable canonical contract key across rename, origin space, digest, and federation?
13. Are default branches materialized into the catalog and graph as authored-equivalent data? They should be.

### View SDK and security

14. Is host-mediated mutation canonical, or does each view receive a dedicated run-step token?
15. Why is `allow-same-origin` required for hub-served views, and what prevents shell-token theft?
16. What is the versioned postMessage shape for payload, `File` objects, progress, errors, cancellation, and idempotency?
17. How does `submitBranch` behave in dev mode, after an ambiguous network failure, and after the run becomes terminal?
18. Does client validation implement full JSON Schema or only compiled required/type constraints? How is parity tested?
19. What are upload size, count, total-run quota, MIME, filename, and cleanup limits?
20. Are field-level hub errors safe to expose to untrusted views without leaking paths or authorization details?

### Handler execution and operations

21. Are template placeholders always shell-quoted full arguments? What syntax passes raw/script fragments, if any?
22. Which shell executes multiline blocks, and is behavior portable to supported hosts?
23. How are detached process trees timed out and killed on run failure/cancel/Desktop exit?
24. What does `complete:auto` do when stdout is non-JSON, when resolve validation fails, or when callback delivery is retried?
25. Are artifact path bindings absolute or relative? What happens for remote bindings?
26. How are handler logs, command audit, exit status, and timeout visible in the journal without leaking prompts/tokens?

### Authorization and grants

27. What exact capabilities are required by the v3 build agent, proven by tool-to-capability tests?
28. Can long-lived IDE grants resolve any active step in a space? Should normal handler completion use only short-lived per-dispatch tokens?
29. How are flow ACLs applied when the grant is minted before the tutorial flow exists?
30. Does Desktop “Copy MCP config” intentionally use a token placeholder, and how does the user associate it with the wizard-minted grant?

### Observability, compatibility, and federation

31. Is live graph data read from a run-pinned catalog snapshot? If not, how is `flow_digest` immutability honored?
32. Does step meta show current handlers or handlers used when the step opened?
33. What fields are redacted for `flow:read` without `space:read`, especially cross-space handlers and schemas?
34. What identity deduplicates flows across spaces without collapsing same-name/same-ID distinct origins?
35. How long are legacy `start`, handler `on + contract_keys`, explicit branches, and old scratch paths accepted?
36. Are old run artifacts readable after path cutover, and what is the retention/GC policy?

## Risk register

| Risk | Severity | Likelihood | Evidence / trigger | Mitigation |
|---|---|---:|---|---|
| Tutorial manifest rejected on first apply | Critical | Certain | Required `start` schema; tutorial omits it | Canonical trigger normalization + exact parse test |
| Copy/cleanup shell arguments contain literal quotes | Critical | High | Executor quotes values; tutorial quotes placeholders | Normative template rule, lint, resolved-command E2E |
| Untrusted view exfiltrates shell/admin token | Critical | High | Token posted to same-origin-capable iframe | Host-mediated mutation or dedicated run-step token; remove general token |
| Missing artifact resolve succeeds or client/server disagree | High | Certain today | Payload-only required validation | Compiled payload/artifact partition + hub enforcement |
| Oversized upload exhausts memory/disk before rejection | High | Medium | Full base64 decode/write before max check | Bounded streaming/upload intent and quotas |
| Duplicate resolve after direct-call error fallback | High | Medium | SDK posts host fallback then throws | One canonical path + idempotency/status recovery |
| Branchless steps disappear or compile as waits | Critical | High if plan implemented narrowly | Branch-presence discriminator throughout pipeline | Normalize before detection/IR/catalog/lint |
| Plain steps become `system` and never dispatch/auto-complete | High | High | Normative/code role conflict | Explicit role decision and conformance tests |
| Agent handler never times out | High | High | Detached execution bypasses timeout | Process-group timeout/cancel implementation |
| Concurrent runs corrupt `specs/current` or archive | High | Medium | Shared fixed paths | Per-run namespace or enforced space lock |
| Cleanup commits unrelated/secret files | Critical | Medium | `git add -A` | Clean baseline + path allowlist + explicit staged diff |
| Live graph shows latest flow, not pinned run | High | Medium | Plan source ambiguous | Persist/retrieve catalog by run digest |
| Cross-space flows disappear/collapse in unified list | High | Medium | Local-only available list; dedupe by flow_id | Canonical origin identity + federation tests |
| Handler/schema meta leaks private-space details | High | Medium | Proposed flow-read preview metadata | Server redaction and capability matrix tests |
| Plans land incompatible View contract types | High | High | Duplicate ownership and API names | One owner/shared type and dependency gates |
| Old manifests break silently under defaults | High | Medium | Same `apiVersion`, inferred semantics | Dual-read fixtures, explicit normalization, migration lint |
| Fresh-boot cleanup deletes existing user pins | Critical | Low–Medium | Clean-slate changes startup logic | New-vs-existing DB migration tests; never truncate user state |
| Packaged MCP bridge path breaks after app move/update | High | Medium | Absolute app-bundle path in discovery | Refresh discovery each launch; packaged relocation smoke |
| Tutorial prose drifts again | High | High | V3 absent from docs-proof | Exact v3 fixture/source assertions and docs gates |

## Recommended correction and dependency-aware sequencing

### Gate 0 — Freeze the tutorial-v3 architecture contract

Before implementation, resolve one cross-plan decision document covering:

1. `triggers` normalization and `start` compatibility.
2. Plain-step identity, default branches, role derivation, and route inference.
3. Lowered payload/artifact branch contract.
4. Canonical handler key and shell-template quoting/execution semantics.
5. View mutation security and postMessage/API transport.
6. Canonical run scratch root and retention.
7. Tutorial repository isolation/commit policy.

**Done gate:** no relevant Phase 0 question remains unanswered or implicitly delegated to code review; current normative files to amend are enumerated.

### Sequence 1 — Manifest and catalog foundation

1. Implement `triggers` canonical normalization with legacy `start` compatibility.
2. Normalize all plain linear steps before step-contract detection.
3. Inject default branches and resolve implicit role.
4. Lower author branch schemas into explicit payload/artifact requirements.
5. Compile branch-scoped artifact slots and routes into one versioned catalog shape.

**Done gates**

- Exact Part 2 manifest parses with no `start`.
- Exact Part 5/6 branchless steps compile and appear in IR/catalog/graph.
- `intake.continue`, `write_spec.completed/failed`, `build.completed/failed`, and `cleanup.completed/failed` have expected routes.
- Legacy explicit v2.2 fixtures compile byte-for-semantics-equivalently.
- Current step-contract, flow-engine, product, and CLI specs are synchronized.

### Sequence 2 — Handler runtime correctness

1. Add `on::key` dual-read parsing and canonical key resolution.
2. Set and test cwd/delivery defaults.
3. Define placeholder quoting and add quoted-placeholder lint.
4. Enforce timeout/cancel for detached process groups.
5. Ensure `complete:auto` routes success/failure exactly once and surfaces validation errors.
6. Make artifact path contract explicit.

**Done gates**

- Exact Part 5 copy handler runs successfully against a path containing spaces/apostrophes.
- Exact Part 6 commit messages preserve content without command injection or extra quotes.
- 10-second timeout test terminates the process tree and fails the run once.
- Legacy handler shape still dispatches during the declared migration window.
- Handler bridge, author skill, tutorial, reference, and changelog are synchronized.

### Sequence 3 — Artifact enforcement and lifecycle

1. Enforce branch-specific required artifacts at resolve.
2. Authorize and bound uploads against the active branch/slot.
3. Add strict filename/base64/multipart handling and quotas.
4. Promote atomically and clean abandoned scratch.
5. Normalize path helper/retention according to the path ADR.

**Done gates**

- Missing `spec` is rejected server-side without resolving/failing the run.
- A valid file-only resolve with empty payload succeeds.
- Oversized upload is rejected before unbounded disk write.
- Cancel leaves no promoted artifact and cleanup policy handles scratch.
- Artifact bytes, journal manifest, token path, and on-disk path agree.

### Sequence 4 — Secure View SDK vertical slice

1. Implement the chosen host/direct transport with least privilege.
2. Expose the versioned compiled branch contract.
3. Ship exact tutorial APIs and type guard.
4. Add explicit dev mode using the same validation path and no real mutation.
5. Remove ambiguous fallback/double resolve.
6. Update scaffold fixtures and SDK reference.

**Done gates**

- The exact tutorial `App.tsx` typechecks without local base64 helper.
- Missing file produces `ViewContractError`; no upload/resolve request occurs.
- Submit uploads/promotes one file and resolves `continue` once.
- Cancel skips continue-branch file validation and resolves `cancel` once.
- Dev route logs the same branch/files intent without contacting a real run.
- The iframe never receives a general shell/admin token.
- Malicious-view security tests cover token access, origin spoofing, replay, oversized files, and arbitrary branch names.

### Sequence 5 — Onboarding and bridge

1. Complete bundled bridge verification in dev and packaged Desktop.
2. Introduce the least-privilege default agent profile.
3. Make setup write/activate or clearly hand off one config path.
4. Add resumable post-reload verification using `murrmure_space_status` and a capability check for `murrmure_resolve_step`.
5. Complete clean-slate first boot without touching upgraded user state.

**Done gates**

- Fresh Desktop data dir shows no spaces/phantom flows.
- Tutorial setup with “No examples” creates exactly the documented tree.
- Agent config uses the bundled bridge path and a non-bootstrap grant.
- Verification proves the tools/capabilities required by Part 5.
- Revocation/rotation and second-agent behavior are documented.

### Sequence 6 — Safe cleanup and full v3 E2E

1. Replace global `spec.md` staging/archive assumptions or enforce a visible run lock.
2. Stage only workflow-owned files against a recorded baseline.
3. Return and journal commit SHA.
4. Execute the progressive tutorial acceptance suite.

**Done gates**

- Cancel run fails as designed with no repository mutation.
- Intake-only run succeeds and preserves artifact.
- Copy/build run succeeds with schema-validated payload.
- Full run archives the right run's spec and commits only intended changes.
- Dirty, concurrent, no-op, missing identity, and retry cases have deterministic typed outcomes.
- V3 pages are in docs-proof and all examples are generated/checked against executable fixtures.

### Sequence 7 — Operator shell improvements

Deliver independently:

1. Unified home list with canonical flow identity and cross-space authorization.
2. Bounded recent list.
3. Static compiled-catalog graph + header Run authorization.
4. Live run-pinned branch graph.
5. Redacted step meta with historical/current distinction.

**Done gates**

- Home list has no duplicates or missing authorized remote flows.
- Preview graph reflects defaulted and explicit branches identically.
- Live graph remains stable after flow/handler re-apply.
- Run button is server-authorized.
- Private handler/schema details are redacted under the documented capability matrix.

## Required documentation and migration gates

Every behavioral slice must update, as applicable:

- Normative: `studio-specs/current/product/spec.md`, `bridges/step-contract.md`, `bridges/handlers.md`, `bridges/artifacts.md`, `cli/spec.md`, `desktop/spec.md`, `shell/spec.md`.
- User docs: all six v3 chapters, `creating-flows.md`, `space-handlers.md`, `agents-mcp.md`, `reference/view-sdk.md`, troubleshooting/known gaps.
- Skills: developer flow/handler authoring and agent resolve protocol.
- Scaffolds/fixtures: CLI space/flow/view templates and `test-utils/spaces/tutorial-v3`.
- Enforcement: docs-proof, schema/compile compatibility fixtures, exact tutorial source/type tests, security tests, packaged Desktop smoke.
- Operator communication: `CHANGELOG.md` for start-condition, handler syntax, scratch path, grant profile, and shell changes.

Compatibility must be stated in releases, not inferred:

- `start` legacy read duration and conflict behavior.
- Explicit branch manifests and empty branch maps.
- Legacy handler `on` + `contract_keys`.
- Old run scratch paths and retained historical runs.
- Existing grant capability sets.
- Existing View SDK submit/postMessage clients.
- Flow preview/home payload versioning.

## Highest-priority blockers

1. Add and decide the missing `triggers` → compiled-start cutover.
2. Fix/define shell placeholder quoting and detached timeout semantics.
3. Expand default-branch work to step detection, role, IR, lint, graph, and runtime.
4. Choose a least-privilege View mutation/upload transport and eliminate ambiguous fallback.
5. Add an exact progressive Tutorial 1 v3 fixture and E2E gate.
6. Define safe run isolation and git staging for Part 6 cleanup.
