# Plan review — Testability

**Reviewer:** testability
**Plan:** 2026-07-09-space-handlers-contract-keys-plan.md
**Date:** 2026-07-09
**Verdict:** PASS WITH AMENDMENTS

## Executive summary

The plan names the right test surfaces (a `## Test file map` at L989-L1006 with 13 entries, per-phase "Acceptance (CI)" blocks at L831/L852/L872/L892, and a manual sign-off list at L940-L947), and the target architecture is well-aligned to the north star. But as a *testability* document it has three structural weaknesses: (1) the acceptance criteria mix verifiable grep/unit gates with vague verbs ("passes", "works", "integration: open write_spec → … advances run") that a review subagent cannot turn into a binary PASS/FAIL; (2) the test file map has one path that will **never execute** under the repo's vitest project config (`executors/test/invoke-shell-prompt.test.ts`, see §"Missing tests") and omits several commands/behaviors the plan itself introduces (`space contracts`, `space handlers coverage`, `murrmure_space_health`, `murrmure_get_run_context`, shell-token injection, hooks→handler parity); and (3) the horizontal phase order delays the first end-to-end assertionable behavior until Phase 3, and Phase 5 has **no acceptance block at all** (L900-L907). The vertical re-slice (VS-0..VS-6) from the companion review fixes the ordering but inherits the same vague-gate problem unless each slice is given concrete test commands and binary assertions. None of this requires changing the architecture — it requires amending the plan's test/acceptance wording and adding ~10 explicit test specs. Open questions Q1, Q3, Q4, Q6, Q7 (L1011-L1017) each block at least one deterministic test and must become VS-0 entry gates, not trailing notes.

Conventions verified against the repo (used throughout this review): **vitest 3.2.4**, node env, `pool: "forks"`, multi-project root config (`vitest.config.ts`); `sharedTestConfig.include = ["test/**/*.test.ts"]` (`vitest.shared.ts`). Unit tests use `MemoryStudioPersistence` + `vi.fn()` journal + fixed `clock` (see `hub-core/test/unit/flow-engine/step-resolve.test.ts`). HTTP/integration tests spin a real hub on `port: 0` via `startHubTestFixtureAsync` (`hub-daemon/test/helpers/space-fixture.ts`) — deterministic, no live hub. CLI tests use `mkdtempSync` + `vi.stubGlobal("fetch", …)` + `process.exit` mock (see `cli/test/space-apply.test.ts`). Grep-style invariants are encoded **as vitest tests**, not shell `rg` (see `cli/test/docs-proof.test.ts`). CI (`.github/workflows/ci.yml`) runs `pnpm test` (all projects), then `pnpm test:acceptance` (`@murrmure/hub-daemon` + `@murrmure/cli` only — **note: this excludes `@murrmure/hub-core`**), then `pnpm check:docs-proof`.

## Test coverage matrix

Mapping plan phases (L804-L908) to the companion review's VS-0..VS-6, against what the plan currently specifies.

| Slice / Phase | Automated tests in plan | Manual tests in plan | Gap? |
|---|---|---|---|
| Phase 0 — spec/plan hygiene (L806-L815) | None ("no code changes required") | None | **No** (non-code phase) — but VS-0 entry gates (open questions) are untestable until decided |
| Phase 1 / VS-4 — `.mrmr/` cutover + briefing removal (L819-L837) | `rg` grep gate (L833); delete `space-briefing.test.ts` (L834); step-contract path tests use `.mrmr/dev/runs/` (L835); `space-link-file.ts` reads `link:` (L836) | Manual #4 `murrmuretuto` single `.mrmr/` layout (L945) | **Yes** — grep gate is shell, not vitest; `conformance/shell-spawn.test.ts` briefing-prepend assertions (L60-L79 of that file) will break and aren't in map; no wake-relay path test; `link.host` (Q1) unresolved |
| Phase 2 / VS-1+VS-2 — handler schema + apply index (L840-L857) | `handlers-parse`, `handler-catalog-lint`, `contracts-codegen`, `bindings-parse` (L854-L855, L1000-L1002) | None per-phase | **Yes** — no dispatch test reachable this phase under horizontal order; codegen bundles `.d.ts` + schema + keys (should split); no `space contracts` / `handlers coverage` CLI test; no human-key scope-only test |
| Phase 3 / VS-1..VS-3 — engine dispatch cutover (L860-L878) | `preview-review-v2-example.test.ts` handlers-only (L874); "integration: open write_spec → … advances" (L875, vague); `step-resolve-cli.test.ts` (L876, L1004); no `executor.action` grep in examples (L877) | Manual #1 per-step policy (L942); Manual #2 subgraph-owner (L943) | **Yes** — L875 is not a binary assertion; no `handler-dispatch.test.ts` listed for this phase (it's in the map at L995 but not in Phase 3 acceptance); no `complete: auto` runtime-guard test; no token-injection test; hooks→handler parity test missing |
| Phase 4 / VS-6 — flow v3 + docs/skills (L881-L897) | Tutorial 1 E2E (L894, vague); alternate-policy fixture (L895, vague); `space-doctor-skills.test.ts` (L896, L1001); `docs-proof` bans `executor.action` (L890) | Manual #1, #2, #5 (L942-L943, L946) | **Yes** — L894/L895 not binary; no legacy-skill doctor codes (`SKILL_LEGACY_*`) test; `docs-proof` extension not specified |
| Phase 5 / VS-6 — doctor hardening + MCP health (L900-L907) | **None — no acceptance block** | None | **Critical** — `murrmure_space_health`, `murrmure_get_run_context`, legacy parser deletion have zero test specs |
| Cross-cutting (federation, events, observability) | `list-handlers.test.ts` (L1005) | Manual #3 daily-brief event handler (L944) | **Yes** — no worker+catalog bindings E2E; no event→handler→journal test; `catalog-schema.test.ts` exact tool-name list will break when `murrmure_list_handlers` is added |

## Per-slice test specifications

For each slice I give: automated (file path, assertions, fixtures), manual (numbered steps + expected outcome), and the review-subagent PASS criteria (binary). File paths follow repo conventions; `hub-core` and `hub-daemon` use default `test/**/*.test.ts`; **`executors` uses `conformance/**/*.test.ts` only** (root `vitest.config.ts` L28-L30) — any executors test must live under `conformance/`.

---

### VS-0 — Decision lock + orchestration scaffold (plan Phase 0, L806-L815; open questions L1009-L1017)

This slice produces no code, so "tests" are **entry-gate checks** that must be green before VS-1 starts. Each open question maps to a testability blocker.

- **Automated (entry gates, not vitest):**
  - `studio-specs/current/bridges/handlers.md` exists and contains a "Decisions" section with statuses for Q1, Q3, Q4, Q6, Q7. Assertion (vitest, new): `cli/test/handlers-decision-record.test.ts` — `existsSync(bridge)` is true and the file contains `Q1:`, `Q3:`, `Q4:`, `Q6:`, `Q7:` each followed by `DECIDED:`. This makes "decisions locked" a binary gate instead of a prose claim.
- **Manual:**
  1. Open `studio-specs/current/bridges/handlers.md`; confirm each of Q1/Q3/Q4/Q6/Q7 has a `DECIDED:` line with a concrete resolution (not "TBD").
  2. Expected outcome: zero `TBD` / `OPEN` markers for those five IDs.
- **Review-subagent PASS criteria:**
  - `handlers-decision-record.test.ts` is green (`pnpm --filter @murrmure/cli test handlers-decision-record`).
  - No VS-1 PR may merge until Q3 (human keys), Q6 (dispatch token), Q7 (cli branch validation) are `DECIDED` — these directly determine assertions in VS-1/VS-3.

---

### VS-1 — Minimal handler E2E, single agent step (plan Phase 2+3 subset, L844-L849 + L864 + L874-L876)

- **Automated:**
  - `packages/hub-core/test/unit/index/handlers-parse.test.ts` (in map L993) — asserts:
    - `parseHandlers(yaml)` returns `{ handlers: [{ id, contract_keys, on, type, complete }] }` for a single-key `shell_spawn` handler.
    - Rejects a handler missing `contract_keys` on `on: step.opened` with code `HANDLER_MISSING_KEY`.
    - Accepts `contract_keys: []` for `on.event` handler (event-only).
    - Fixture: inline YAML string (match `space-apply.test.ts` `writeFileSync` style).
  - `packages/hub-core/test/unit/index/handler-catalog-lint.test.ts` (in map L994) — asserts lint codes against a compiled `StepContractCatalog` + `HandlerIndex`:
    - uncovered agent step → `STEP_UNCOVERED` (strict: error).
    - handler key not in catalog → `HANDLER_ORPHAN_KEY` (warning).
    - two handlers matching same key → `HANDLER_KEY_CONFLICT` (error).
    - Fixture: inline `LINEAR_MANIFEST` (reuse shape from `step-contract-slice.test.ts` L16-L70) + inline handlers YAML.
  - `packages/hub-core/test/unit/flow-engine/handler-dispatch.test.ts` (in map L995) — **the missing Phase-3 acceptance test**; asserts the core invariant:
    - Seed run via `MemoryStudioPersistence` + `compileStepContractCatalog` + `compileFlowIr` (copy `seedRun` pattern from `step-resolve.test.ts` L11-L94).
    - Emit `mrmr.step.opened` for `write_spec` (role=agent) → exactly one handler with `preview-review.write_spec` in `contract_keys` is dispatched; `dispatchSteps` mock called once with that handler id.
    - **Human-step boundary (north star §5/§6):** open a `role: human` step whose key is listed in a handler's `contract_keys` for scope → assert the handler is **not** dispatched on open (per Q3 decision; L283, L1013). This is the single most important ownership-boundary test in the plan and is currently absent.
    - After `murrmure_resolve_step({ branch: "completed" })`, journal contains `mrmr.step.resolved` and run advances to `build` (next step) — reuses `resolveFlowStep` from `step-resolve.test.ts`.
  - `packages/cli/test/preview-review-v2-example.test.ts` (modify, in map L999) — see §"Flaky/unsafe test risks"; rewrite the `executor.action`/`actions.yaml` assertions (currently L40-L80) to assert `handlers.yaml` presence and `contract_keys` instead.
- **Fixtures needed:** inline manifest + handlers YAML (no new fixture files required for VS-1).
- **Manual:**
  1. `mrmr space apply` on `examples/flows/preview-review-v2` (post-cutover single-step fixture) → exit 0, stdout shows `catalog flw_…: <digest> (N steps)` and `handlers: 1`.
  2. Trigger a manual run; open `write_spec`.
  3. Expected outcome: exactly one shell dispatch occurs; `murrmure_space_status` MCP tool returns `handler_coverage` with `write_spec → [write-spec]`; resolving `completed` advances the run to `build`.
- **Review-subagent PASS criteria (binary):**
  - `pnpm --filter @murrmure/hub-core test unit/index/handlers-parse unit/index/handler-catalog-lint unit/flow-engine/handler-dispatch` exits 0.
  - `pnpm --filter @murrmure/cli test preview-review-v2-example` exits 0.
  - Diff touches only: `packages/hub-core/src/index/{parse-handlers,handler-catalog-lint}.ts`, `packages/hub-core/src/flow-engine/step-open.ts`, the three test files, and the example's `handlers.yaml`. No `executor.action` added anywhere.
  - `handler-dispatch.test.ts` contains a case named "human step key is not dispatched on open".

---

### VS-2 — Nested build→review loop, subgraph owner (plan Phase 3 subset, L865-L867 + L283)

- **Automated:**
  - `packages/hub-core/test/unit/flow-engine/handler-dispatch.test.ts` (extend VS-1 file) — add cases:
    - Multi-key handler `[build, build.build-loop, build.review]` dispatches once on `build` open; on `build.build-loop` open, the **same** handler session is reused (scope slices for all keys present in prompt); assert `buildMurrmurePromptBindings` output contains branch schemas for all three keys (extend pattern from `step-contract-slice.test.ts` L118-L168).
    - `kill_on: step.resolved` cancels in-flight dispatch when `build` resolves (assert cancel mock invoked once, not per-child).
    - `changes_required` on `review` → reopens `build.build-loop` without a second handler dispatch (one-owner policy).
  - `packages/executors/conformance/invoke-shell-prompt.test.ts` (**new path — see §"Missing tests" #1**; the plan's `executors/test/...` path will not run) — asserts:
    - For a multi-key handler, `resolveInvokePrompt` output contains a `## Scope` block listing branch schemas + then-hints for every key in `contract_keys`, **before** the active-step block (order per plan L520-L531).
    - Active-step block always present; handler prompt template resolved.
    - **No briefing prepend** (assert `prompt` does not contain `Space briefing` / `briefing.md`) — this replaces the soon-to-be-deleted assertions in `conformance/shell-spawn.test.ts` L60-L79.
- **Fixtures needed:** inline nested manifest (reuse `preview-review` nested shape, `step-contract-slice.test.ts` L16-L70 + nested `build` from `preview-review-v2-example.test.ts` L37-L54).
- **Manual:**
  1. Apply the nested `preview-review` flow with the `build-owner` subgraph handler.
  2. Run; drive `build` → `build.build-loop` (agent) → `review` (human, view) → `changes_required` → `build.build-loop` again.
  3. Expected outcome: one handler session spans the whole `build` subgraph; the human `review` step opens the view and does **not** spawn a shell; one `mrmr.step.resolved` per transition in the journal; no second handler dispatch on `changes_required`.
- **Review-subagent PASS criteria:**
  - `pnpm --filter @murrmure/hub-core test unit/flow-engine/handler-dispatch` and `pnpm --filter @murrmure/executors test conformance/invoke-shell-prompt` exit 0.
  - Test names include "subgraph owner single session" and "human step opens view not shell".
  - No double-dispatch regression: `dispatchSteps` mock call count for the loop == 1 across a `changes_required` cycle.

---

### VS-3 — Completion modes + `mrmr step resolve` CLI (plan Phase 3, L327-L389 + L868-L870)

- **Automated:**
  - `packages/hub-core/test/unit/flow-engine/step-complete-modes.test.ts` (**new, not in map**) — asserts the `complete` wiring that replaces `shouldAutoResolveExecutorStep` (plan L337, L868):
    - `complete: auto` + shell exit 0 + stdout JSON → hub calls `resolveFlowStep` with `branch: "completed"` and `payload = <parsed stdout>`; run advances with **no MCP call**.
    - `complete: auto` + exit non-zero → `ACTION_FAILED` journal event; step stays `working` (assert memo status unchanged).
    - `complete: cli` → hub does **not** auto-resolve; step stays `working` until `mrmr step resolve` calls the HTTP endpoint (assert `resolveFlowStep` not called by hub).
    - `complete: auto` on a step with nested children → runtime refuses with `HANDLER_COMPLETE_AUTO_NESTED` (plan L777, L921 anti-pattern #9) — this is the runtime guard, complementing the lint test.
    - Fixture: inline manifest + a handler index row; use `MemoryStudioPersistence` + `completeDispatchedAction` pattern (`complete-dispatched.test.ts` L40-L56).
  - `packages/cli/test/step-resolve-cli.test.ts` (in map L1004) — asserts:
    - `--payload-json '{"ok":true}' --branch completed` → POSTs `{ branch: "completed", payload: {ok:true} }` to `/v1/runs/{run_id}/steps/{step_id}/resolve` with `Authorization: Bearer ${MURRMURE_HUB_TOKEN}` (stub `fetch`, assert call shape — match `space-apply.test.ts` L113-L148).
    - `--payload-stdin` reads a JSON object from stdin (pipe a string in via `child_process` or a mock readable) and sends it as `payload`.
    - Invalid payload vs branch schema → CLI exits non-zero; stubbed hub returns 400 → CLI exits non-zero and does **not** retry.
    - Unknown branch → hub 400 → CLI exit non-zero.
    - Token is read from `MURRMURE_HUB_TOKEN` env; if absent → CLI exits non-zero with a clear message (no silent fallback).
  - `packages/executors/conformance/shell-spawn.test.ts` (extend, **not in map**) — asserts `MURRMURE_HUB_TOKEN` is injected into the child env on `shell_spawn` dispatch (plan L437, L970), and that the env also carries `MURRMURE_RUN_ID`, `MURRMURE_STEP_ID`, `MURRMURE_STEP_CONTRACT`, `MURRMURE_STEP_WORKDIR` (plan L435-L438). Use a fixture script that echoes `process.env.MURRMURE_*` as JSON and assert the parsed output — avoids any live hub.
  - `packages/hub-core/test/unit/index/handler-catalog-lint.test.ts` (extend VS-1) — `complete: cli` handler whose `command` lacks `mrmr step resolve` → `HANDLER_COMPLETE_CLI_NO_RESOLVE` (plan L776). Requires Q7 decision (static parse vs runtime) as a VS-0 gate.
- **Fixtures needed:** a committed headless script for `complete: auto` positive/negative, e.g. `packages/executors/conformance/fixtures/auto-ok.mjs` (prints JSON, exit 0) and `auto-fail.mjs` (exit 1). Keep them tiny and committed (the plan's example `node scripts/archive.mjs` at L348 is illustrative, not a test asset).
- **Manual:**
  1. Apply a flow with one `complete: auto` step and one `complete: cli` step.
  2. Trigger the `auto` step → expected: run advances without any agent/MCP action; journal shows `ACTION_COMPLETED` with parsed stdout as payload.
  3. Trigger the `cli` step whose command is `node conformance/fixtures/auto-ok.mjs | mrmr step resolve --branch completed --payload-stdin` → expected: step resolves to `completed`.
  4. Force a failure: `cli` command `node conformance/fixtures/auto-fail.mjs || mrmr step resolve --branch failed --payload-json '{"error":"x"}'` → expected: `failed` branch resolved, run fails if the branch has `fail_run: true`.
- **Review-subagent PASS criteria:**
  - `pnpm --filter @murrmure/hub-core test unit/flow-engine/step-complete-modes` exits 0, including the `auto-on-nested` runtime-refusal case.
  - `pnpm --filter @murrmure/cli test step-resolve-cli` exits 0 including both 400/exit-nonzero negative cases.
  - `pnpm --filter @murrmure/executors test conformance/shell-spawn` exits 0 including a case named "injects MURRMURE_HUB_TOKEN".
  - No test relies on a live hub or network.

---

### VS-4 — `.mrmr/` layout cutover + briefing removal (plan Phase 1, L819-L837)

- **Automated:**
  - `packages/cli/test/layout-cutover-grep.test.ts` (**new — replaces the shell `rg` gate at L833**): walk `packages/{hub-core,hub-daemon,executors,cli,mcp-bridge}/src` and assert no file matches `\.mrmr\.temp|(^|/)murrmure/` (allow the `murrmure-mcp` binary name as a separate token check). Match the `docs-proof.test.ts` walker pattern (L41-L56). This makes the gate run in `pnpm test` locally with line-level failures instead of a CI-only shell step.
  - `packages/hub-core/test/unit/flow-engine/step-contract-slice.test.ts` (modify, in map L996) — **the plan's "Modify paths" is too vague**; specify: replace every `.mrmr.temp/runs/...` assertion (currently L97, L144, L184-L185) with `.mrmr/dev/runs/...`. Because the vertical-slice order runs VS-4 *after* VS-1/VS-2, these path assertions must be updated in VS-4 and the VS-1/VS-2 dispatch tests must use whatever path the resolver returns at that time — add a helper `expectRunPath(runId, stepId)` so the expected path is defined in one place per slice.
  - `packages/cli/test/space-link-file.test.ts` (**new, not in map**) — asserts `space.yaml` `link:` block is read/written (plan L836, L979): `readLink()` returns `{ space_id, host }` from `link:`; `writeLink()` updates `link:` without touching `slug`/`name`; no `link.json` is created. Requires Q1 decision (gitignore whole file vs commit `space_id` only) as a VS-0 gate.
  - `packages/hub-core/test/unit/flow-engine/space-briefing.test.ts` — **delete** (in map L997).
  - `packages/executors/conformance/shell-spawn.test.ts` — **delete/rewrite the briefing-prepend cases** (L60-L79 of that file) which assert `Space briefing` is prepended; after VS-4 these must assert it is **absent**. Not currently called out in the map.
  - `packages/mcp-bridge/test/wake-relay-paths.test.ts` (**new, not in map**) — asserts pending-wake is read/written at `.mrmr/dev/pending-wake.json` (plan L662, L980), not `.murrmure/`.
- **Fixtures needed:** a tmp project tree with `.mrmr/{space,flows,views,dev}` (extend `space-apply.test.ts` `beforeEach` L31-L52, but write to `.mrmr/space/...` instead of `murrmure/...`).
- **Manual:**
  1. In a clean clone, `mrmr space init` → expected: only `.mrmr/{space,flows,views,dev}/` created; `.gitignore` contains `.mrmr/dev/`; no `murrmure/`, `.murrmure/`, `.mrmr.temp/`.
  2. `mrmr space apply` → expected: run artifacts materialize under `.mrmr/dev/runs/{run_id}/`.
  3. Open a generated handler prompt → expected: no `## Key paths` / `briefing.md` block (plan L533-L537).
- **Review-subagent PASS criteria:**
  - `pnpm --filter @murrmure/cli test layout-cutover-grep space-link-file` exits 0.
  - `pnpm --filter @murrmure/hub-core test unit/flow-engine/step-contract-slice` exits 0 with `.mrmr/dev/runs` paths.
  - `pnpm --filter @murrmure/mcp-bridge test wake-relay-paths` exits 0.
  - No remaining `Space briefing` assertions in the executors suite.

---

### VS-5 — Bindings + event handlers + doctor coverage (plan Phase 2 bindings L845 + Phase 3 hooks L867 + Phase 5 doctor L904)

- **Automated:**
  - `packages/hub-core/test/unit/index/bindings-parse.test.ts` (in map L1000) — asserts `parseBindings(yaml)` resolves `source:` prefixes `local:`, `space:`, `catalog`, `npm:`, `path:` (plan L629-L635); unresolved ref → `BINDINGS_UNRESOLVED` (error); worker space with no bindings and no local flows → `WORKER_NO_BINDINGS` (warning).
  - `packages/hub-daemon/test/http/spaces/worker-bindings-federation.test.ts` (**new, not in map — critical for north star §4**): spin `startHubTestFixtureAsync`; create a catalog space with a flow; create a worker space with `bindings.yaml` pointing at `space:<catalog_id>`; apply both; start a run on the worker space against the bound flow; assert the worker's handlers (keyed by the catalog flow's contract keys) dispatch and the run advances. This is the single test that proves portability/federation and is currently absent.
  - `packages/hub-core/test/unit/hooks/handler-event-parity.test.ts` (**new, not in map**): assert that every `hooks.yaml` fixture in `studio-specs/current/fixtures/hooks/` dispatches identically when migrated to a handler with `on.event` (plan L867, L971). Use the existing `matchHooks` (`hooks/matcher.test.ts`) as the oracle; assert same handler id, same event type, same source filter semantics. Prevents behavior drift during the hooks→handler migration.
  - `packages/hub-daemon/test/http/events/event-handler-dispatch.test.ts` (**new, not in map — north star §3**): emit `brief.requested` (plan L296-L301) → assert the `brief-wake` handler dispatches and a journal `handler:brief-wake` event is appended. Reuses `startHubTestFixtureAsync` + `applySpaceBundle` with an `on.event` handler.
  - `packages/cli/test/space-doctor-handlers.test.ts` (**new, extends `space-doctor.test.ts`**): assert doctor codes `HANDLER_MISSING`, `HANDLER_ORPHAN_KEY`, `HANDLER_KEY_CONFLICT`, `HANDLER_LEGACY_ACTIONS`, `HANDLER_COMPLETE_CLI_NO_RESOLVE`, `BINDINGS_UNRESOLVED`, `WORKER_NO_BINDINGS`, `LEGACY_LAYOUT` (plan L770-L781) each fire on a constructed fixture and map to a fix command (match the `expectedCommandByCode` table pattern in `space-doctor.test.ts` L280-L323).
- **Fixtures needed:** a `studio-specs/current/fixtures/spaces/worker-catalog/` pair (two mini `.mrmr/` trees) for the federation HTTP test; extend the inline-doctor fixture pattern from `space-doctor.test.ts`.
- **Manual:**
  1. Apply a worker space whose `bindings.yaml` references a flow authored in another space.
  2. Trigger the bound flow on the worker → expected: worker's own handlers run; the catalog space does not need to re-execute.
  3. Publish an event that an `on.event` handler listens for (`brief.requested`) → expected: handler dispatches, journal records it, no `hooks.yaml` present.
  4. `mrmr space doctor` on a worker with a missing handler → expected: `HANDLER_MISSING` (strict error) with the `mrmr space handlers scaffold` fix suggestion.
- **Review-subagent PASS criteria:**
  - `pnpm --filter @murrmure/hub-core test unit/index/bindings-parse unit/hooks/handler-event-parity` exits 0.
  - `pnpm --filter @murrmure/hub-daemon test http/spaces/worker-bindings-federation http/events/event-handler-dispatch` exits 0 (these are real-hub-on-port-0 tests, deterministic).
  - `pnpm --filter @murrmure/cli test space-doctor-handlers` exits 0 and covers every code in plan L770-L781.
  - Federation test asserts the catalog space's `executor.action`/handlers are **not** required on the worker.

---

### VS-6 — Legacy deletion + docs/skills/health hardening (plan Phase 4 L881-L897 + Phase 5 L900-L907)

- **Automated:**
  - `packages/cli/test/space-doctor-skills.test.ts` (in map L1001) — asserts:
    - Worker archetype (no local `flows/`/`views/`) with only `murrmure-agent` installed → doctor **ok** for skills; missing `murrmure-developer` is **not** an error (plan L766).
    - Authoring archetype (local flows/views) missing `murrmure-developer` → `SKILL_DEVELOPER_MISSING` (warning).
    - Installed `VERSION` < CLI package `VERSION` → `SKILL_AGENT_OUTDATED` / `SKILL_DEVELOPER_OUTDATED` (plan L759-L760); version compare reuses `readSkillVersion()` pattern (plan L764).
    - `.cursor/skills/murrmure/` present → `SKILL_LEGACY_MONOLITH` (info); `.cursor/skills/murrmure-flow/` → `SKILL_LEGACY_FDK` (plan L761-L762). **These two codes are in the plan but not in the test map — add them.**
  - `packages/cli/test/skill-install-variants.test.ts` (**new, extends `skill-install.test.ts`**) — `--variant agent` installs only `murrmure-agent`; `--variant all` installs both; default heuristic picks `all` when `flows/` or `views/` non-empty else `agent` (plan L709).
  - `packages/cli/test/docs-proof.test.ts` (extend) — add: `examples/flows/**/flow.manifest.yaml` contains no `executor.action` (plan L877, L890, L913 anti-pattern #1); tutorials 1-3 reference `handlers.yaml` + `contract_keys`; `apps/docs` excludes `actions.yaml`/`executors.yaml` as runtime concepts.
  - `packages/cli/test/space-handlers-scaffold.test.ts` (in map L1003) — asserts `mrmr space handlers scaffold` emits stub entries for uncovered **agent** steps only (not human steps), merging into existing `handlers.yaml` or writing `.mrmr/dev/handlers.stub.yaml` (plan L229-L240).
  - `packages/cli/test/space-handlers-coverage.test.ts` (**new, not in map**) — asserts `mrmr space handlers coverage` prints a `contract_key → handler id(s)` table (plan L227) and exits non-zero under `--strict` when any agent step is uncovered.
  - `packages/cli/test/space-contracts-offline.test.ts` (**new, not in map**) — asserts `mrmr space contracts` (offline codegen, plan L226, L977) produces the same `contract-keys.json` / `handlers.schema.json` as `mrmr space apply` for a local `.mrmr/` bundle, **without** a hub POST (stub `fetch` and assert it is never called — match `space-apply.test.ts` L241 `expect(fetchMock).not.toHaveBeenCalled()`).
  - `packages/hub-daemon/test/http/mcp/list-handlers.test.ts` (in map L1005) — asserts `murrmure_list_handlers` returns handler ids + `contract_keys` + `type` for an applied space (plan L544, L983). Follow `catalog-schema.test.ts` pattern (`startHubTestFixtureAsync` + `applySpaceBundle` + `/v1/mcp/tools/call`). **Must also update `catalog-schema.test.ts` `PLATFORM_TOOL_NAMES` (L9-L29) to include `murrmure_list_handlers`, or that test breaks — not in the map.**
  - `packages/hub-daemon/test/http/mcp/space-health.test.ts` (**new, not in map — Phase 5 has no acceptance**) — asserts `murrmure_space_health` returns handler coverage, index drift, and skills summary (plan L905). `murrmure_get_run_context` returns active step + matched handler + scope slices JSON (plan L906).
  - Legacy parser deletion: `packages/hub-core/test/unit/index/no-legacy-parsers.test.ts` (**new**) — after the deprecation window (plan L907), assert `parseActions`, `parseExecutors`, `parseHooks` are no longer exported from `@murrmure/hub-core` index (import attempt throws) — encodes "delete don't wrap" (anti-pattern #6, L918).
- **Fixtures needed:** tiny installed-skill dirs with `VERSION` files for the doctor test (tmp `testHomeRef` pattern from `space-doctor.test.ts` L6-L14); a local `.mrmr/` bundle for offline codegen.
- **Manual:**
  1. `mrmr skill install --variant all` in a fresh authoring space → both skill dirs present with correct `VERSION`; doctor `Skills ✓ agent X.Y.Z · developer X.Y.Z (authoring space)`.
  2. `mrmr skill install --variant agent` in a worker space → only agent skill; doctor `Skills ✓ agent X.Y.Z (consumer space — developer not required)` (plan L796-L800).
  3. In a repo still carrying `murrmure/actions.yaml`, run `mrmr space doctor` → expected `HANDLER_LEGACY_ACTIONS` + `LEGACY_LAYOUT` (plan L775, L781).
  4. Confirm `murrmure_invoke_action` is either still present and working **or** removed from the MCP catalog consistently (Q4 decision) — `catalog-schema.test.ts` must match.
- **Review-subagent PASS criteria:**
  - `pnpm --filter @murrmure/cli test space-doctor-skills skill-install-variants space-handlers-scaffold space-handlers-coverage space-contracts-offline docs-proof` exits 0.
  - `pnpm --filter @murrmure/hub-daemon test http/mcp/list-handlers http/mcp/space-health` exits 0.
  - `pnpm --filter @murrmure/hub-core test unit/index/no-legacy-parsers` exits 0.
  - `pnpm check:docs-proof` exits 0 with the new `executor.action` ban.

## Missing tests (critical)

1. **`executors/test/invoke-shell-prompt.test.ts` (plan L998) will not run.** The `@murrmure/executors` vitest project is configured with `include: ["conformance/**/*.test.ts"]` only (root `vitest.config.ts` L28-L30; there is no `packages/executors/vitest.config.ts` override). The directory `packages/executors/test/` does not exist today. A file placed there is silently skipped — CI stays green while the test never executes. **Amend the map to `packages/executors/conformance/invoke-shell-prompt.test.ts`** and either extend the existing `conformance/shell-spawn.test.ts` (which already imports `invoke-shell-prompt.js`, L1-L11) or add a sibling file. This is the highest-severity testability defect in the plan because it creates a false-positive green.

2. **Phase 3 "integration: open write_spec → matched handler dispatches; `murrmure_resolve_step` advances run" (L875) is not a binary assertion.** It is listed in the phase acceptance but has no file path and no named assertion. Map it to `handler-dispatch.test.ts` (L995) with the concrete cases in VS-1 above. Without this, a review subagent has nothing to run.

3. **Human-step key boundary has no test.** Plan L283 and Q3 (L1013) say human steps may appear in `contract_keys` for scope but must **not** be dispatched on open. This is a north-star ownership boundary (§5) and human-experience boundary (§6). No test in the map covers it. Add the "human step key is not dispatched on open" case to `handler-dispatch.test.ts`.

4. **No worker+catalog federation E2E.** North star §4 (portability/federation) is a stated plan goal (L26-L33, L612-L637) and the companion review flags it (L128). The map has only a unit `bindings-parse.test.ts`. Add `hub-daemon/test/http/spaces/worker-bindings-federation.test.ts` (VS-5).

5. **No hooks→handler parity test.** Plan L867/L971 migrates `hooks.yaml` dispatch into the handler matcher. Existing `hooks/matcher.test.ts` tests the old matcher; nothing asserts behavioral equivalence after migration. Add `handler-event-parity.test.ts` (VS-5).

6. **No event→handler→journal test for `brief.requested`.** North star §3 (event-based orchestration, non-step triggers) is a core promise. Manual #3 (L944) covers it but there is no automated test. Add `event-handler-dispatch.test.ts` (VS-5).

7. **No `complete: auto` runtime-refusal-on-nested test.** Plan L777/L921 makes `complete: auto` on nested children an error. The lint test (`handler-catalog-lint.test.ts`) catches it at apply, but the runtime guard (engine refuses even if lint is bypassed) is untested. Add to `step-complete-modes.test.ts` (VS-3).

8. **No shell-dispatch token-injection test.** Plan L437/L970 injects `MURRMURE_HUB_TOKEN` on `shell_spawn`. This is security-sensitive (Q6, L1016, unresolved). Add a case to `conformance/shell-spawn.test.ts` (VS-3).

9. **`mrmr space contracts`, `mrmr space handlers coverage`, `murrmure_space_health`, `murrmure_get_run_context` have no tests.** All four are introduced by the plan (L226-L227, L905-L906, L977-L978) but absent from the map. Add per VS-6 above.

10. **`catalog-schema.test.ts` `PLATFORM_TOOL_NAMES` is an exact-match list (L9-L29, L136).** Adding `murrmure_list_handlers` (plan L544, L983) will break it unless updated. Not mentioned in the plan's map. Also, if Q4 retires `murrmure_invoke_action`, that name must be removed from the list. Add an amendment.

11. **`conformance/shell-spawn.test.ts` briefing assertions (L60-L79) will break on briefing removal.** The map says delete `space-briefing.test.ts` (L997) but does not mention these. They assert `Space briefing` is prepended; after VS-4 they must assert absence. Add an amendment.

12. **Phase 5 has no acceptance block (L900-L907).** Every other phase has one. Add one naming the VS-6 tests above.

13. **No legacy-skill doctor test for `SKILL_LEGACY_MONOLITH` / `SKILL_LEGACY_FDK`.** Plan L761-L762 defines the codes; `space-doctor-skills.test.ts` (L1001) must cover them.

## Flaky / unsafe test risks

1. **Shell `rg` as an acceptance gate (plan L833).** CI-only, not reproducible locally, no line-level failure, and depends on `rg` being on PATH (true on ubuntu-latest but not guaranteed elsewhere). **Replace with `layout-cutover-grep.test.ts`** (vitest walker, `docs-proof.test.ts` pattern) so it runs in `pnpm test` everywhere with file:line failures.

2. **`preview-review-v2-example.test.ts` builds views with a 120s timeout (L137 of that file).** The handler cutover rewrites this test; if it keeps the view-build step it stays slow and can flake under load. **Recommendation:** split — keep the strict-apply + view-dist check in `docs-proof.test.ts` (where it already lives, L87-L92), and make the handler-based example test assert only manifest/handlers shape + `lintSpaceApplyBundle` (no view build). This drops the 120s path from the handler slice.

3. **`complete: auto` / `complete: cli` integration that spawns real `node` subprocesses.** Safe if the fixture scripts (`conformance/fixtures/auto-ok.mjs`, `auto-fail.mjs`) are committed, tiny, and deterministic. **Unsafe if** tests rely on `cursor agent` or any external harness — the plan's manual steps and `cursor agent -p --force {{prompt}}` examples must NOT appear in automated tests. All automated completion tests should use `node <fixture>.mjs` or stubbed `fetch`, never `cursor`.

4. **Manual #3 daily-brief event handler (L944) implies a live `cursor agent` run.** That is a flaky live-harness assumption. **Recommendation:** the manual step should assert against the hub journal and MCP output (handler dispatched, `handler:brief-wake` journal event, `murrmure_list_handlers` shows `brief-wake`), not against agent success. The automated `event-handler-dispatch.test.ts` (VS-5) covers the deterministic part; manual sign-off is only for the real-agent prompt quality.

5. **HTTP daemon tests use `startHubDaemon({ port: 0 })` (real process, ephemeral port).** This is the repo's established pattern and is deterministic (in-memory db, tmp dir, `afterAll` cleanup). Not flaky. New MCP/HTTP tests should follow `catalog-schema.test.ts` / `resolve-step.test.ts` exactly rather than introducing a second harness.

6. **`step-contract-slice.test.ts` path assertions (L97, L144, L184-L185) hardcode `.mrmr.temp/runs/...`.** Under the vertical-slice order, VS-4 flips these to `.mrmr/dev/runs/...` *after* VS-1/VS-2 dispatch tests are written. If the resolver returns different paths per slice, tests silently assert the wrong string. **Recommendation:** introduce a single `expectRunPath(runId, stepId?)` helper returning the current expected root so the path contract is defined once.

7. **Contract codegen `.d.ts` unions (plan L171, L209-L218, L855).** Generating and asserting TypeScript string-literal unions in a vitest test is fragile (ordering, formatting). The companion review (L99) recommends deferring `.d.ts` to a later wave. **Recommendation:** in VS-1/Phase-2, test only `contract-keys.json` (stable JSON, easy to deep-equal) and `handlers.schema.json` enum; defer `.d.ts` assertions to VS-6 and assert via `ts.compile`/snapshot only if a second consumer exists (north-star §8: no abstraction without a second consumer).

8. **No test retries configured in CI.** `ci.yml` runs each step once with no retry. The existing suite is deterministic; keep it that way — do not introduce tests that need retries (timeouts on real hubs, race-prone polling). All new tests must be deterministic-by-construction.

## CI gate recommendations per slice

CI today (`.github/workflows/ci.yml`) runs one job: `pnpm build` → `pnpm test` → `pnpm test:acceptance` → `pnpm check:docs-proof` → `pnpm docs:build` → `pnpm check:doc-tracker:strict` → pack smoke. Note `pnpm test:acceptance` is scoped to `@murrmure/hub-daemon` + `@murrmure/cli` only (`package.json` L20) — so `@murrmure/hub-core` and `@murrmure/executors` tests gate only via `pnpm test`. Keep that in mind when labeling "Acceptance (CI)".

Recommended per-slice gates (add as a "CI gates" line in each slice's acceptance block):

| Slice | Gate command(s) | Must be green to merge |
|---|---|---|
| VS-0 | `pnpm --filter @murrmure/cli test handlers-decision-record` | yes (entry gate for VS-1) |
| VS-1 | `pnpm --filter @murrmure/hub-core test unit/index/handlers-parse unit/index/handler-catalog-lint unit/flow-engine/handler-dispatch` + `pnpm --filter @murrmure/cli test preview-review-v2-example` | yes |
| VS-2 | `pnpm --filter @murrmure/hub-core test unit/flow-engine/handler-dispatch` + `pnpm --filter @murrmure/executors test conformance/invoke-shell-prompt` | yes |
| VS-3 | `pnpm --filter @murrmure/hub-core test unit/flow-engine/step-complete-modes` + `pnpm --filter @murrmure/cli test step-resolve-cli` + `pnpm --filter @murrmure/executors test conformance/shell-spawn` | yes |
| VS-4 | `pnpm --filter @murrmure/cli test layout-cutover-grep space-link-file` + `pnpm --filter @murrmure/hub-core test unit/flow-engine/step-contract-slice` + `pnpm --filter @murrmure/mcp-bridge test wake-relay-paths` | yes |
| VS-5 | `pnpm --filter @murrmure/hub-daemon test http/spaces/worker-bindings-federation http/events/event-handler-dispatch` + `pnpm --filter @murrmure/hub-core test unit/index/bindings-parse unit/hooks/handler-event-parity` + `pnpm --filter @murrmure/cli test space-doctor-handlers` | yes |
| VS-6 | `pnpm --filter @murrmure/cli test space-doctor-skills skill-install-variants space-handlers-scaffold space-handlers-coverage space-contracts-offline` + `pnpm --filter @murrmure/hub-daemon test http/mcp/list-handlers http/mcp/space-health` + `pnpm --filter @murrmure/hub-core test unit/index/no-legacy-parsers` + `pnpm check:docs-proof` | yes |

All of the above are subsets of `pnpm test` / `pnpm test:acceptance` / `pnpm check:docs-proof`, so no new CI workflow steps are required — only the test files. The `rg` gate at plan L833 should be **removed** in favor of `layout-cutover-grep.test.ts` (covered by `pnpm test`).

## Manual sign-off playbook

The plan's manual sign-off (L940-L947) is per-outcome, not per-slice, and uses "works" verbs. Replace with the per-slice numbered playbook below. Each step has a concrete expected outcome a human can mark PASS/FAIL. None of these require a live agent harness to *pass the deterministic part* — the agent-quality check is called out separately.

- **VS-1 (per-step handler policy):**
  1. `mrmr space apply` on the single-step fixture → exit 0; stdout prints handler count 1.
  2. Start a manual run; `mrmr space status` / `murrmure_space_status` shows `write_spec → [write-spec]` coverage.
  3. Open `write_spec`; confirm one shell dispatch; resolve `completed` via MCP.
  4. **PASS:** run advances to `build` and journal has exactly one `mrmr.step.opened` + one `mrmr.step.resolved` for `write_spec`.

- **VS-2 (subgraph-owner policy):**
  1. Apply nested `preview-review` with the `build-owner` multi-key handler.
  2. Drive `build` → `build.build-loop` → `review` → `changes_required` → `build.build-loop`.
  3. **PASS:** one handler session spans the subgraph; `review` (human) opens the view and spawns **no** shell; `changes_required` does not start a second handler; journal shows one `handler:build-owner` dispatch.

- **VS-3 (completion modes):**
  1. Run an `auto` step → **PASS:** run advances with no MCP call; payload == parsed stdout.
  2. Run a `cli` step with `... | mrmr step resolve --branch completed --payload-stdin` → **PASS:** step resolves.
  3. Run a `cli` failure path → **PASS:** `failed` branch resolved; run fails if `fail_run: true`.

- **VS-4 (layout cutover):**
  1. Fresh `mrmr space init` → **PASS:** only `.mrmr/{space,flows,views,dev}/` exists; `.gitignore` has `.mrmr/dev/`.
  2. Apply + run → **PASS:** artifacts under `.mrmr/dev/runs/{run_id}/`.
  3. Inspect a handler prompt → **PASS:** no `briefing.md` / `## Key paths` block.

- **VS-5 (federation + events + doctor):**
  1. Worker space runs a catalog flow via `bindings.yaml` → **PASS:** worker handlers execute; catalog space not re-executed.
  2. Emit `brief.requested` → **PASS:** `brief-wake` handler dispatches; journal records `handler:brief-wake` (assert via `murrmure_journal_query`, not agent output).
  3. `mrmr space doctor` on a worker missing a handler → **PASS:** `HANDLER_MISSING` (strict error) + scaffold suggestion.

- **VS-6 (skills + legacy):**
  1. `mrmr skill install --variant all` in an authoring space → **PASS:** both skills present, versions match, doctor `✓ agent · developer (authoring space)`.
  2. `mrmr skill install --variant agent` in a worker → **PASS:** only agent skill; doctor does not flag missing developer.
  3. `mrmr space doctor` on a repo with `murrmure/actions.yaml` → **PASS:** `HANDLER_LEGACY_ACTIONS` + `LEGACY_LAYOUT`.

- **Agent-quality (non-deterministic, separate from PASS gates):** real `cursor agent` runs for `write_spec` / `build` / `brief-wake` are reviewed by a human for prompt quality and outcome usefulness. These are **not** merge gates — the deterministic journal/MCP assertions above are.

## Required plan amendments (numbered, actionable)

1. **Fix the executors test path.** Change map entry L998 from `executors/test/invoke-shell-prompt.test.ts` to `packages/executors/conformance/invoke-shell-prompt.test.ts` (or state "extend `conformance/shell-spawn.test.ts`"). **Why:** the `@murrmure/executors` project includes only `conformance/**/*.test.ts` (root `vitest.config.ts` L28-L30); the planned path is silently skipped, producing a false green.

2. **Make Phase 3 acceptance L875 binary.** Replace "integration: open write_spec → matched handler dispatches; `murrmure_resolve_step` advances run" with "`handler-dispatch.test.ts` (L995) asserts: (a) exactly one handler dispatched on `write_spec` open; (b) human-step key not dispatched on open; (c) `resolve_step` → run advances to `build`; (d) journal has `mrmr.step.opened` + `mrmr.step.resolved`." **Where:** L872-L878. **Why:** a review subagent needs a runnable assertion, not prose.

3. **Add the human-step-key boundary test.** In the `handler-dispatch.test.ts` spec (L995) and Phase 2/VS-1 acceptance, add a case "human step key listed for scope is not dispatched on open." **Where:** L847 (Phase 2 lint) + L864 (Phase 3 dispatch) + map L995. **Why:** north-star §5/§6 boundary; currently untested.

4. **Promote open questions Q1, Q3, Q4, Q6, Q7 (L1011-L1017) to VS-0 entry gates** with a `DECIDED:` line each in `studio-specs/current/bridges/handlers.md`, gated by `handlers-decision-record.test.ts`. **Where:** L1009-L1017 + new VS-0 section. **Why:** each blocks a deterministic test (Q1→`space-link-file` test; Q3→human-key test; Q4→`catalog-schema` tool list; Q6→token-injection test; Q7→`HANDLER_COMPLETE_CLI_NO_RESOLVE` test).

5. **Replace the shell `rg` gate (L833) with `layout-cutover-grep.test.ts`.** **Where:** L831-L836. **Why:** shell `rg` is CI-only, not locally reproducible, no line-level failure; the repo convention is vitest grep tests (`docs-proof.test.ts`).

6. **Add a Phase 5 acceptance block (L900-L907).** Name `space-health.test.ts`, `murrmure_get_run_context` test, `no-legacy-parsers.test.ts`, and the doctor-handler lint wiring test. **Where:** after L907. **Why:** Phase 5 is the only phase with no acceptance criteria.

7. **Add the federation E2E test.** Insert `hub-daemon/test/http/spaces/worker-bindings-federation.test.ts` into the map (after L1005) and into Phase 2/VS-5 acceptance. **Where:** map L989-L1006 + L852 + L904. **Why:** north-star §4; the plan's stated portability goal is otherwise only unit-tested.

8. **Add the hooks→handler parity test and the event→handler→journal test.** Insert `handler-event-parity.test.ts` and `event-handler-dispatch.test.ts` into the map and VS-5 acceptance. **Where:** map + L867. **Why:** north-star §3; prevents behavior drift during hook migration and proves non-step triggers work.

9. **Add the `complete: auto` runtime-refusal-on-nested test.** Insert `step-complete-modes.test.ts` into the map and Phase 3 acceptance. **Where:** map + L868/L872-L878. **Why:** plan L777/L921 makes it an error; lint alone is bypassable.

10. **Add the shell-token-injection test.** Add a case to `conformance/shell-spawn.test.ts` (map L998 region) asserting `MURRMURE_HUB_TOKEN` + run/step env are injected on dispatch. **Where:** map + L437/L970. **Why:** security-sensitive; Q6 must be decided first (entry gate #4).

11. **Add tests for the four untested commands/endpoints:** `mrmr space contracts` (`space-contracts-offline.test.ts`), `mrmr space handlers coverage` (`space-handlers-coverage.test.ts`), `murrmure_space_health` (`space-health.test.ts`), `murrmure_get_run_context`. Insert into map and VS-6/Phase 5 acceptance. **Where:** map L989-L1006 + L905-L906. **Why:** the plan introduces these surfaces with no test.

12. **Update `catalog-schema.test.ts` `PLATFORM_TOOL_NAMES` (L9-L29) for `murrmure_list_handlers`** and conditionally for `murrmure_invoke_action` (per Q4). **Where:** map + L544/L983. **Why:** that test is an exact-match list and will break otherwise.

13. **Call out the `conformance/shell-spawn.test.ts` briefing-prepend rewrite.** Add to map: "rewrite `conformance/shell-spawn.test.ts` L60-L79 to assert briefing is **absent** after VS-4." **Where:** map L998 region + L827. **Why:** these assertions break on briefing removal and are not captured by deleting `space-briefing.test.ts` alone.

14. **Split the codegen test by artifact.** Change Phase 2 acceptance L855 from "`contract-keys.json` + `.d.ts` unions" to: VS-1/Phase-2 tests `contract-keys.json` + `handlers.schema.json` (stable JSON); `.d.ts` union assertions deferred to VS-6 and only if a second consumer exists. **Where:** L850, L855. **Why:** `.d.ts` assertions are formatting-fragile; north-star §8 (no abstraction without a second consumer).

15. **Add a `expectRunPath()` helper and specify `step-contract-slice.test.ts` path updates per slice.** Replace map L996 "Modify paths" with: "VS-4: change `.mrmr.temp/runs/...` assertions (L97, L144, L184-L185) to `.mrmr/dev/runs/...` via a shared `expectRunPath()` helper." **Where:** map L996 + L835. **Why:** the vertical-slice order changes paths mid-stream; a single helper prevents silent string drift.

16. **Add legacy-skill doctor codes to `space-doctor-skills.test.ts`.** Explicitly list `SKILL_LEGACY_MONOLITH` and `SKILL_LEGACY_FDK` cases (plan L761-L762). **Where:** map L1001 + L761-L762. **Why:** the codes are defined but not in the test map.

17. **Reframe manual sign-off (L940-L947) as the per-slice playbook above**, and rewrite daily-brief manual #3 (L944) to assert against journal/MCP output rather than agent success. **Where:** L940-L947. **Why:** "works" is not a verifiable outcome; live-agent success is flaky and not a merge gate.

18. **Add a "CI gates" line to each slice/phase acceptance block** naming the exact `pnpm --filter … test …` command(s) from the table above. **Where:** L831, L852, L872, L892, L907. **Why:** lets a review subagent run one command and get a binary exit code; also clarifies that `@murrmure/hub-core`/`@murrmure/executors` gate via `pnpm test`, not `pnpm test:acceptance`.

19. **Add a "Fixtures" line per slice** naming committed fixture assets (inline manifests, `conformance/fixtures/auto-ok.mjs` / `auto-fail.mjs`, `fixtures/spaces/worker-catalog/`). **Where:** each phase's Work/Acceptance. **Why:** prevents tests from depending on illustrative-but-nonexistent paths like `node scripts/archive.mjs` (L348) or on live harnesses.

20. **Add per-slice observability assertions as hard gates** (north-star §7): each dispatch/resolve test must assert the corresponding journal events (`mrmr.step.opened`, `mrmr.step.resolved`, `handler:{id}`) and, where relevant, MCP output (`murrmure_list_handlers`, `murrmure_space_status` coverage). **Where:** each slice's PASS criteria. **Why:** the companion review (L131) flags this; observability is a core product promise, not a side effect.
