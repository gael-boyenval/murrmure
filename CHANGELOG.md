# Changelog

## Tutorial v3 Task 06 — safe shell handler copies a verified run-scoped artifact (2026-07-15)

### Added

- Shell handlers now resolve with a strict **complete-argument grammar**:
  every dynamic placeholder must occupy one whole unquoted argument and the
  runtime shell-quotes it exactly once. Spaces, apostrophes, `$()`, backticks,
  newlines, leading dashes, and Unicode in filenames or content stay literal
  data and can no longer become shell fragments.
- Author-quoted placeholders (`'{{x}}'`, `"{{x}}"`), embedded forms
  (`--flag={{x}}`, `pre{{x}}post`), and unknown placeholders are rejected
  before spawn. A missing/null binding fails fast with
  `HANDLER_BINDING_VALUE_MISSING`; a schema-valid empty string remains one
  empty argument.
- A singleton artifact `.path` token (for example
  `{{murrmure.step.intake.artifact.spec.path}}`) resolves to a **verified,
  digest-checked, run-scoped consumer copy** at
  `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`.
  The original artifact is never mutated; traversal and digest mismatch refuse
  the copy before any consumer bytes are written.
- Canonical `runScratchPaths` helpers centralize every run-scoped path
  (run dir, step workdir, stable dir, consumer inputs, active contract).
- Multiline handler commands run as `/bin/sh -e -c "<script>"` with no login
  profile and no silent shell fallback; omitted `cwd` defaults to the space
  root and omitted `delivery` defaults to fail-fast.
- Timeout, cancellation, external resolution, yield, run terminal, or
  Desktop shutdown terminates the **whole process group** with `SIGTERM`, waits
  five seconds, then `SIGKILL`, and records exactly one terminal result.
- Each spawned handler receives an **ephemeral run/step-scoped credential**
  in its environment, never the persistent machine connection; the dispatch
  audit records only command/prompt/cwd, so credentials never reach the
  journal or public surfaces.

### Breaking

- Authored `kill_on` is removed; process termination is owned by the runtime.
- Raw `{{key}}` interpolation that silently emptied unknown/missing bindings is
  gone — handlers with unresolved placeholders now fail before spawn with a
  typed error instead of running a malformed command.

### Fixed (post-review, 2026-07-15)

- Assignment credentials now carry an `expires_at` backstop and a `scope_ref`
  (`{run_id}:{step_id}`); `requireToken` denies expired/revoked tokens and the
  resolve route denies a scope mismatch (`TOKEN_STEP_SCOPE_MISMATCH`). Credentials
  are revoked on step resolve/auto-complete, run terminal, and Desktop shutdown
  via an assignment-credential registry, so no persistent child credential
  survives a finished assignment.
- Process-group `SIGKILL` escalation now stays armed when the shell leader exits
  after `SIGTERM`, so a TERM-resistant descendant is reaped after the grace
  period; Hub/Desktop shutdown cancels every registered shell executor.
- Binding and materialization failures now map to their own typed codes
  (`HANDLER_BINDING_VALUE_MISSING`, `HANDLER_PLACEHOLDER_QUOTED`/`EMBEDDED`,
  `HANDLER_UNKNOWN_PLACEHOLDER`, `ARTIFACT_PATH_TRAVERSAL`,
  `ARTIFACT_SOURCE_NOT_FOUND`/`NOT_FILE`, `ARTIFACT_DIGEST_MISMATCH`,
  `ARTIFACT_COPY_FAILED`) before spawn, instead of collapsing to
  `SHELL_SPAWN_FAILED`.
- The dispatch audit resolves artifact `.path` placeholders to opaque references
  (transfer id, else `artifact:{producer}:{slot}`) — never the producer's local
  run-scratch path or the consumer copy path — so journals and public APIs
  receive references, not local paths.
- `materializeConsumerCopy` rejects symlinked sources and symlinked parent
  directories that resolve outside the run scratch tree (`lstat` + `realpath`
  canonicalization), and atomically renames into place (POSIX `rename` replaces
  any existing destination) so a prior copy is never left missing.
- The shell tokenizer preserves authored single-quoted literals verbatim and
  recognizes hyphenated placeholders (e.g. `{{my-step.artifact.path}}`) so they
  are substituted or rejected as unknown instead of silently passing through.
- The exact Tutorial Part 5 (`write_spec_copy`) conformance test is now active.

### Fixed (second post-review, 2026-07-15)

- The assignment boundary is now enforced on **every `step:resolve` endpoint** —
  step resolve, upload-intent creation, file transfer, and intent abandon — by
  one shared `requireAssignmentScope` helper. An ephemeral handler token
  (`scope_ref` `{run_id}:{step_id}:{handler_id}`, `harness_id` `run:{run_id}`)
  can no longer create upload intents or transfer files for another active
  run/step or in another space; mismatches return `TOKEN_RUN_SCOPE_MISMATCH`,
  `TOKEN_STEP_SCOPE_MISMATCH`, or `scope_enforcement_failure`. Grant tokens keep
  the space-only boundary.
- Hub/Desktop shutdown now **awaits the SIGKILL escalation** before exiting. The
  escalation timer is ref'd and `killChildProcess` returns an awaitable promise
  that `awaitAllShellExecutorsTerminated` collects at shutdown, so a
  TERM-resistant descendant can no longer outlive the daemon.
- `materializeConsumerCopy` now contains the **destination parent**: after
  `mkdir` the consumer `inputs/{slot}` directory is `realpath`-canonicalized
  and rejected if it resolves outside the run scratch tree, and a pre-existing
  symlink at the destination filename is rejected — so a malicious
  `.../inputs/{slot}` symlink can no longer redirect the temp write and atomic
  rename outside the tree.
- Process-tree termination is now **once-only**: the executor deregisters its
  cancel handle when the process settles (timeout, error, or close), so a
  timeout that locally terminates followed by the run-failure cancellation path
  signals the group exactly once (one `SIGTERM`, one `SIGKILL`, one terminal
  result). New integrated and HTTP regressions cover cross-run/step/space
  upload scope, awaited shutdown escalation, destination-parent symlink escape,
  and integrated timeout/cancel once-only behavior.

## Tutorial v3 Task 09 — run capacity and safe apply (2026-07-15)

### Added

- Space-owned `run_policies: [{ flow, max_concurrent_runs }]` in
  `handlers.yaml`. `flow` is an authored alias resolved at apply to canonical
  `{ origin_space_id, flow_id, flow_digest }`; `max_concurrent_runs` is an
  integer ≥ 1; no policy means unlimited. The portable flow carries no
  concurrency policy.
- One atomic run-capacity admission check shared by every start path (manual,
  trigger, API, MCP, federated). Overflow creates no queue/partial run and
  returns `409 FLOW_CONCURRENCY_LIMIT` with the canonical flow identity, the
  configured limit, and the active blocking run IDs.
- Apply quiescence: an apply replaces a space's configuration only when the
  whole space has no non-terminal runs; otherwise `409 SPACE_HAS_ACTIVE_RUNS`
  with the blocking run IDs and the prior index preserved.
- A shared per-space guard serializes admission (count + insert) and apply
  (quiescence check + commit) so a limit of one never admits two and no run
  observes a partially replaced index.
- Trigger delivery records a typed `mrmr.flow.start_denied` journal event; a
  later retry performs a fresh admission check.
- Typed run-policy apply failures (`RUN_POLICY_UNKNOWN_FLOW`,
  `RUN_POLICY_AMBIGUOUS_FLOW`, `RUN_POLICY_DUPLICATE`) preserve the prior index.
- Runs and journals pin the applied `flow_digest` admitted at start.

### Breaking

- None. Existing `handlers.yaml` files without `run_policies` behave as before
  (unlimited). An invalid `run_policies` entry now hard-fails apply with a typed
  code instead of being ignored.

## Tutorial v3 Task 02 — local connections and bundled bridge (2026-07-14)

### Breaking

- Public local authorization uses `mrmr connection create|activate|list|rotate|revoke`.
  Removed `grant mint`, `grant use`, `agent connect`, `agent activate`, and
  `space onboard` command paths without aliases.
- Local MCP configuration no longer contains token environment entries.
  Credentials live only in macOS Keychain; explicit headless CI runtime
  injection is the sole `MURRMURE_HUB_TOKEN` exception.
- Legacy action/grant MCP tools are absent; run cancellation uses `flow:run`.

### Added

- Named least-privilege `tutorial-builder/v1` profile with exactly
  `space:read`, `flow:read`, `flow:run`, and `step:resolve`.
- Neutral multi-context adapter descriptor, idempotent Cursor MCP/skill install,
  generic no-write instructions, and reload/resume state.
- Stable user-only `~/.murrmure/bin/murrmure-mcp` launcher with validated bundle
  discovery across Desktop relaunch, move, and update.
- Doctor classifications for descriptor/token leakage and locked/missing local
  credentials; advanced flow ACLs reject non-applied aliases.

## Tutorial v3 Task 03 — resolver-agnostic step contracts and trigger-only start (2026-07-14)

### Breaking

- Flow manifests are **resolver-agnostic**: steps carry only `id`, optional
  `description`, optional `branches`, and optional nested `steps`. Removed
  fields `role`, `presentation`, `deriveRole`, and legacy step kinds are
  rejected by the strict schema with no fallback.
- `triggers` is the **only** start-condition field. The removed `start`
  (including dual `start` + `triggers`) and flow-level `requires_view` are
  rejected; `requires_view` is not an alias inside `triggers` either.
- Branch authoring is **flat**. Wrapper shapes (`payload:`, `outcome:`) and
  superseded routing keys (`next`, `fail_run`, `goto`, `fail`, `complete`,
  `continue`) are rejected. Routing uses `route: { step }`,
  `route: { run: completed | failed }`, or `resume: <ancestor>`.
- Open steps are exposed generically as `open_steps[]` with
  `resolver: string | null`. `awaiting_human` and `active_human_step` are
  removed; flow steps create no gate rows.
- `apiVersion: murrmure.flow/v1` is the sole clean target — no dual parser or
  v2 reader.

### Added

- Compiler injects `completed` / `failed` **default branches** for steps that
  omit `branches`; explicit and injected defaults are semantically identical.
  Explicit `branches: {}` is **hard-rejected at parse** (HTTP 400, no
  `--strict` needed — the bundle never reaches the index) and custom top-level
  branches require an explicit `route`.
- Single canonical owner for `BranchResolveContract` and
  `OpenStepResolverProjection` in `@murrmure/contracts`.
- Parse hard-reject codes (no `--strict` needed): `LEGACY_START_KEY`,
  `LEGACY_REQUIRES_VIEW`, `LEGACY_STEP_KIND`, `REMOVED_FIELD`,
  `INLINE_SCRIPT_STEP`, `EMPTY_BRANCHES`. `--strict` warning codes:
  `CUSTOM_BRANCH_REQUIRES_ROUTE`, `ROUTE_TARGET_NOT_FOUND`,
  `RESUME_TARGET_NOT_ANCESTOR`, `DEAD_STEP`, `HANDLER_KEY_CONFLICT`,
  `HANDLER_ORPHAN_KEY`, `UNKNOWN_MURRMURE_TOKEN`.
- ADR-007 records the resolver-agnostic step contract and trigger-only clean
  cutover.

### Migration

- Move start conditions from `start:` to `triggers:`. Remove `requires_view`;
  bind Views through `.mrmr/space/handlers.yaml` (`contract_keys`), not the flow.
- Replace `role` / `presentation` / `deriveRole` with resolver-agnostic steps;
  bind execution and human UI in the space.
- Rewrite branches flat: `schema` + optional `artifact_slots` + `route`/`resume`.
  Use `route: { run: completed | failed }` for terminal outcomes; `next: null`
  and `fail_run: true` are gone.
- Read open steps from `open_steps[]`; gate rows no longer exist for flow steps.

## Tutorial v3 clean-state setup (2026-07-14)

### Breaking

- Fresh Hub/Desktop storage now starts with zero spaces, persisted contracts,
  flow installs, and demo flows. Production seed contracts and package-catalog
  stubs are removed from startup and packaging.
- Earlier development databases are not migrated. Quit Desktop and move
  `~/.murrmure` aside once before relaunching.

### Added

- `mrmr setup` now creates one folder-defaulted, user-named space with an
  editable slug used consistently in Hub state and `.mrmr/`.
- `mrmr space init` remains fully offline and creates no credential. Local-tool
  connection creation is a separate later step.

## MCP reliability phase 3 (2026-07-09)

### Breaking

- MCP client onboarding now uses `murrmure-mcp` (package `@murrmure/mcp-bridge`) with thin config shape.
- Legacy fat MCP config examples (`command: "murrmure"` + `args: ["mcp"]` + space-id env pinning) are removed from docs/spec guidance.

## Murrmure v2 product GA — phases 01–10 (2026-07-03)

### Added

- **ViewCanvasHost** — full-screen custom views as the human OS; shell chrome is admin/operator mode.
- **Engine completion** — checkpoint dispatch, `disposition`/`output`, `on_resolve` branching, step outputs.
- **CLI wizards** — `mrmr setup`, `mrmr space onboard`, `mrmr space flow init`, `mrmr space view init`, `mrmr view dev`.
- **Unified agent skill** — single `murrmure` skill with 15 reference files.
- **Docs & proof** — v2 tutorials (16 pages), example trees, CI gates (`check:docs-proof`, `check:fdk-docs`, strict doc-tracker).

### Breaking

- See Phase 09 below (FDK deletion). Apply on `human_only` spaces requires human/bootstrap actor.

## Phase 09 — FDK deletion (2026-07-03)

### Breaking

- **Removed FDK worker runtime** — no `FlowWorkerPool`, `MountRegistry`, live apply, or capability worker bundles in `@murrmure/hub-daemon`.
- **Removed `@murrmure/flow-dev-kit` / `@murrmure/flow-kit`** package and all CLI FDK commands (`mrmr flow init`, `validate`, `build`, `push`, `dev --sim`, evolution subcommands).
- **Removed** `examples/capabilities/` CDK reference trees. Strict-apply test spaces live under `test-utils/spaces/`.
- **`mrmr flow status` / `mrmr flow list`** now read **indexed** flows via `/v1/spaces/:id/index/flows` (no `.flow-push-state.json`).
- Deleted human docs: `flow-evolution`, `reference/flow-dev-kit`.

### Migration

- Author flows under `murrmure/flows/` and index with **`mrmr space apply`** — not `mrmr flow push`.
- Scaffold with **`mrmr space flow init`** and views with **`mrmr space view init`**.
- Custom view apps use **`@murrmure/view-sdk/app`** (`createViewMount`), not flow-kit `/react`.

## Phase 18 — package hygiene (2026-07-01)

### Breaking

- Package directories renamed: `packages/studio-*` → `packages/contracts`, `packages/executors`, `packages/hub-*`.
- npm names: `@murrmure/studio-contracts` → **`@murrmure/contracts`**, `@murrmure/studio-executors` → **`@murrmure/executors`**.
- Default SQLite path: `./data/studio.db` → **`./data/murrmure.db`** (desktop uses `~/.murrmure/murrmure.db`).
- MCP control bus: `studio/control.*` → **`murrmure/control.*`** (invoke_action, wake_pending, tools_changed, handshake_ack, contract_updated).
- Removed CLI legacy env aliases **`STUDIO_API_URL`** / **`STUDIO_API_TOKEN`** — use `MURRMURE_HUB_URL` + `MURRMURE_HUB_TOKEN` only.
- Removed unused **`@murrmure/hub-client`** package (zero dependents).

### Migration

- Update imports from `@murrmure/studio-contracts` → `@murrmure/contracts`, `@murrmure/studio-executors` → `@murrmure/executors`.
- Rename existing `studio.db` to `murrmure.db` or set `DATABASE_PATH` explicitly.
- MCP clients handling control-bus messages must listen for `murrmure/control.*` instead of `studio/control.*`.

## Murrmure v2 (2026-06-30)

Murrmure Space–Flow–Protocol v2 is the normative shipped product. Spec promoted to `studio-specs/current/product/spec.md`.

### Breaking

- Removed v1 HTTP shims: `POST /v1/spaces/{id}/instances`, `POST /v1/mcp/wake`, Configure shell routes (`/configure`, `/setup`).
- Removed v1 MCP platform tools: `get_space_state`, `transition`, `wait_for_state`, `emit_event`, `contract_versions`. Use `murrmure_*` tools (§10.9).
- Removed FDK HTTP install/evolution routes (`POST .../flows/install`, `.../evolution/*`). Worker seeding uses `POST .../flows/{id}/apply` or CLI `mrmr flow push` + apply.
- `@murrmure/flow-dev-kit` renamed to **`@murrmure/flow-kit`**.
- `@murrmure/triggers-templates` folded into hub-daemon lib + CLI templates.

### Added

- **`bun:sqlite` persistence adapter** for desktop bundle (`createRuntimePersistence` selects Bun vs better-sqlite3).
- **`runtime-adapter-http/wire`** — runtime daemon wiring merged from `@murrmure/runtime-daemon`.
- CI **`pnpm spec:lint`** — CloudEvents validation on journal fixtures.
- **`deprecated-removed.test.ts`** — asserts v1 routes return 404.

### Migration

- Instances → **Session + Run** (`POST /v1/sessions`, `POST /v1/sessions/{id}/runs`).
- `mcp_wake` → **`murrmure_invoke_action`** with indexed actions.
- Configure UI → **`mrmr grant mint`**, `/spaces/new`, `/connect`.
