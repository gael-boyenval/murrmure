# Plan — Tutorial 1 v3 full product alignment

**Date:** 2026-07-13  
**Status:** Ready — taskized for execution  
**XD target:** [`apps/docs/guide/tutorials/01-local-preview-review-v3/`](../../apps/docs/guide/tutorials/01-local-preview-review-v3/)  
**Goal:** Make Tutorial 1 v3 true end to end across code, schemas, runtime behavior, Desktop, CLI, View SDK, security, tests, normative specifications, skills, examples, and operator documentation.  
**Build tasks:** [`2026-07-14-tutorial-v3-build-tasks/`](./2026-07-14-tutorial-v3-build-tasks/)

**Inputs:**

- [`plan-analysis-gpt-sol.md`](./plan-analysis-gpt-sol.md)
- [`plan-analysis-glm.md`](./plan-analysis-glm.md)
- [`plan-analysis-opus.md`](./plan-analysis-opus.md)
- The eleven active 2026-07-10/2026-07-13 plans in this directory

This is the coordinating delivery plan. Existing focused plans remain useful research and implementation references, but this plan owns scope, dependency order, path ownership, integration gates, and the definition of full completion. Where a focused plan conflicts with this plan, resolve the conflict before implementation and update both plans.

---

## Refinement decisions

| Date | Decision |
|---|---|
| 2026-07-14 | Clean-slate only: no compatibility code, aliases, adapters, dual-read, deprecation windows, or migrations. |
| 2026-07-14 | Flow steps are resolver-agnostic contracts/events. Remove `role`, `presentation`, `deriveRole`, modality-specific state, and role-based behavior. |
| 2026-07-14 | Spaces bind custom Views through `handlers.yaml` using `type: view_resolver` and `view: <view-id>`. |
| 2026-07-14 | Drop built-in contract/gate resolver forms and fallback resolve controls completely. A standard View may be added later only as a normal plugin. |
| 2026-07-14 | Resolver bindings are exclusive: at most one configured `step.opened::{contract_key}` handler. External authorized protocol clients may still resolve the open step. |
| 2026-07-14 | Generic step lifecycle is `open` → `resolved`; run payload exposes plural `open_steps[]`. Remove `awaiting_human` and `active_human_step`. |
| 2026-07-14 | `mrmr space apply` is allowed only when the space has no non-terminal runs. Otherwise return `409 SPACE_HAS_ACTIVE_RUNS` with blocking run IDs. No force, hot swap, snapshot, or automatic abort path. |
| 2026-07-14 | Zero configured resolver handlers is valid. Remove `HANDLER_MISSING`; an unbound step remains `open` for authorized external resolution and is labeled `no resolver bound` in status/observability. |
| 2026-07-14 | Apply loads and validates the candidate View index before handlers. Every `view_resolver.view` must resolve to an existing View package with a built entry; otherwise apply fails. No warning-only mode or partial apply. |
| 2026-07-14 | Handler authoring uses readable `{flow_name}.{qualified_step_id}` aliases. Apply resolves each alias to immutable `{origin_space_id, flow_id, flow_digest, qualified_step_id}`; duplicate flow names fail, renames require same-apply handler edits, and journals record canonical identity. |
| 2026-07-14 | Exclusivity applies only to `step.opened` resolvers. Multiple `step.resolved` reaction handlers may observe the same canonical step because they cannot resolve it again. |
| 2026-07-14 | Each `open_steps[]` item carries its sanitized applied resolver binding inline: `resolver: null` when unbound, otherwise `{ handler_id, type, view_id? }`. Authorization filters fields; commands, prompts, paths, parameters, and secrets are never included. |
| 2026-07-14 | Removed authoring fields and handler shapes receive only the normal strict-schema unknown-field/invalid-union error. Do not preserve obsolete vocabulary in custom compatibility diagnostics; repository guards prevent reintroduction. |
| 2026-07-14 | Production Views submit payloads and browser `File`/`Blob` objects through a versioned host-mediated message protocol. The trusted host performs upload and step resolution; View code receives no Hub mutation token and has no direct resolve path. |
| 2026-07-14 | The runtime supports concurrent runs against one immutable applied configuration, but admission is space-owned per flow in `handlers.yaml`: `run_policies: [{ flow, max_concurrent_runs }]`. Missing policy means unlimited; `1` serializes. Apply resolves the readable flow alias to its digest. |
| 2026-07-14 | Tutorial v3 does not introduce Git worktrees. Its space policy sets `my-dev-flow` to `max_concurrent_runs: 1`; intermediate files remain run-namespaced for retry, audit, and future concurrency. |
| 2026-07-14 | Capacity overflow does not queue. A start that would exceed `max_concurrent_runs` is atomically denied with `409 FLOW_CONCURRENCY_LIMIT`, the configured limit, and active blocking run IDs. After a blocker becomes terminal, the caller may retry. |
| 2026-07-14 | `.mrmr/dev/runs/{run_id}/` is the only local run scratch root. Remove `.mrmr.temp/runs` completely with no dual-read or migration; any retained cross-space inbox is a separate concept. |
| 2026-07-14 | Failed, rejected, partial, and abandoned upload bytes are deleted immediately. Preserve sanitized diagnostic metadata—not content or host paths—including run/step/branch/slot, filename, declared MIME type, received byte count, hash when available, failure code/stage, actor, and timestamp. Raw-byte quarantine is deferred. |
| 2026-07-14 | Active local run directories are never garbage-collected. After a run becomes terminal, retain `.mrmr/dev/runs/{run_id}` for 7 days, then delete local bytes while preserving journal metadata and artifact manifests. This does not govern Hub/global artifact retention. |
| 2026-07-14 | The 7-day local terminal-run retention is fixed for this release, with no space-level override or persisted retention-policy contract. Configurability may be added later if justified. |
| 2026-07-14 | Local run GC executes once at Hub startup and every 24 hours thereafter. Each pass emits a sanitized summary of scanned runs, deleted directories/bytes, skipped active runs, and failures. No manual GC command ships in this release. |
| 2026-07-14 | Before local handler dispatch, each authorized input artifact is digest-verified and atomically copied to `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`. Local-only artifact path tokens resolve to that absolute copy; public APIs, Views, journals, and remote handlers receive artifact references, never host paths. |
| 2026-07-14 | Dynamic shell placeholders must occupy one complete argument and are shell-quoted exactly once by the runtime. Authors leave placeholders unquoted. Static shell syntax remains allowed; raw interpolation and raw escape syntax do not exist. |
| 2026-07-14 | Multiline `shell_spawn` commands execute as `/bin/sh -e -c` on supported POSIX hosts. They do not load login profiles and do not silently fall back to Bash, PowerShell, or platform-specific shell syntax. |
| 2026-07-14 | On assignment resolution, external resolution, yield, handler timeout, run cancellation, or Desktop shutdown, send `SIGTERM` to the complete POSIX process group, wait a fixed 5 seconds, then send `SIGKILL`. Record exactly one terminal handler result regardless of races. |
| 2026-07-14 | A referenced step-output binding that is missing or `null` fails before process creation with `HANDLER_BINDING_VALUE_MISSING`. An empty string remains a valid single empty argument when allowed by the producer's output schema. |
| 2026-07-14 | Artifact requirements use `schema.required` names matched against same-branch `artifact_slots`. Authors do not declare fake payload properties or artifact-specific JSON Schema formats; the compiler partitions payload and artifact requirements. |
| 2026-07-14 | A same-branch `artifact_slots` entry is optional unless its name appears in `schema.required`. Optional supplied files still receive the complete authorization, slot, size, digest, promotion, and lifecycle validation. |
| 2026-07-14 | Every branch owns its complete resolve schema and artifact-slot contract. The compiler, runtime, View SDK, and prompts consume the selected branch contract directly; no step-level merged schema or artifact-slot union exists. |
| 2026-07-14 | Views and agents obey the same selected-branch artifact contract. A local MCP bridge may accept an agent workspace path, read/upload it locally, and send an artifact reference; the Hub never dereferences an agent-machine path. Remote agents must provide uploaded artifact references. |
| 2026-07-14 | Branch payload schemas use JSON Schema Draft 2020-12 validated by a shared Ajv 8 wrapper in trusted runtimes. Hub validation is authoritative; host validation provides UX parity. Remote `$ref` fetching and user-supplied executable/custom formats are disabled, and Ajv is not compiled inside the untrusted View iframe. |
| 2026-07-14 | JSON Schema `format` assertions use a fixed `ajv-formats` allowlist: `date`, `time`, `date-time`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`, `uri`, and `uri-reference`. Unknown/custom formats fail apply. |
| 2026-07-14 | Contract failures use one transport-neutral shape: `{ code: "CONTRACT_VALIDATION_FAILED", errors: [{ source: "payload" | "artifact", path, rule, message }] }`. Paths are RFC 6901 JSON Pointers. Normalize Ajv errors and never expose raw Ajv internals, schema paths, content, or host paths. |
| 2026-07-14 | `useViewContract()` exposes aggregate submission status (`idle`, `validating`, `uploading`, `resolving`, `succeeded`, `failed`), uploaded/total bytes, and nested submission cancellation. Cancellation before resolve commit deletes temporary bytes and leaves the step open; after commit it returns the resolved result and cannot undo resolution. |
| 2026-07-14 | This release supports only applied, locally built Views hosted by the shell. View iframes use `sandbox="allow-scripts"` without same-origin/navigation/popups/forms/downloads; restrictive CSP blocks direct network/exfiltration. Host messages validate iframe window, protocol version, View/run context, and a per-instance nonce. External View URLs and ambient network permissions are deferred. |
| 2026-07-14 | For `open_steps[].resolver: null`, the shell labels **No resolver bound**, explains that an authorized client must resolve the step, shows safe step/branch/contract metadata, and links handler configuration docs. It provides no generated form, resolve button, or fallback action. |
| 2026-07-14 | `mrmr space init` stays offline and creates no credential. Near the end of `mrmr setup`, the wizard asks whether tools on this computer may access the space. Acceptance creates one local connection and configures selected contexts; decline creates nothing. |
| 2026-07-14 | Murrmure stores connections, not agents. One persistent connection represents a machine/trust boundary and may be installed into several local contexts. Separate machines, CI, team members, or trust boundaries receive separate connections. |
| 2026-07-14 | Desktop shows revoked connections in collapsed read-only history with ID, label, permissions, creation/last-use/revocation timestamps, but never tokens or reactivation controls. Reconnecting creates a new connection. |
| 2026-07-14 | The initial agent profile is exactly `space:read`, `flow:read`, `flow:run`, and `step:resolve`. `flow:read` lets agents inspect graph/current position; `journal:read` stays advanced. Legacy `action:invoke`/`gate:resolve` are excluded and removed if no clean-system use remains. |
| 2026-07-14 | Replace public `mrmr grant mint` with `mrmr connection create` and retain neither `grant mint` nor `agent connect` aliases. Grant remains an internal/advanced authorization term. |
| 2026-07-14 | Replace `mrmr grant use` with local-only `mrmr connection activate <connection-id>` and retain no alias. Creation automatically activates its new connection; activation performs no Hub mutation. |
| 2026-07-14 | Store local agent connection tokens only in the OS credential store keyed by Hub + connection ID. Generated MCP config and local activation state contain IDs only; no token appears in local environment instructions, project files, config, or logs. |
| 2026-07-14 | Local credential lookup fails closed if the OS store is unavailable/locked. Explicit headless/CI mode may accept `MURRMURE_HUB_TOKEN` injected at process runtime by a CI secret manager; it is never written to files, arguments, generated config, or logs. |
| 2026-07-14 | Connection onboarding is harness/context-agnostic. Setup core emits one neutral connection + MCP + skills descriptor; adapters own target detection, MCP configuration, skill installation, reload handoff, and verification. Unknown contexts use a generic no-write adapter with portable instructions. No vendor receives privileged product-default treatment. |
| 2026-07-14 | Setup presents detected integration contexts in a neutral multi-select. A sole result may be preselected but requires confirmation; multiple results allow one or many; no result uses the generic adapter. Never silently prefer a vendor. |
| 2026-07-14 | Setup-created connections are space-wide for their four capabilities and cover current/future flows. Advanced connection creation may restrict to selected already-applied canonical flow identities; do not create ACL entries for nonexistent future aliases. |
| 2026-07-14 | Remove `mrmr space onboard` completely with no redirect or alias. Guided setup is `mrmr setup`; granular operations are `space init/link/apply`; later contexts use `connection create`. |
| 2026-07-14 | Selecting adapters installs the same local connection; it does not create credentials per tool. Shell-spawned harnesses receive short-lived run/step-scoped execution credentials and never require the persistent machine connection. |
| 2026-07-14 | Setup asks for one human-readable space name defaulted from the current folder, derives and displays an editable slug, then uses the confirmed slug consistently in Hub creation, `space.yaml`, link state, and scaffolds. Hub space ID remains immutable. |
| 2026-07-14 | Remove `wait` as a step kind. Every generic step remains open until resolved; time- or event-based waiting is implemented by space handlers that resolve the step. |
| 2026-07-14 | Terminal success is authored by omitting routing on the last `completed` branch. The compiler materializes a canonical terminal-success `advance` route; authored and compiled contracts never use `next: null`. |
| 2026-07-14 | Nested steps use call/return control. An explicit `resume: <ancestor-step>` returns control without reopening or resolving that ancestor; a child branch with neither `route` nor `resume` resumes its immediate parent by default, including `failed`. Immediate run failure requires explicit `route: { run: failed }`. |
| 2026-07-14 | Resume is a protocol event, not transparent process suspension. The parent remains `open`; its resolver receives a normal resume invocation and may resolve itself or use a scoped operation to activate one declared child. Only one child may be active per parent. Existing `complete_parent`, `continue_parent`, and `goto` machinery is removed. |
| 2026-07-14 | The scoped child operation is `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })`. It accepts no arbitrary input, opens only a declared child of the caller-owned open parent, and is idempotent; it never opens or resolves the parent. |
| 2026-07-14 | Successful `murrmure_open_child_step` yields the current parent assignment and revokes its ephemeral mutation credential. The process may exit normally but cannot write again. Child return creates a fresh parent `resumed` assignment; a View resolver instead refreshes in place. |
| 2026-07-14 | Branch authoring stays flat: `schema`, `artifact_slots`, and optional `route`/`resume` are sibling fields. Do not add `payload`, `outcome`, or other wrapper objects. |
| 2026-07-14 | Omitted `branches` injects fixed `completed`/`failed`; an explicit branch map is exact and receives no missing-branch injection. At top level only `completed` and `failed` have control defaults; custom names require `route`, including `route: { run: completed }` for custom terminal success. Nested no-control branches resume their parent. |
| 2026-07-14 | Keep `apiVersion: murrmure.flow/v1` for the clean target. There is no legacy v1 parser, compatibility mode, migration, or parallel v2; v1 is replaced before release rather than preserved as a supported old protocol. |
| 2026-07-14 | Remove authored `kill_on`. The runtime automatically terminates resolver invocations when their assignment resolves externally or locally, yields, cancels, or shuts down, using the standard process-group termination policy. |
| 2026-07-14 | Artifact slots may declare `media_types`, normalized `extensions`, `min_bytes`, and `max_bytes`; every declared constraint must match. Defaults allow empty files (`min_bytes: 0`). No content sniffing ships; tutorial spec slots require at least one byte. |
| 2026-07-14 | An artifact slot is a bounded file collection. `max_files` defaults to `1`; slots may set `min_files` and `max_total_bytes`. Every file is independently validated, normalized duplicate filenames are rejected, and archives remain opaque single files. |
| 2026-07-14 | Fixed local artifact ceilings for this release: 25 MiB/file, 50 MiB/step resolution, 250 MiB/run, and 2 GiB/space across active and retained local run artifacts. Reserve atomically; overflow returns `ARTIFACT_QUOTA_EXCEEDED`, leaves the step open, and deletes/releases temporary bytes. Hub/global storage is separate. |
| 2026-07-14 | Singular artifact `.path` bindings are valid only for singleton slots. Multi-file local handlers use `.directory`, containing verified files with normalized unique names; agents/remote handlers receive ordered artifact-reference arrays. Apply rejects `.path` against `max_files > 1`. |
| 2026-07-14 | Uncommitted uploads expire after one idle hour; cleanup runs at Hub startup and every 15 minutes. Failed/rejected/cancelled and post-promotion temporary bytes are deleted immediately. Local promoted copies follow seven-day terminal-run retention; Hub/global immutable bytes remain while any artifact manifest references them. |
| 2026-07-14 | Every upload requires an explicit Hub-issued intent bound to run, step, branch, slot, ordered file metadata, caller, quota reservation, and idempotency key. Trusted hosts/bridges obtain it before bytes; resolve consumes it atomically. Views receive neither intent nor Hub credentials. |
| 2026-07-14 | No bootstrap contract is operationally required. Fresh Hub/Desktop boot migrates storage but has zero spaces, pinned contracts, and bundled/demo flows; apply uses product-compiled schemas and tests explicitly install fixtures. |
| 2026-07-14 | Archive only historical FDK ADRs/shipped-plan records with an explicit superseded/non-normative banner. Delete FDK capability/bridge pages from `current/` and remove FDK-only production code, fixtures, tests, scaffolds, skills, and user docs; active guidance must not link to FDK material. |
| 2026-07-14 | Local Desktop MCP descriptors use stable `~/.murrmure/bin/murrmure-mcp`, not an app-bundle entry path. Desktop atomically installs/updates the user-only launcher; it reads Hub discovery to execute the current bundled bridge with Hub + connection ID. Headless installs may provide a PATH-managed launcher. |
| 2026-07-14 | This release certifies packaged Desktop launcher/discovery/signing on macOS only. Windows/Linux packaged Desktop emits explicit unsupported-platform behavior; headless PATH launchers remain separate. Keep platform abstraction so future paths preserve the neutral descriptor contract. |
| 2026-07-14 | Injected agent contract blocks begin with `Protocol: murrmure.agent/v1`. This compact line versions prompt structure and generated operation semantics; applied flow digests independently version branch contracts. |
| 2026-07-14 | Agent prompts include deterministic compact full JSON Schema for every active-step branch plus separate artifact constraints. They do not duplicate schemas as prose. Additional scoped contracts show summaries only and use Discovery for full schemas. |
| 2026-07-14 | Cancellation/failure branches receive the same schema, artifact, control-effect, and complete resolve-call rendering as every branch, with schema-valid placeholders. Do not add branch-name-specific explanatory examples or inferred semantics. |
| 2026-07-14 | Git cleanliness is tutorial/space-owned, not Hub behavior. The tutorial's first repository-mutating handler rejects staged, unstaged, or non-ignored untracked changes before mutation; there is no platform Git policy, baseline isolation, or force override. |
| 2026-07-14 | The tutorial final commit includes a repository archive copy at `specs/archive/{run_id}.md` plus allowlisted implementation outputs. The original upload remains an immutable run artifact outside Git; `.mrmr/dev` is never staged. |
| 2026-07-14 | Keep tutorial Git failure behavior simple: a failed archive/commit command exits nonzero and the normal handler/run failure is recorded. No automatic rollback, retry engine, recovery state machine, or special Hub contract. |
| 2026-07-14 | Flow detail and running flow use one shared page/component and graph layout. Before a run it shows the applied graph with a header Run button when available; after start the same page experience gains live state. Route/API transport is an implementation detail, not a separate UX. |
| 2026-07-14 | Logical flow identity is `{origin_space_id, flow_id}`; different origins remain separate even with identical names/content. Current UI rows track the latest applied digest, while each run and historical graph pins `{origin_space_id, flow_id, flow_digest}`. |
| 2026-07-14 | Selecting a graph step opens branches, schemas, artifacts, and resolver metadata in the shared page's existing side panel; do not use a metadata popover. Preserve graph context, and render the panel as a drawer on narrow screens. |
| 2026-07-14 | Space home keeps at most 20 recent completed runs in a fixed-height scrollable card and provides a View all runs link for deeper history; do not paginate or load more within the home card. |
| 2026-07-14 | Graph steps remain rectangular. Add a separate decision diamond only for custom/multi-outcome branching. Plain `completed`/`failed` defaults use a normal success edge plus subdued red edge to one shared failure terminal, with no diamond after every step. |
| 2026-07-14 | The Hub server-projects both authorized branch contracts and sanitized resolver metadata for graph steps. Clients neither compile contracts nor match handlers. `flow:read` exposes protocol schemas/routes/artifact constraints plus safe resolver identity, never commands, prompts, paths, environment, or secrets. |
| 2026-07-14 | Tutorial Markdown remains handwritten. Important fences receive stable IDs; `docs-proof` extracts and structurally/byte-compares them with executable fixture files so prose stays readable without allowing snippets to drift. |
| 2026-07-14 | macOS CI automates package contents, empty boot, stable launcher lifecycle, relocation discovery, bridge handshake, mocked credential failures, and tutorial fixture execution. Manual signed release evidence is limited to notarization/Gatekeeper, real Keychain states, actual upgrade, and real integration-context reload/verification. |
| 2026-07-14 | Tutorial v3 is a living product surface and the canonical manual end-to-end test. Every feature slice updates the affected tutorial steps in the same PR, keeps them clear and directly executable, and manually reruns the affected path. Full releases run Parts 1–6 verbatim. Do not defer tutorial synchronization or usability fixes to T15. |

---

## 1. Authority and delivery principles

1. **The tutorial is the intended experience.** Current implementation is evidence about feasibility, not a reason to weaken the tutorial.
2. **`studio-specs/current/` is normative for shipped behavior until amended.** Every tutorial-driven behavior change updates the corresponding current spec in the same delivery slice.
3. **One compiled contract, many consumers.** Runtime, View SDK, prompt rendering, graph rendering, lint, and tests consume the same compiled branch contract rather than independently interpreting author YAML.
4. **The hub enforces; clients assist.** Client validation improves UX but never substitutes for server-side authorization and validation.
5. **Spaces own execution.** Murrmure defines safe delivery, binding, journaling, and contract enforcement; handler business logic remains space-owned.
6. **Clean-slate cutover.** There are no external users to preserve. Remove superseded schemas, handlers, SDK APIs, grants, paths, fixtures, and code paths in the same slice; do not add dual-read, aliases, deprecation windows, or migration shims.
7. **Steps are resolver-agnostic.** Flows declare contracts, events, branches, and routes—not whether a human, agent, script, or View resolves them. Spaces bind resolver handlers.
8. **No built-in resolver UI.** The shell observes open steps but does not synthesize contract/gate forms or provide fallback resolve controls. A reusable standard View may ship later as a normal plugin.
9. **Apply requires quiescence.** Space configuration never changes beneath a non-terminal run. Apply and run start share a per-space concurrency guard.
10. **Documentation ships with behavior.** No slice is done while current specs, tutorial chapters, references, skills, scaffolds, or enforcement describe another behavior.
11. **Parallel work uses path leases.** A task may not edit another active task's owned paths without an agreed handoff recorded in the PR description.

---

## 2. Definition of full completion

The program is complete only when all of the following are true:

- A fresh packaged Desktop starts with no seeded spaces or phantom flows.
- `mrmr setup` creates the tutorial's user-named space, initializes and links its `.mrmr/` tree, uses the bundled MCP bridge, creates one least-privilege local trust-boundary connection, installs it into selected contexts, survives required reloads, and verifies each installation.
- The exact trigger-only Part 2 manifest strict-applies with no `start` field.
- Plain linear steps with only `id` and `description` compile into step-contract catalog entries with deterministic `completed` and `failed` branches.
- Flow steps and compiled catalog entries contain no `role` or `presentation.view`.
- The intake `continue` branch requires a file and no duplicate payload filename; `cancel` bypasses continue-branch requirements.
- The space binds `my-dev-flow.intake` to `spec-intake-form` through a `view_resolver` handler.
- The exact Part 3 view builds with `useViewContract`, `submitBranch`, `cancel`, and `isViewContractError`.
- The shell contains no built-in step-contract/gate form or fallback resolution control.
- A custom view never receives a general shell or administrative token.
- The exact Part 5 handlers validate and dispatch with `on: step.opened::{contract_key}`, default cwd/delivery, safe argument interpolation, and enforced timeouts.
- The tutorial space config applies `max_concurrent_runs: 1` to `my-dev-flow`; the platform default remains unlimited for flows without a space policy.
- The wizard-connected agent can resolve `build` through `murrmure_resolve_step`; its generated protocol contains live IDs and the actual branch payload contract.
- The Part 6 cleanup reads prior step output safely, archives the correct run's spec, stages only workflow-owned changes, commits deterministically, and journals the commit SHA.
- Run artifacts use one documented scratch root with explicit retention behavior.
- Static and live flow visualizations use compiled/run-pinned data, preserve authorization, show branch/failure shape, and do not leak handler or schema details.
- Applying a space with any non-terminal run fails with `SPACE_HAS_ACTIVE_RUNS`; after all runs become terminal, the same apply succeeds.
- Progressive Tutorial v3 contract, integration, security, CLI, and packaged-Desktop tests are green.
- All six tutorial chapters, current specs, user references, skills, scaffolds, examples, `docs-proof`, and the changelog agree with shipped behavior.

---

## 3. Scope boundaries

### In scope

- Tutorial Parts 1–6 and every product behavior they demonstrate.
- Missing work identified by any of the three analyses, including trigger cutover, step-output shell tokens, wizard naming, cleanup safety, upload lifecycle, and executable tutorial coverage.
- Corrections to all active plans required to remove overlap or invalid sequencing.
- Clean cutovers, authorization, security, observability, federation boundaries, packaging, and documentation enforcement.
- The shell space-home and flow-visualization plan, delivered after the underlying contracts are stable.

### Out of scope

- A broad redesign of the entire branch grammar (`then`, `outcome`, or another new language) beyond decisions required to preserve the tutorial's `next`, `fail_run`, `continue`, and `cancel` behavior.
- Replacing user-owned agent harnesses or handler business logic with a Murrmure runtime.
- General-purpose repository transaction management beyond the safe contract needed by the tutorial cleanup example.
- Remote execution of local filesystem handlers. The tutorial is explicitly a local-space workflow; federation behavior must fail clearly rather than pretending a local path exists remotely.

`2026-07-10-flow-branch-api-simplify.md` therefore remains a non-blocking research track after the tutorial contract is frozen. It must not delay the minimum v3 vertical slice.

### Focused-plan disposition

- `hub-clean-slate-boot` → T09; separate fresh-boot behavior from optional stub/FDK cleanup.
- `desktop-mcp-bridge-exposure` → T10; treat packaged verification as a real Part 1 gate.
- `agent-grant-onboarding` → T08; pull `step:resolve` forward and add the missing space-naming/scaffold work.
- `flow-branch-api-simplify` → T00 decision input only; broader grammar research stays outside the critical path.
- `step-default-branches` → T03; expand it to schema, discrimination, normalization, IR, reachability, lint, runtime, and graph.
- `handler-authoring-simplify` → T05; move shell quoting, token, timeout, and process behavior to T06.
- `agent-prompt-protocol-simplify` → T11; replace brittle golden text with structural assertions.
- `branch-schema-artifact-validation` → T04; own compiler, hub enforcement, upload authorization, and lifecycle only.
- `view-sdk-contracts-and-upload` → T07; own View projection, transport, SDK, shell host integration, dev mode, and scaffolds.
- `run-scratch-path-normalize` → T12; add retention, stale-path deletion, and local/federated boundaries.
- `shell-space-home-and-flow-viz` → T14; split home polish, static graph, live graph, and sensitive metadata into ordered sub-slices.
- Previously uncovered work → T02 trigger cutover, T06 step-output tokens/timeouts, T08 wizard naming, T13 repository safety, and T01/T15 executable conformance.

---

## 4. Parallel delivery model

### 4.1 Accepted shared interfaces

Task **T00** is accepted in
[ADR-005](../ADR/ADR-005-tutorial-v3-contract-ownership.md). That packet names
the canonical package and build-task owner for all ten shared contracts. No task
may invent a different:

- trigger normalization rule;
- default branch and resolver-agnostic step rule;
- compiled branch resolve contract;
- handler key identity;
- shell placeholder/quoting rule;
- `view_resolver` handler and View mutation transport;
- scratch path;
- grant profile;
- repository isolation policy.

### 4.2 Merge waves

| Wave | Parallel tasks | Merge constraint |
|---|---|---|
| **0 — decisions and harness** | T00, T01 fixture extraction | Accepted ADR-005 decisions are the input to behavior code |
| **1 — independent foundations** | T02 triggers, T08 onboarding, T09 clean boot, T10 MCP packaging verification, T12 scratch paths | T09 owns Desktop packaging files until merged; T10 may verify in parallel but rebases before edits |
| **2 — compiler foundation** | T03 defaults/step identity; T01 expands contract tests | T03 merges after T02 |
| **3 — contract/runtime lanes** | T04 artifact contract, T05 handler binding | Both start after T03; they have disjoint owned paths |
| **4 — consumer lanes** | T06 shell execution, T07 View SDK, T11 agent prompt | T07 consumes T04; T11 consumes T03/T04/T05; T06 code can start beside T05 but integration merges after T05 |
| **5 — workflow and operator completion** | T13 cleanup safety, T14 shell visualization, T01 full E2E | T13 consumes T06; T14 consumes T03/T04/T05/T07 |
| **6 — release gate** | T15 conformance, clean-slate removal, docs, and sign-off | No open blocker or superseded code path |

### 4.3 Dependency graph

```text
T00 ─┬─> T02 ─> T03 ─┬─> T04 ─> T07 ─┐
     │                │               │
     │                ├─> T05 ─┬─> T06 ─> T13 ─┐
     │                │        └─> T11 ─────────┤
     │                └──────────────> T14 ──────┤
     ├─> T08 ────────────────────────────────────┤
     ├─> T09 ─> T10 ─────────────────────────────┤
     └─> T12 ────────────────────────────────────┤
T01 runs progressively across all waves ─────────┴─> T15
```

### 4.4 Hot-file ownership

- `packages/contracts/src/flow/manifest.ts`: T02 only.
- `packages/contracts/src/entities/step-contract.ts`: T03 until merge; T04 may extend the frozen compiled branch type afterward.
- `packages/hub-core/src/flow-engine/step-contract-compile.ts`: T03 only; T04 adds branch-contract lowering only after T03 merges.
- `packages/hub-core/src/flow-engine/step-resolve.ts` and `step-artifacts.ts`: T04 only.
- `packages/contracts/src/entities/handler.ts` and handler index/lint: T05 only.
- `packages/executors/src/shell-spawn.ts` and shell binding code: T06 only.
- `packages/view-sdk/**` and view shell adapter/context: T07 only.
- CLI wizard/setup files: T08 only.
- Hub bootstrap and Desktop seed packaging: T09 only.
- MCP bridge discovery/menu/package verification files: T10 after T09.
- `step-contract-slice.ts`: T11 only.
- Scratch path helper and path call sites: T12 only; T04/T06 consume its API after merge.
- Space home and graph UI/API: T14 only.
- `test-utils/spaces/tutorial-v3/**`, `test-utils/tutorial-v3/**`, and tutorial-v3
  test orchestrators: build Task 00 establishes the harness; later build tasks
  edit only their owned snapshot/skeleton assertions and rebase before shared
  fence-registry edits.
- Shared tutorial chapters and normative files use a **documentation lease** named in each task. A later task rebases and edits only its assigned sections.

---

## 5. Work packages

## T00 — Freeze the tutorial-v3 architecture contract

**Decision status:** accepted — see
[ADR-005](../ADR/ADR-005-tutorial-v3-contract-ownership.md). All v3-critical
architecture decisions are accepted inputs to implementation.

### Context

The focused plans contain overlapping Phase 0 questions and competing shapes, especially around branch contracts, View transport, resolver bindings, handler keys, and paths. Parallel implementation without a frozen interface would create incompatible catalogs, duplicate SDK types, and repeated tutorial rewrites.

### Goals

- Decide every cross-task interface needed for the critical path.
- Assign a single owner for each compiled or wire contract.
- Record clean-slate and security decisions before code review becomes the decision forum.

### User stories

- As a flow author, I see one stable authoring vocabulary across tutorial, lint, and runtime.
- As an implementer, I can build one work package without guessing another package's output shape.
- As a reviewer, I can reject contract drift against an approved decision rather than personal preference.

### Technical specification

Record an ADR or normative decision section for:

1. `triggers` as the only start-condition field, complete removal of `start`, and `requires_view` retirement.
2. Plain-step discrimination, default `completed`/`failed` branches, route inference, and complete removal of `role`/`presentation`.
3. The compiled `BranchResolveContract`, including Draft 2020-12 payload schema, Ajv validation boundary, `payload_required`, `artifact_required`, branch-scoped slots, and routes.
4. Artifact/payload name collisions, schema references, optional slots, and agent artifact parity.
5. Canonical handler authoring key versus indexed identity across flow rename, origin, digest, and federation; `view_resolver` type semantics.
6. Per-space exclusion between apply and non-terminal runs, including the run-start/apply race.
7. Shell placeholders as complete safely quoted arguments; multiline shell selection; no raw interpolation or escape hatch.
8. Host-mediated View mutation with no View-held Hub token; postMessage versioning, `File`/`Blob` transport, idempotency, origin, and dev mode.
9. `.mrmr/dev/runs` as local run scratch, retention, stale-path deletion, and distinction from cross-space exchange paths.
10. The least-privilege tutorial agent capability profile.
11. Single-space setup naming and reload/verification UX.
12. Space-owned per-flow run admission policy, Tutorial v3 serialization without Git worktrees, run-namespaced intermediate outputs, path-limited staging, and commit result contract.
13. The complete removal list for every superseded public shape, including code, schemas, tests, fixtures, docs, and skills.

### Automated testing

- Add schema/type fixtures for the chosen wire contracts before consumer tasks begin.
- Add an architecture consistency test that imports the shared branch contract from its canonical package.
- Add a plan/docs check preventing both focused plans from claiming the same View/context ownership.

### Manual testing

- Walk the complete tutorial against the decision packet and confirm every demonstrated field has one defined meaning.
- Threat-model View mutation, upload, shell interpolation, grants, and repository cleanup with security and runtime owners.
- Review the local/federated boundary with one non-local space scenario.

### Documentation surfaces

- **Normative:** new ADR under `studio-specs/ADR/`; affected sections in `studio-specs/current/product/spec.md` and bridge indexes.
- **Plans:** this plan, relevant focused plans, and `studio-specs/plans/README.md`.
- **User docs/tutorials:** keep each affected tutorial section synchronized as its behavior ships. Do not leave knowingly invalid commands or examples in published steps; use an explicit, local status note only where a later dependency is still required.
- **Skills/scaffolds:** enumerate required updates in the ADR; implementation tasks make the edits.
- **Changelog:** none until behavior ships.

### Dependencies and ownership

- **Depends on:** none.
- **Blocks:** T02–T15 behavior work.
- **Owned paths:** the new ADR, this plan's decision-status section, focused-plan ownership/dependency sections.

### Done gate

- Every item above has an approved answer or an explicitly bounded open question that does not alter another task's interface.
- Shared types and owners are named.
- No v3-critical Phase 0 decision remains delegated to implementation.

---

## T01 — Build the executable Tutorial v3 conformance fixture

### Context

No committed fixture executes `my-dev-flow`, and `docs-proof` omits the v3 tutorial. The absence of a progressive fixture allowed prose to describe unshipped APIs and invalid manifests.

### Goals

- Make the tutorial source executable in progressive stages.
- Provide each parallel task a focused acceptance target.
- Prevent future drift between prose, pasted code, scaffolds, and product behavior.

### User stories

- As a tutorial reader, copied manifests and code work exactly as shown.
- As a contributor, I can run one test that identifies which tutorial beat regressed.
- As a docs maintainer, I know when a code example no longer matches a shipping API.

### Technical specification

- Add `test-utils/spaces/tutorial-v3/` with stage snapshots for Parts 2, 3, 5, and 6.
- Keep tutorial Markdown handwritten. Give behavior-defining fences stable IDs and make `docs-proof` extract and compare them with canonical executable fixture files.
- Use structural normalized comparison for YAML/JSON and exact byte comparison where shell/code whitespace is executable. Do not generate tutorial prose or fences.
- Add reusable temporary-hub, temporary-space, temporary-git-repository, fake-agent, and packaged-app test helpers.
- Define progressive suites:
  - manifest parse/strict apply;
  - compiled catalog/contract keys;
  - View typecheck and dev submission;
  - cancel and submit runs;
  - handler copy and explicit agent resolve;
  - cleanup/archive/commit;
  - shell visualization payload.
- Treat the same Parts 1–6 sequence as the canonical manual acceptance script. Each feature task identifies and reruns the smallest affected contiguous path; cross-cutting and release work reruns the entire tutorial.
- Exercise run admission with the tutorial policy: one non-terminal `my-dev-flow` run consumes its only slot, while an unrelated unbounded flow may still start in the same space.
- Do not merge expected-failing tests. Land fixture extraction and helpers first; each behavior task activates its assertions in the same PR as the behavior.

### Automated testing

- `tutorial-v3-contract.test.ts`: exact manifests, handlers, compiled contracts, SDK exports, and docs snippets.
- Fence-ID tests reject missing/duplicate IDs and drift from canonical fixture files.
- Integration tests for HTTP/MCP/CLI paths using the same fixture.
- Make the tutorial fake agent use the real MCP bridge in end-to-end coverage. Keep exhaustive validation/branch tests at the canonical domain-service layer and HTTP behavior in dedicated route tests.
- Apply/run exclusion test: active tutorial run blocks apply with run IDs; terminal run permits retry.
- Candidate-index test: tutorial View loads before `view_resolver` validation; missing/unbuilt View fails without replacing the prior applied index.
- Full E2E for cancel, intake-only, copy/build, and cleanup variants.
- CI matrix for supported Node/platform combinations; packaged Desktop smoke where CI supports it.
- macOS packaged CI covers bundle contents, empty boot, stable launcher install/update/permissions, relocation/discovery refresh, bridge handshake, mocked credential-store failures, and tutorial fixture execution.

### Manual testing

- Perform the tutorial from a clean checkout without unstated environment setup.
- During implementation, rerun every affected tutorial step exactly as written whenever its feature slice changes; record the chapter, environment, and result in the PR.
- Repeat with paths containing spaces and apostrophes.
- Run from packaged Desktop through at least one real supported agent adapter plus the generic adapter; no conformance assertion may depend on one named harness.
- Capture signed release evidence only for notarized/Gatekeeper installation, real Keychain prompt/locked behavior, actual Desktop upgrade, and a real integration-context reload/verification.

### Refinement decisions and open questions

- **Decided:** handwritten stable-ID fences are extracted and compared with executable fixtures; Markdown is not generated.
- **Decided:** deterministic packaged behavior runs in macOS CI; signing/Gatekeeper, real Keychain, actual upgrade, and real integration reload remain manual release evidence.
- **Implementation choice:** tutorial E2E fake agent uses MCP; fast exhaustive tests use the domain service, with HTTP covered independently.

### Documentation surfaces

- **Normative:** `studio-specs/current/acceptance.md`.
- **User docs/tutorials:** all v3 chapters become registered docs-proof inputs.
- **Skills:** no semantic edits; skill examples should reuse fixture paths where possible.
- **Fixtures/examples:** `test-utils/spaces/tutorial-v3/**`.
- **Enforcement:** `packages/cli/test/docs-proof.test.ts`, new tutorial contract and E2E suites.
- **Changelog:** none for test-only slices.

### Dependencies and ownership

- **Depends on:** T00 for final contract assertions; fixture extraction may start immediately.
- **Runs alongside:** every wave.
- **Owned paths:** `test-utils/spaces/tutorial-v3/**`, dedicated tutorial-v3 test files, docs-proof v3 registration.

### Done gate

- Every tutorial beat maps to an automated assertion or a named manual-only packaged-app check.
- No copied code block can drift silently from the fixture/API.
- Tutorial prose, commands, expected results, and troubleshooting are usable for the behavior currently delivered by every merged slice.
- T15 can run the complete fixture without test-specific product bypasses.

---

## T02 — Canonical trigger-only flow manifests

### Context

The tutorial authors `triggers.manual: true`, while the current schema requires `start` and compilation reads it directly. The first tutorial apply therefore fails. Flow-level `requires_view` also conflicts with step-owned presentation.

### Goals

- Make `triggers` the only authoring and runtime field.
- Delete `start` from schemas, types, compiler, fixtures, and docs.
- Remove flow-level `requires_view`; resolver handlers are space-owned.

### User stories

- As an author, I can copy the Part 2 manifest and apply it without hidden fields.
- As an operator, manual-run eligibility is identical across CLI and Desktop.

### Technical specification

- Make `triggers` required by the canonical manifest schema and use it directly through compile, index, scheduler, and preview.
- Allow explicit `triggers: {}` for invoke-only flows. Such flows cannot be started independently from CLI/Desktop, schedules, or external events, but may be invoked by another authorized orchestration flow.
- Remove `start` and all dual-field normalization code.
- Reject any manifest containing `start` through normal strict-schema validation; do not alias, migrate, or add a legacy-specific diagnostic.
- Remove `start.requires_view`; do not replace it in the flow schema.
- Update templates and schema emitters to write only `triggers`.
- Delete stale serialized fixtures and regenerate them from the clean schema.

### Automated testing

- Parse/compile/apply tests for invoke-only empty triggers, missing triggers, manual, schedule, and event triggers.
- Admission tests prove `triggers: {}` blocks independent CLI/Desktop, schedule, and external-event starts while allowing authorized orchestration invocation.
- Rejection tests for `start` and dual `start` + `triggers` manifests.
- Scheduler and manual-run authorization regression tests.
- Template/scaffold snapshot tests showing no new `start`.

### Manual testing

- Strict-apply exact Part 2 YAML.
- Start the flow from CLI and Desktop.
- Apply a manifest containing `start` and verify a hard, actionable error with no fallback.

### Refinement decision

- `triggers: {}` is valid and means **invoke-only**: no independent CLI/Desktop, schedule, or external-event start; authorized orchestration invocation remains allowed.

### Documentation surfaces

- **Normative:** `studio-specs/current/product/spec.md`, flow/trigger bridge sections, `studio-specs/current/cli/spec.md`.
- **User docs:** `apps/docs/guide/creating-flows.md`, trigger/reference pages.
- **Tutorial:** Part 2 and any troubleshooting text mentioning `start`.
- **Skills:** developer flow-authoring reference and flow templates.
- **Scaffolds/examples:** CLI flow templates and test fixtures.
- **Enforcement:** docs-proof and repository guards ban `start`.
- **Changelog:** clean trigger cutover and removal list.

### Dependencies and ownership

- **Depends on:** T00 trigger decision.
- **Blocks:** T03 and complete fixture apply.
- **Owned paths:** flow manifest schema/parser, start-condition compile/index/scheduler call sites, flow templates.

### Done gate

- Exact Part 2 manifest strict-applies and starts manually.
- An invoke-only manifest strict-applies, is absent from independent run affordances, rejects independent starts, and remains invocable by authorized orchestration.
- `start` has no schema/type/runtime path and is rejected.
- No template, fixture, skill, spec, or tutorial emits `start`.

---

## T03 — Plain-step identity, default branches, routes, and modality removal

### Context

`branches` is required for nested step contracts and presence of branches is used as the step-contract discriminator. Plain tutorial steps are rejected or dropped before catalog compilation. Current role and presentation fields also make portable steps depend on a resolver modality.

### Goals

- Compile `{id, description}` as a first-class step contract.
- Inject deterministic `completed` and `failed` branches before any filtering.
- Remove `role` and `presentation` from authored and compiled step contracts.

### User stories

- As an author, I only describe branches that differ from the linear default.
- As a handler author, every plain step has a stable contract key.
- As an operator, explicit and default branches appear identically in run state and graphs.

### Technical specification

- Make authored `branches` optional; reject explicit empty `{}`.
- Keep the clean target under `apiVersion: murrmure.flow/v1`; delete superseded v1 shapes instead of adding a v2 or dual-version parser.
- Keep each authored branch flat: `schema`, `artifact_slots`, and optional `route`/`resume` are siblings. Reject wrapper shapes such as `payload:` or `outcome:`.
- When `branches` is omitted, inject fixed `completed` and `failed`. When present, preserve the exact authored branch set and do not inject a missing standard branch.
- Replace branch-presence discrimination with an explicit normalized step-contract decision.
- Normalize top-level and nested steps before catalog filtering, IR flattening, reachability, handler coverage, and graph construction.
- Inject:
  - `completed.next` to the next sibling when omitted;
  - canonical terminal-success `advance` routing for `completed` on the last **top-level** sibling, with no nullable `next`;
  - implicit resume of the immediate parent when any nested branch omits both `route` and `resume`, including `failed`;
  - `failed.fail_run: true` only for top-level default branches;
  - no inferred top-level route for custom branches such as `continue` or `cancel`; require explicit `route: { step: ... }`, `route: { run: completed }`, or `route: { run: failed }`.
- Add explicit `resume: <ancestor-step>` authoring and compiled routing. Apply rejects unknown, non-ancestor, or self targets.
- Resume leaves the ancestor `open`, emits a canonical resume event carrying child identity, branch, iteration, payload, and artifact references, and never emits another parent `step.opened`.
- Add `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })`. It accepts no arbitrary input, opens only a declared child while the caller-owned parent remains open, and enforces one active child per parent atomically.
- Return the canonical parent/child identities, child iteration, and open status. Reusing the same idempotency key returns the original result; reusing it with different arguments fails.
- On successful child open, atomically mark the current parent assignment `yielded` and revoke its ephemeral mutation credential. Later protocol writes from that assignment fail; the process may exit normally.
- When the child returns, create a fresh parent assignment with reason `resumed`. Do not overlap it with the yielded assignment. A `view_resolver` has no process assignment and receives refreshed context in place.
- Treat resume as a new resolver invocation, not restoration of an OS process. Adapters may resume an existing agent session, but the protocol guarantees no process/session continuation.
- Remove `complete_parent`, `continue_parent`, `goto`, and automatic parent resolution. A child never resolves or validates its parent's branch contract.
- Make dispatch and `complete:auto` depend only on matched space handlers, never a compiled step role.
- Materialize defaults into the compiled catalog so all consumers see authored-equivalent data.
- Remove `role`, `presentation`, `deriveRole`, role-based handler lint, and role-based runtime dispatch/auto-completion.
- Expose only generic `open` → `resolved` step lifecycle and plural `open_steps[]`; remove `awaiting_human` and `active_human_step`.
- Make `complete:auto` a property of the matched execution handler, never of the step.
- Preserve explicit branches that remain part of the target language; remove explicit and inferred wait-step shapes entirely.

### Automated testing

- Schema and compiler tests for plain, explicit, nested, last, empty-branches, removed wait shapes, and custom-schema steps.
- Catalog, IR, reachability, handler-lint, runtime bootstrap, and graph parity tests.
- Absence guards for `role`, `presentation.view`, `deriveRole`, `awaiting_human`, and role-based dispatch.
- Runtime/API tests for `open` → `resolved` and zero/one/multiple `open_steps[]`.
- Nested call/return tests for implicit immediate-parent resume, explicit ancestor resume, child failure resume, explicit run failure, one-active-child enforcement, and parent-owned child activation.
- Verify resume never emits a second parent `step.opened`, never resolves the parent, and validates the parent's payload/artifacts only when the parent resolves itself.
- Adapter tests prove shell invocations are not process-restored while agent adapters may reuse an agent session without changing protocol semantics.
- Yield-race tests prove child open, assignment yield, credential revocation, and child activation commit atomically; stale parent writes fail and only one fresh resume assignment is created.
- Verify `contract-keys.json` contains `write_spec`, `build`, and `cleanup`.
- Regression snapshots for target explicit-branch fixtures.

### Manual testing

- Strict-apply Parts 2, 5, and 6 in sequence.
- Inspect compiled catalog and graph for expected routes.
- Run a shell `complete:auto` step and an explicit agent step.
- Exercise a nested child returning control to its parent, then have the parent activate another child and finally resolve its own contract.

### Refinement decisions and open questions

- **Decided:** `wait` is not a step kind. A generic step remains open until a time- or event-driven space handler resolves it.
- **Decided:** omit authored routing for terminal `completed`; compile it to canonical terminal-success `advance` routing and never serialize `next: null`.
- **Decided:** nested branches default to resuming their immediate parent. Explicit `resume` may target an open ancestor. Resume never opens or resolves the ancestor; even nested failure returns control unless the branch explicitly routes to run failure.
- **Decided:** parent resolvers may open one declared child at a time with `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })`. The operation has no arbitrary input and never changes the parent state. Resume is a normal event invocation, not transparent process suspension.
- **Decided:** successful child open yields the current parent assignment and revokes its mutation credential. Child return creates a fresh resumed assignment; View resolvers refresh in place.
- **Decided:** branch contracts remain flat; no payload/outcome wrappers.
- **Decided:** omitted branches inject fixed `completed`/`failed`; explicit maps are exact. Only top-level standard names receive control defaults, while custom top-level branches require an explicit route.
- **Decided:** retain `murrmure.flow/v1` as the sole clean target version; no old-v1 or v2 compatibility path exists.

### Documentation surfaces

- **Normative:** `studio-specs/current/bridges/step-contract.md`, product flow semantics.
- **User docs:** `apps/docs/guide/creating-flows.md`.
- **Tutorial:** Parts 2, 5, and 6.
- **Skills:** developer flow-authoring reference.
- **Scaffolds/examples:** minimal-flow templates and target explicit-branch fixtures.
- **Enforcement:** strict-apply and docs-proof assertions for branchless tutorial steps.
- **Changelog:** default branches and resolver-modality removal.

### Dependencies and ownership

- **Depends on:** T00 resolver-agnostic decision, T02 normalized manifest.
- **Blocks:** T04, T05, T11, T14.
- **Owned paths:** step-contract author schema, normalization/compiler pipeline, catalog-key generation, default-route tests.

### Done gate

- Every tutorial plain step is present in schema, IR, catalog, contract keys, handler lint, runtime, and graph.
- Default and explicit branches are semantically identical downstream.
- No authored or compiled step carries resolver modality or View identity.
- Explicit branches retained by the target language do not change behavior.
- Nested child return never bypasses parent contract validation or creates a duplicate parent-open event.

---

## T04 — Branch-scoped payload and artifact contract

### Context

The tutorial uses `schema.required: [spec]` with an artifact slot and an empty payload. Current validation treats `spec` as a payload field, merges slots at step scope, writes uploads before enforcing limits, and leaves abandoned scratch data.

### Goals

- Lower authoring sugar into one explicit compiled branch contract.
- Enforce required files on every resolve path.
- Bound and authorize uploads before resource consumption.
- Make artifact lifecycle observable and deterministic.

### User stories

- As a view author, I can require a file without inventing a duplicate filename field.
- As an agent, I receive the same artifact requirements as a human view.
- As an operator, invalid or oversized uploads do not resolve a step or leak disk indefinitely.

### Technical specification

- Add the canonical `BranchResolveContract` decided in T00:
  - payload schema;
  - `payload_required`;
  - `artifact_required`;
  - branch-scoped `artifact_slots`;
  - routes/presentation fields needed by consumers.
- Materialize one complete `BranchResolveContract` per branch and remove step-level merged schema/artifact-slot representations.
- Partition `schema.required` during compile, not independently in each client.
- A required name matching a same-branch artifact slot is an artifact requirement even when absent from `schema.properties`; do not require or synthesize a fake payload property/format.
- Reject payload-property/artifact-slot collisions.
- Standardize payload schemas on JSON Schema Draft 2020-12 and one shared Ajv 8 wrapper used by trusted host/apply/Hub code.
- Keep Hub resolve validation authoritative; host validation uses the same wrapper for field-level UX, while the untrusted View iframe receives errors and never compiles Ajv.
- Disable remote `$ref` fetching and user-supplied executable/custom formats. Support self-contained/local Draft 2020-12 references only after safe resolution needed for top-level artifact partitioning.
- Enable only the fixed vetted `ajv-formats` allowlist recorded in the refinement decisions; unknown/custom formats fail apply.
- Normalize payload and artifact failures into the shared `CONTRACT_VALIDATION_FAILED` envelope with `source`, RFC 6901 `path`, stable `rule`, and human `message`.
- Use the same error projection for View host, Hub HTTP, MCP, and CLI; do not expose raw Ajv `schemaPath`/params, artifact content, or host paths.
- Validate payload and required artifacts before promotion.
- Authorize upload against active run, step, branch, slot, count, filename, and byte limits.
- Extend each artifact slot with optional `media_types`, normalized `extensions`, `min_bytes`, and `max_bytes`. Enforce every declared constraint and require `min_bytes <= max_bytes` when both exist.
- Default `min_bytes` to `0`; empty files are valid unless the slot raises it. Treat MIME as declared upload metadata and do not content-sniff in this release.
- Normalize the basename and compare extensions case-insensitively. If a media-type or extension allowlist is declared, missing or mismatched metadata fails validation.
- Model each slot as a bounded file collection. Default `max_files` to `1`; allow `min_files` and `max_total_bytes`; reject invalid ranges and normalized duplicate filenames. A required slot has effective `min_files >= 1`.
- Represent multi-file submissions as repeated artifact references for one slot and browser `File[]`; validate every file independently plus the slot aggregate. Treat an archive as one opaque file and never inspect/extract it in the trusted upload path.
- Preserve deterministic submission order in the compiled/resolve representation. Local singleton slots expose `.path`; multi-file slots expose `.directory`; agents and remote handlers receive ordered reference arrays.
- Enforce fixed local ceilings with no configuration in this release: 25 MiB per file, 50 MiB per step resolution, 250 MiB per run, and 2 GiB per space across active and retained `.mrmr/dev/runs` artifact bytes. Slot limits may only lower these ceilings.
- Reserve byte/count capacity atomically before writing. Overflow returns `ARTIFACT_QUOTA_EXCEEDED`, keeps the step open, and immediately deletes/releases temporary bytes and reservations. Hub/global artifact storage uses a separate policy.
- Set the tutorial `spec` slot to `media_types: [text/markdown, text/plain]`, `extensions: [.md, .markdown]`, `min_bytes: 1`, and `max_bytes: 1048576`.
- Enforce encoded-request and decoded-byte bounds before/while writing; prefer bounded multipart/streaming over unbounded base64.
- Promote atomically and define cleanup for validation failure, cancel, terminal run, daemon restart, and retention expiry.
- Delete failed, rejected, partial, and abandoned raw upload bytes immediately; debugging must not depend on retaining untrusted content.
- Give incomplete/uncommitted uploads a one-hour idle lease refreshed by accepted activity. Sweep expired leases at Hub startup and every 15 minutes; release quota reservations with deletion.
- Require a Hub-issued upload intent before accepting bytes. Bind it to run, step, selected branch, slot, ordered filenames/MIME/sizes, actor, exact quota reservation, and idempotency key.
- Validate active state, authorization, branch contract, cardinality, metadata constraints, and capacity before issuing the intent. Upload endpoints accept only bytes matching that intent.
- Resolve consumes all submission intents atomically with branch resolution. Same-key retries return the original result; mismatched reuse fails. Expiry/cancel releases reservations and deletes bytes.
- Keep intent acquisition and use inside trusted hosts/bridges; Views receive progress/results only and never see an intent ID or Hub credential.
- After successful atomic promotion, delete temporary upload bytes immediately. Local promoted copies follow T12's seven-day terminal-run retention.
- Retain Hub/global immutable artifact bytes while referenced by any artifact manifest. Do not add time-based global deletion in this release.
- Persist sanitized upload-attempt diagnostics with run/step/branch/slot, filename, declared MIME type, received bytes, hash when available, failure code/stage, actor, and timestamp. Never record file content or host paths.
- Preserve optional slots and agent `artifacts_out` parity.
- For local MCP agents, allow bridge-local workspace paths as ergonomic input: the bridge authorizes, bounds, reads, and uploads bytes, then sends only the resulting artifact reference to the Hub resolve path.
- Reject local path values from remote/federated agents and every direct Hub API; the Hub never reads a path from another machine.
- An artifact slot absent from same-branch `schema.required` is optional; when supplied, enforce every normal upload and promotion rule.
- Treat promoted/global artifacts as immutable inputs. Local consumers receive a verified run-scoped copy prepared through T12's path API; remote consumers receive an artifact reference for materialization in their own space.
- Emit safe metrics/journal diagnostics without exposing host paths or credentials.

### Automated testing

- Compiler tests for file-only requirements without fake properties, mixed payload/file, optional slots omitted/supplied, collisions, refs, per-branch differences, duplicate slots, and absence of any step-level merged contract.
- Draft 2020-12 conformance/parity tests run the same vectors through trusted host validation and authoritative Hub validation; remote refs/custom executable formats fail apply.
- Cross-transport golden tests prove View, HTTP, MCP, and CLI return the same normalized errors and redact Ajv/host internals.
- Hub/MCP/CLI resolve tests for missing file, missing payload, unknown slot, traversal, empty file, oversized file, malformed encoding, replay, and terminal run.
- Artifact metadata tests for MIME/extension conjunction, normalized and case-insensitive extensions, missing metadata, default-empty acceptance, explicit non-empty enforcement, and invalid min/max apply.
- Collection tests for default singleton, required/non-required `min_files`, maximum count, per-file plus aggregate bytes, repeated slot references, `File[]`, duplicate normalized names, and opaque archives.
- Binding tests reject singular `.path` against multi-file slots and prove `.directory` contains ordered-manifest-equivalent, digest-verified files with normalized unique names.
- Atomic quota tests at exact/overflow boundaries for file, step, run, and concurrent space reservations; overflow leaves the step open and leaks no bytes/reservations.
- Local-agent bridge tests for workspace-path upload plus remote/direct-Hub rejection of machine-local paths; all routes enforce the same selected-branch contract.
- Resource tests proving rejection occurs before unbounded memory/disk growth.
- Cleanup/restart tests for abandoned uploads.
- Fake-clock lease tests for activity refresh, exact one-hour expiry, startup/15-minute sweep cadence, post-promotion deletion, and manifest-referenced global retention.
- Intent tests for pre-byte authorization, metadata mismatch, stale branch/step, replay/idempotency mismatch, atomic resolve consumption, cancellation/expiry cleanup, and View redaction.
- Diagnostic tests prove rejected bytes are removed, useful metadata remains observable, and content/host paths never enter logs, journals, or API payloads.

### Manual testing

- Submit and cancel the Part 3/4 intake.
- Inspect promoted bytes, journal manifest, stable path, and cleanup behavior.
- Attempt an oversized upload and verify actionable UI/operator feedback.

### Refinement decisions and open questions

- **Decided:** full trusted-runtime Draft 2020-12 validation through the shared Ajv wrapper.
- **Decided:** optional `media_types`/`extensions`/`min_bytes`/`max_bytes` constraints all apply; no content sniffing; empty files are allowed unless `min_bytes` says otherwise.
- **Decided:** slots are bounded collections with default `max_files: 1`, optional `min_files`/`max_total_bytes`, repeated same-slot references, and no archive extraction.
- **Decided:** fixed local ceilings are 25 MiB/file, 50 MiB/step resolution, 250 MiB/run, and 2 GiB/space; no release-time configurability.
- **Decided:** one-hour idle upload leases with startup/15-minute cleanup; immediate failed/post-promotion temp deletion; seven-day local promoted retention; manifest-referenced global artifacts have no time expiry.
- **Decided:** upload intent is explicit and Hub-issued before bytes; it binds state, authorization, metadata, quota, and idempotency and is consumed atomically by resolve.

### Documentation surfaces

- **Normative:** `studio-specs/current/bridges/step-contract.md`, `artifacts.md`, security/execution-boundary spec.
- **User docs:** artifact and resolve references.
- **Tutorial:** Parts 2 and 4; only behavior text, not View SDK API ownership.
- **Skills:** agent resolve protocol and developer flow authoring.
- **Scaffolds/examples:** artifact fixture data and MCP/CLI examples.
- **Enforcement:** tutorial contract tests and upload security tests.
- **Changelog:** file-only contracts, errors, limits, and retention.

### Dependencies and ownership

- **Depends on:** T00 compiled contract, T03 branch catalog.
- **Blocks:** T07 and T11.
- **Owned paths:** branch resolve contract in contracts package after T03 handoff, compile lowering, resolve/artifact helpers, upload/resolve routes.
- **Explicit non-ownership:** no View SDK, shell View context, or view scaffold edits.

### Done gate

- Missing `spec` is rejected server-side without resolving the step.
- Empty payload plus valid `spec` succeeds.
- Cancel does not require or promote `spec`.
- Upload limits and cleanup are enforced before resource exhaustion.
- Singleton and multi-file slots enforce per-file, aggregate, run, and space limits atomically without resolving on overflow.
- All consumers can import one canonical compiled branch type.

---

## T05 — Handler authoring keys, defaults, indexing, and clean cutover

### Context

The tutorial's `on: step.opened::my-dev-flow.write_spec` is rejected by the handler schema, and handlers without `contract_keys` are not indexed. Views are currently selected from flow-owned `presentation.view`, which violates resolver-agnostic portability. Canonical identity across names, origins, digests, and federation is unspecified.

### Goals

- Make event plus contract key the canonical concise authoring form.
- Keep `contract_keys` for prompt scope, not dispatch duplication.
- Add a space-owned `view_resolver` handler type for custom View binding.
- Define stable resolution and remove the superseded dispatch shape.

### User stories

- As a handler author, I bind one handler to one step in one readable field.
- As a space author, I bind one View/agent/script resolver or leave the step unbound for external clients.
- As an external client, I can resolve an unbound open step without a placeholder space handler.
- As a flow author, strict apply catches missing, ambiguous, or renamed bindings.
- As an operator, handler dispatch and displayed metadata refer to the same canonical step.

### Technical specification

- Extend `HandlerOnSchema` with the approved lifecycle/key syntax.
- Parse authored `{flow_name}.{qualified_step_id}` aliases and resolve them against the candidate flow catalog to `{origin_space_id, flow_id, flow_digest, qualified_step_id}`.
- Reject duplicate flow names and ambiguous/unknown aliases during apply.
- Index dispatch from `on::key`; use `contract_keys` only for prompt/discovery scope.
- Remove `HANDLER_MISSING` and every role-based handler-coverage requirement. Zero matching handlers is valid.
- Add:

  ```yaml
  - id: spec-intake-form
    on: step.opened::my-dev-flow.intake
    type: view_resolver
    view: spec-intake-form
  ```

- Add a top-level space execution policy in `handlers.yaml`:

  ```yaml
  run_policies:
    - flow: my-dev-flow
      max_concurrent_runs: 1
  ```

- Resolve `run_policies[].flow` through the same candidate flow catalog as handler aliases and index by flow digest.
- Require `max_concurrent_runs` to be an integer ≥ 1; reject duplicate, unknown, or ambiguous policy aliases. No policy means unlimited.
- Enforce the policy on every run-start path—manual, trigger, API, MCP, and federated request—using one atomic admission check so concurrent starts cannot exceed capacity.
- Do not create a queue. Deny an over-capacity start with `409 FLOW_CONCURRENCY_LIMIT`, including canonical flow identity, configured limit, and active blocking run IDs; internal trigger delivery records the same typed denial for observability.
- Once a blocking run is terminal, the next explicit or trigger retry performs a fresh atomic admission check.
- `view_resolver` has no `command`, `cwd`, `delivery`, `timeout_ms`, or `complete`.
- A `view_resolver` is discoverable for the entire open-step lifetime, may render in multiple authorized clients, and resolves using the viewing user's authorization.
- Allow at most one configured resolver handler of any type per `step.opened::{contract_key}`. A View may render in multiple clients, but it remains one handler binding; the first valid protocol resolution wins.
- Allow multiple `step.resolved::{contract_key}` reaction handlers. They are post-resolution observers/side effects, not resolvers, and cannot submit another resolution.
- Treat the exclusive `step.opened::{parent_key}` resolver binding as the owner for the parent's complete open lifetime. A nested resume invokes that same binding with reason `resumed` and returned-child context without emitting another parent `step.opened`.
- Resume leaves the parent open. Shell/script resolvers receive a normal new invocation; adapters may reuse an agent session, but protocol correctness never depends on process/session restoration.
- Give the parent assignment an ephemeral, parent-scoped capability to call `murrmure_open_child_step`. Enforce one active child per parent atomically, reject unrelated targets and arbitrary input, and preserve idempotent retries.
- A successful child open atomically yields the current parent assignment and revokes its mutation credential. Child return creates exactly one fresh resumed assignment; stale writes fail. `view_resolver` refreshes in place.
- Remove `kill_on` from handler schemas and authoring. Assignment resolve, external resolution, yield, cancellation, and shutdown automatically terminate any active resolver invocation through the standard SIGTERM/grace/SIGKILL process-group path.
- No connected viewer is not a delivery failure; the step remains open.
- Attach the applied binding directly to each `open_steps[]` item as `resolver: null | { handler_id, type, view_id? }`; `view_id` exists only for `view_resolver`.
- Produce the resolver descriptor server-side from the canonical applied handler match. Filter it by caller authorization and never include commands, prompts, paths, parameters, environment, or secrets.
- Render `resolver: null` as **No resolver bound** with: “This step remains open until an authorized client resolves it.” Show safe step identity, branch names, and contract metadata plus a handler-configuration documentation link; provide no form, resolve button, or fallback action.
- Build a candidate View index before parsing/validating handlers. Resolve every `view_resolver.view` against that candidate index.
- Missing View id returns `VIEW_RESOLVER_VIEW_NOT_FOUND`; missing/invalid built entry returns `VIEW_RESOLVER_BUILD_MISSING` (final names may follow the repository error convention).
- Apply commits the View/flow/handler index atomically only after every resolver reference validates; no partial index is visible.
- Default omitted `cwd` to space root and `delivery` to fail-fast.
- Detect key collisions across local/federated origins.
- Reject `mrmr space apply` while any run in the space is non-terminal with `409 SPACE_HAS_ACTIVE_RUNS` and blocking run IDs.
- Serialize apply and run start with a per-space guard so one operation wins atomically; no run may start against a partially replaced index.
- Do not add force apply, automatic abort, handler snapshots, or hot swapping. Once all runs are terminal, apply replaces the complete active space index.
- Record the applied handler/config digest and selected handler ID in dispatch/journal metadata for audit.
- Record canonical origin space + flow id + flow digest + qualified step id in dispatch/journal metadata.
- A flow rename must update all affected handler aliases in the same atomic apply; stale aliases hard-fail.
- Remove lifecycle-only `on` plus dispatch-through-`contract_keys`; do not dual-index it or retain a custom legacy-shape diagnostic beyond normal strict-schema failure.
- Keep handler matching server-side for later graph metadata.

### Automated testing

- Schema/parser/index tests for tutorial handlers and run policies, rejection of removed handlers, malformed separators, invalid capacities, duplicates, missing keys, collisions, rename, and origin identity.
- Alias-resolution tests for duplicate flow names, nested qualified ids, unknown steps, same-apply rename, origin separation, canonical digest changes, and journal identity.
- `view_resolver` schema, resolver exclusivity, View existence, open-lifetime, multi-client, authorization, and stale-view tests.
- Multi-reaction tests prove all matching `step.resolved` handlers receive the canonical event and none can re-resolve the step.
- Resume-dispatch tests prove the same exclusive parent resolver binding receives returned-child context, the parent stays open, and no duplicate open event or implicit parent resolution occurs.
- Child-activation authorization/race tests prove only declared children are addressable and only one is active per parent.
- Assignment-yield tests prove child open revokes the previous mutation credential before child dispatch and child return cannot overlap old/new authorized parent assignments.
- Automatic-lifecycle tests cover local resolve, external resolve, yield, cancel, shutdown, and exit races and prove exactly one terminal handler result without authored `kill_on`.
- Apply-order tests prove candidate Views are available to handler validation and invalid View references leave the previous applied index untouched.
- Resolver-projection tests for inline bound metadata, `view_id` only on `view_resolver`, authorization filtering, sensitive-field absence, and `open_steps[].resolver = null` when unbound.
- Unbound-step tests for strict apply success, external protocol resolution, and status/shell copy.
- Strict-apply tests against the complete Part 5/6 handlers file.
- Dispatch tests for shell and explicit agent handlers.
- Apply-concurrency tests for open/running versus terminal runs, multiple blockers, apply/run-start races, and retry after completion/cancel.
- Atomic run-admission tests across manual, trigger, API, MCP, and federated starts; no policy permits concurrency, while `max_concurrent_runs: 1` never admits two non-terminal runs of the same canonical flow.
- Capacity tests assert no queued run is created, the typed denial includes active run IDs, trigger denial is observable, and retry succeeds after a blocker becomes terminal.
- Capability/redaction tests for handler metadata lookup.

### Manual testing

- Apply and run `write_spec_copy`, `dev_build`, and `cleanup_archive_commit`.
- Open `intake` with the View resolver from two authorized clients; resolve in one and confirm the other becomes stale.
- Open an unbound step, verify `no resolver bound`, then resolve it from an authorized external client.
- Attempt apply during the run, inspect `SPACE_HAS_ACTIVE_RUNS`, finish/cancel the run, and apply successfully.
- Rename a flow and inspect the hard stale-binding guidance.
- Verify omitted cwd/delivery behavior from a path with spaces.
- Resume a parent from a child, call `murrmure_open_child_step` for another declared child, and then resolve the parent's own validated contract.

### Documentation surfaces

- **Normative:** `studio-specs/current/bridges/handlers.md`, step-contract handler sections.
- **Normative:** apply/run concurrency and error contract in CLI/hub/space specs.
- **User docs:** `apps/docs/guide/space-handlers.md`.
- **Tutorial:** Parts 2, 3, 5, and 6; move `spec-intake-form` binding from the flow into handlers.
- **Skills:** developer handler authoring and agent handler scope.
- **Scaffolds/examples:** `handlers.yaml` templates and target fixtures only.
- **Enforcement:** strict handler lint/docs-proof.
- **Changelog:** new syntax, defaults, and removed fields.

### Dependencies and ownership

- **Depends on:** T00 identity rule, T03 catalog keys.
- **Blocks:** T11 and T14; T06 integration tests.
- **Owned paths:** handler schema, parser, index, lint, dispatch matching.
- **Explicit non-ownership:** shell command interpolation/execution belongs to T06.

### Done gate

- Exact tutorial handlers strict-apply and dispatch once.
- Tutorial `my-dev-flow` resolves to a canonical `max_concurrent_runs: 1` policy; a flow without a policy remains unlimited.
- A second tutorial start is denied with `FLOW_CONCURRENCY_LIMIT` rather than queued and succeeds when retried after the active run terminates.
- `intake` uses a space-owned `view_resolver`; the flow contains no View identity.
- A second configured `step.opened` resolver for the same contract key fails apply.
- Multiple `step.resolved` reactions for the same key apply and dispatch; resolver APIs reject the already-resolved step.
- Zero configured resolver handlers strict-applies; the step stays open and externally resolvable.
- Candidate Views load before handler validation; a missing View package/build fails apply atomically.
- Every authored alias resolves once during apply; runtime dispatch and journal use only canonical digest + qualified step identity.
- Apply is impossible while any run is non-terminal and succeeds immediately after all blockers become terminal.
- `contract_keys` is not required for dispatch.
- Removed handler syntax has no dispatch/index path and fails validation.
- Key collisions and stale bindings fail visibly.

---

## T06 — Safe shell execution, prior-step tokens, paths, and timeouts

### Context

The Part 6 `{{steps.build.output.*}}` values are not wired into step-contract shell command bindings in the relevant execution path, tutorial placeholders are quoted inconsistently with executor quoting, detached handlers ignore `timeout_ms`, and artifact path semantics are unclear.

### Goals

- Make every tutorial shell token resolve from one audited context.
- Prevent command injection and accidental literal quoting.
- Enforce timeout/cancellation for detached process trees.
- Make path and shell semantics portable and observable.

### User stories

- As a handler author, prior step output and artifacts resolve predictably.
- As an operator, a hung command terminates and produces one clear terminal event.
- As a security reviewer, agent-controlled commit text cannot become executable shell.

### Technical specification

- Expose `steps.{step_id}.output.{field}` from run execution context to shell binding resolution.
- Validate token step/field references at apply time where contracts permit; unknown tokens must not silently become empty strings.
- At dispatch, fail a missing or `null` referenced output with `HANDLER_BINDING_VALUE_MISSING` before process creation. Preserve an empty string as one empty argument when the producer schema permits it.
- Require each placeholder to occupy one complete argument and shell-quote every substituted value exactly once.
- Reject placeholders embedded inside static argument text or author-added quotes.
- Do not implement raw interpolation, a raw placeholder namespace, or another dynamic shell-fragment escape hatch.
- Execute multiline scripts as `/bin/sh -e -c` on supported POSIX hosts. Do not load login profiles or silently choose another shell.
- Before spawning a handler, issue an ephemeral execution credential bound to space, run, step, and selected handler. It may read only the assigned run context and resolve only that open step.
- Deliver the ephemeral credential only inside the child execution envelope/temporary MCP descriptor; never expose the persistent machine connection. Revoke it on step terminal, handler exit, timeout, cancellation, or Desktop shutdown and redact it everywhere.
- Enforce `timeout_ms` for detached step-contract handlers:
  - process-group creation;
  - `SIGTERM` to the complete POSIX process group;
  - fixed 5-second grace period followed by process-group `SIGKILL`;
  - cancellation on assignment resolve, external resolve, yield, run terminal, or Desktop exit;
  - exactly one callback/journal terminal result.
- Define `complete:auto` behavior for non-JSON stdout, non-zero exit, resolve validation failure, callback retry, and an already-terminal run.
- Adopt T12's path helper and chosen artifact-token path semantics.
- Resolve singleton `.path` and multi-file `.directory` tokens only for local execution, as safely quoted absolute paths to the consumer step's verified materialized input copy. Reject `.path` for `max_files > 1`; never interpolate a list or the canonical/global artifact location.
- Fail dispatch before process creation if authorization, digest verification, copy, or atomic rename fails.
- Redact secrets from command audit while recording handler ID, duration, exit status, timeout, and failure class.

### Automated testing

- Exact resolved-command tests for Parts 5/6.
- Values containing spaces, apostrophes, quotes, `$()`, backticks, newlines, leading dashes, Unicode, and empty strings.
- Rejection tests for quoted placeholders, embedded placeholders such as `--flag={{value}}`, and any attempted raw syntax.
- Unknown/misspelled token lint tests.
- Missing-versus-null-versus-empty binding tests prove only schema-valid empty strings reach the process.
- Timeout, cancellation, Desktop-shutdown, child-process-tree, 5-second escalation, exit-race, retry, and duplicate-callback tests.
- Ephemeral-credential tests cover exact resource binding, expiry/revocation on every terminal path, attempted cross-run/step access, child-process inheritance boundary, and complete redaction.
- Artifact path tests with default and overridden cwd.
- Materialization tests prove local handlers receive immutable consumer copies, source artifacts remain unchanged, failed verification/copy prevents dispatch, and remote/public projections contain references rather than host paths.
- POSIX shell tests prove first-command failure stops the block, login profiles are not loaded, and Bash-only syntax fails visibly.

### Manual testing

- Copy an artifact from a path containing spaces and apostrophes.
- Commit a benign message containing shell metacharacters and verify literal preservation.
- Run a deliberately hanging child process and confirm full tree termination and UI/journal feedback.

### Documentation surfaces

- **Normative:** handler execution and artifact path sections in current bridges; observability/security boundaries.
- **User docs:** `space-handlers.md` and shell token reference.
- **Tutorial:** Parts 5 and 6 commands and troubleshooting.
- **Skills:** handler authoring token/quoting rules.
- **Scaffolds/examples:** safe command templates.
- **Enforcement:** quoted-placeholder and unknown-token lints; command security tests.
- **Changelog:** token grammar, quoting rule, timeout semantics.

### Dependencies and ownership

- **Depends on:** T00 shell rule, T03 execution context, T12 path API; code may start before T05 but integration merges after T05.
- **Blocks:** T13.
- **Owned paths:** shell executor, invoke bindings, shell-template helper, timeout/process code.

### Done gate

- Exact Part 5 copy and Part 6 token interpolation work.
- Malicious output remains a literal argument.
- Resolve/yield/timeout/cancel/Desktop shutdown terminates the complete process group through `SIGTERM` then 5-second `SIGKILL` and records one terminal result.
- Missing or `null` required tokens fail before process creation; schema-valid empty strings remain one literal empty argument.

---

## T07 — Secure View resolver transport, contract SDK, dev mode, and scaffolds

### Context

The tutorial imports APIs that do not exist. Current View selection is embedded in flow steps, views receive overly broad credentials, mutation paths can double-resolve, host messages cannot carry artifacts, and the shell retains built-in resolver-form behavior that is no longer part of the product.

### Goals

- Ship the exact tutorial-facing View SDK API.
- Use the compiled branch contract from T04.
- Render custom Views only through T05 `view_resolver` handlers.
- Remove general shell credentials from untrusted view code.
- Delete built-in step-contract/gate forms and fallback resolve controls.
- Make production and dev submissions share validation and intent shapes.

### User stories

- As a view author, I submit a browser `File` without base64 plumbing.
- As a space author, I bind my View through `handlers.yaml`; the flow remains unchanged.
- As a user, missing-file errors appear before network mutation and server enforcement remains authoritative.
- As an operator without a View resolver, I can observe the open step but cannot resolve it through a synthesized shell form.
- As an operator, double-clicks, retries, stale views, and malicious views cannot resolve arbitrary steps.

### Technical specification

- Select Views directly from `open_steps[]` entries in state `open` whose inline resolver descriptor has `type: view_resolver` and an authorized `view_id`; do not perform a client-side handler-index join.
- Expose `ViewAppContext.step.branches` using the shared `BranchResolveContract` wire projection.
- Export the exact public API:
  - `useViewContract`;
  - `submitBranch`;
  - `cancel`;
  - `ViewContractError`;
  - `isViewContractError`.
- Implement host-mediated upload and resolve as the only production mutation path. The View sends a versioned intent containing payload plus `File`/`Blob` objects; the trusted host authorizes, uploads, and resolves without placing a Hub token in the iframe.
- Delete direct View-to-Hub upload/resolve code and token plumbing; do not retain an adapter.
- Version the host protocol for payload, `File`/`Blob`, progress, errors, cancellation, and idempotency.
- Expose `submission: { status, uploadedBytes, totalBytes, cancel() }` from `useViewContract()`. Keep this nested cancellation distinct from the top-level workflow `cancel` branch helper.
- On acknowledged pre-commit cancellation, delete temporary bytes immediately, leave the step open, return submission state to `idle`, and settle the pending submission as cancelled.
- If resolve already committed, cancellation returns/reconciles the resolved result and never attempts compensation or a second resolve.
- Remove error fallback that can submit twice; use idempotency/status recovery.
- Add `context.mode: "production" | "dev"` and explicit transport version.
- In dev mode, run the same client validation and log intent without contacting a real run.
- Validate origin/CSP/sandbox behavior; remove `allow-same-origin` unless justified with compensating controls.
- Host only applied local View builds; reject external View URLs.
- Use an iframe sandbox with `allow-scripts` only. Do not grant same-origin, top navigation, popups, forms, or downloads.
- Apply a restrictive CSP with no direct connections or external resource origins (`connect-src 'none'`, `form-action 'none'`, `object-src 'none'`, restrictive script/style/image/font sources). Network access may be designed later as an explicit space permission.
- Because a sandboxed View has an opaque origin, authenticate host messages with the exact iframe `contentWindow`, protocol version, expected View/run/step context, and a fresh per-instance nonce rather than trusting `event.origin` alone.
- Render a custom View only when the current space has one valid matching `view_resolver`.
- If no View resolver is bound or no viewer is connected, leave the step open and expose observability only.
- Inventory and delete built-in generic step/gate form components, fallback submit adapters, resolve controls, routes, tests, docs, and state derived solely for that feature.
- Rework Vite React scaffold and fixtures from obsolete `gate`/`useViewSubmit` to the tutorial contract.
- Delete `useViewSubmit`, old submit message shapes, and their fixtures once the new API lands; do not ship an adapter.
- Ship SDK, shell host, scaffold, fixture, and Part 3 docs atomically.

### Automated testing

- Type-test the exact tutorial `App.tsx`.
- Trusted-host/Hub Ajv parity tests for required payload and files; the View iframe contains no Ajv compiler or general schema execution path.
- Submit, cancel, double-click, replay, stale context, terminal run, invalid branch, ambiguous network response, and oversized file tests.
- Progress tests cover monotonic aggregate bytes and state transitions; cancellation tests cover validation, upload, resolve-race, cleanup, open-step preservation, and post-commit reconciliation.
- Security tests proving the View has no Hub mutation token or direct resolve path, plus origin spoofing, arbitrary run/step mutation, and iframe sandbox/CSP.
- Sandbox/CSP tests cover cookie/storage isolation, blocked navigation/popups/forms/downloads/connections/external resources, stale/wrong nonce, wrong window/context/version, and locally hosted asset loading.
- Resolver-discovery tests for matching, missing, duplicate, stale, and unauthorized `view_resolver` handlers.
- Absence tests proving no built-in resolver form or fallback resolve control is bundled or reachable.
- Dev mode tests proving no real upload/resolve call.
- Scaffold generation plus `npm install`/typecheck/build smoke.

### Manual testing

- Run the Part 3 view in Vite dev and packaged Desktop.
- Submit and cancel from the custom canvas.
- Remove the `view_resolver`, reopen the step, and confirm the shell shows observability only.
- Inspect browser context to confirm no general shell/admin token is accessible.
- Simulate network interruption after upload and verify one deterministic result.

### Documentation surfaces

- **Normative:** View security/execution boundary, resolver-agnostic step contract, handler View binding, shell observability-only fallback, and product philosophy removal of built-in resolution.
- **User docs:** `apps/docs/reference/view-sdk.md`.
- **Tutorial:** Part 3 and Part 4 submission behavior.
- **Skills:** developer view-authoring guidance.
- **Scaffolds/examples:** `packages/cli/templates/views/vite-react/**` and dev fixtures.
- **Enforcement:** exact-import/type tests, scaffold build test, security suite.
- **Changelog:** SDK API, transport, removed exports, and security behavior.

### Dependencies and ownership

- **Depends on:** T00 transport decision, T04 shared contract, T05 `view_resolver`.
- **Blocks:** full T01 intake E2E and T14 branch meta consumer.
- **Owned paths:** `packages/view-sdk/**`, shell View context/adapter/binding hook, generic open-step View projection, built-in resolver-form deletion, Vite view templates.
- **Explicit non-ownership:** hub resolve/artifact enforcement remains T04.

### Done gate

- Exact tutorial View code builds and runs.
- View identity exists only in a space-owned `view_resolver` handler.
- Submit/cancel resolve exactly once with correct branch semantics.
- All production mutations traverse the trusted host; View code has no direct Hub credential or mutation route.
- No built-in contract/gate form or fallback resolve control remains.
- Dev mode never mutates a real run.
- The iframe has no general shell/admin credential.
- SDK, template, fixtures, reference, and tutorial are synchronized.

---

## T08 — Setup wizard, space naming, grants, and agent verification

### Context

The wizard creates fixed `ui-sandbox`/`ui-production` spaces rather than `my-first-space`, the scaffold uses another slug, the default grant omits `step:resolve` while including potentially unnecessary powers, and current setup may only print a snippet rather than complete verification.

### Goals

- Match the tutorial's single user-named space setup.
- Provide a least-privilege grant that can complete the agent step.
- Make configuration and post-reload verification resumable and explicit.

### User stories

- As a new user, one wizard produces the exact project and space described by Part 1.
- As a tool user, configured local contexts can read the flow and participate without an authorization surprise.
- As an administrator, I can understand, revoke, rotate, and add connections for distinct trust boundaries.

### Technical specification

- Set the default profile to exactly `space:read`, `flow:read`, `flow:run`, and `step:resolve`.
- Use `flow:read` for run-graph/current-position context and `flow:run` for agent-started sessions/runs.
- Keep `journal:read` advanced-only. Remove `action:invoke` and `gate:resolve` from defaults and delete their capability/tool paths in the clean cutover if no nonlegacy use remains.
- Create setup connections without a flow ACL so their capabilities cover current and future flows in that space. Advanced creation may resolve selected already-applied flow aliases to canonical ACL identities.
- Name and version the profile, for example `tutorial-builder/v1`.
- Define a neutral integration descriptor containing Hub ID, connection ID, bundled bridge command, profile, skill bundle/version, and verification requirements.
- Define an adapter contract/registry for target detection, MCP config install/update, skill/instruction install/update, reload/restart handoff, and verification.
- Keep setup core free of target-specific paths and config shapes. Supported adapters own those details; an always-available generic adapter performs no writes and returns portable instructions.
- Present detected contexts as a neutral multi-select: preselect-but-confirm one result, allow one or many of several, and select generic no-write fallback when none are found.
- Install one local machine/trust-boundary connection ID through every selected adapter. Create another persistent connection only for another machine, CI/secret boundary, team member, or intentionally separate trust boundary.
- Derive an editable `Local tools on <hostname>` operator label for local setup; labels identify trust boundaries, not agents.
- Prompt for one human-readable space name defaulted from the current folder; derive and display an editable slug before creation.
- Use the confirmed slug consistently in Hub creation, `space.yaml`, link state, and scaffolds; keep the Hub-assigned space ID immutable.
- Define the wizard sequence for space create, init, link, apply, local-access consent, connection creation, context selection, MCP/skills installation, reload, resume, and verify.
- Keep `space init` offline with no Hub credential side effect.
- In `mrmr setup`, ask whether tools on this computer may access the space after it is created/linked/applied. Create one least-privilege local connection and install it into selected contexts; on decline, create nothing and show how to connect later.
- Use connection/integration-context vocabulary for owned resources. Reserve grant/mint terminology for advanced authorization and describe agents as user-owned participants, never stored Murrmure entities.
- Replace the public creation command with `mrmr connection create`; delete `grant mint` and `agent connect` command registration, help, docs, tests, and skills without aliases.
- Replace `grant use` with `mrmr connection activate <connection-id>`; create auto-activates, while activate only updates the local credential pointer and never mutates Hub state.
- Remove `mrmr space onboard` command registration, implementation, help, docs, tests, and skills without an alias or redirect.
- Persist tokens only in the OS credential store keyed by Hub + connection ID. Generated MCP config and active-selection files store the connection ID only; the bundled bridge resolves the token at startup.
- Remove `MURRMURE_HUB_TOKEN` exports and embedded-token MCP/project configuration from the normal local path.
- Fail local credential lookup closed when the OS store is unavailable or locked; do not fall back to plaintext files or environment tokens.
- Add an explicit headless/CI auth mode that accepts `MURRMURE_HUB_TOKEN` only as process-runtime injection from a CI secret manager and never emits it to files, arguments, generated config, or logs.
- Prefer adapter-driven MCP/skills installation; if the generic no-write path is used, make portable instructions one explicit step with saved resume state.
- Verify both `murrmure_space_status` and the capability needed by `murrmure_resolve_step`.
- Remove scaffold README instructions that mint unrelated manual grants on the happy path.
- Document rotation, revocation, existing connections, and distinct trust boundaries.
- Support adding another local integration context by installing the existing machine connection; creating a new connection is an explicit trust-boundary action.
- Give shell-spawned harnesses ephemeral run/step-scoped execution credentials and never the persistent machine connection.
- Show revoked connections only in a collapsed advanced history; retain audit metadata, omit token material, and require a new connection rather than reactivation.

### Automated testing

- Wizard state-machine tests, including interruption/reload/resume.
- Consent tests prove accepting creates/configures exactly one credential, declining creates none, and `space init` remains offline.
- CLI absence tests prove `connection create` is the only creation command and `grant mint` / `agent connect` are unknown.
- Activation tests prove create auto-selects the new connection, `connection activate` switches only local state, unknown/revoked IDs fail clearly, and `grant use` / `agent activate` are unknown.
- Command-absence tests prove `space onboard` is unknown and all former guidance points to `setup`, granular space commands, or `connection create`.
- Credential tests prove MCP config, activation pointers, logs, process arguments, environment guidance, and project files contain no token; bridge lookup succeeds only through the credential store.
- Headless tests prove CI runtime injection works only in explicit mode, while local mode rejects environment fallback and all diagnostics redact the value.
- Adapter conformance tests cover descriptor consumption, idempotent MCP/skill installation, preservation of unrelated config, reload handoff, verification, generic fallback, and absence of target-specific logic in setup core.
- Selection tests cover zero/one/many detections, one-or-many choices, duplicate contexts, user deselection, and stable vendor-neutral ordering.
- Multi-adapter tests prove one local credential/actor ID is reused across selected contexts; another machine/CI gets a separate connection; handler children receive only expiring run/step credentials.
- Capability-to-tool authorization matrix and least-privilege regression tests.
- Default-profile tests prove graph inspection and run start work while raw journal queries and legacy action/gate tools are unavailable.
- ACL tests prove setup connections cover flows applied later, while advanced restricted connections match only selected canonical applied identities and reject unknown/future aliases.
- Generated tree/slug snapshots for `my-first-space`.
- Naming tests cover folder-derived defaults, Unicode/punctuation normalization, editable slug, collisions, cancellation, and consistency across Hub/manifest/link/scaffold.
- Existing-space, duplicate-name, partial setup, revoked connection, and second-trust-boundary tests.
- Multi-connection tests prove independent labels, scopes, audit identity, rotation, revocation, and local activation without token replacement.
- Revoked-history tests cover redaction, ordering, immutable revoked state, and new-connection replacement.
- CLI E2E with a mock/real MCP bridge.

### Manual testing

- Complete Part 1 from a clean machine/user data directory.
- Complete reload/restart handoff for the selected adapter and resume verification.
- Revoke/rotate the grant and connect a second agent.
- Confirm no bootstrap token or unrelated grant appears in generated config.

### Documentation surfaces

- **Normative:** `studio-specs/current/cli/spec.md`, grants migration/security bridge.
- **User docs:** `apps/docs/guide/agents-mcp.md`, quick start.
- **Tutorial:** Part 1.
- **Skills:** participant connection/setup guidance plus target-native skill installation.
- **Scaffolds/examples:** space manifest slug and generated README.
- **Enforcement:** wizard snapshots, grant capability tests, setup E2E.
- **Changelog:** wizard UX, default profile, and grant cutover.

### Dependencies and ownership

- **Depends on:** T00 grant/naming decisions.
- **Runs in parallel with:** T02–T07.
- **Owned paths:** CLI wizard/setup/grant files, generated space manifest/README, Part 1 setup sections.

### Done gate

- A fresh user can produce `my-first-space` exactly as documented.
- The configured agent passes capability verification and resolves the tutorial build step.
- Default access is justified by an acceptance trace.
- Reload, revoke, rotate, multi-adapter reuse, and second-trust-boundary behavior are documented and tested.

---

## T09 — Clean first boot and remove production seed state

### Context

Hub startup and Desktop packaging still include seed contracts and catalog stubs, contradicting the tutorial and product north star. There is no supported upgrade migration: development state may be reset during this clean-slate cutover.

### Goals

- Make fresh hub/Desktop state genuinely empty.
- Move test-only fixtures out of production packaging.
- Delete seed-era initialization and package-catalog code completely.

### User stories

- As a first-time user, I see no phantom flows or sample capabilities unless I choose an example.
- As the current operator, I receive a clear one-time instruction to reset local development data if the new schema requires it.
- As a test author, I can explicitly install fixtures through test utilities.

### Technical specification

- Remove automatic seed pinning and `PACKAGE_CATALOG` production stubs.
- Stop bundling hub contract fixtures in Desktop resources.
- Move needed fixtures and pin helpers under `test-utils/`.
- Remove seed-era persisted assumptions; do not add an upgrade reader or migration shim.
- Require no bootstrap contract for startup, setup, or apply. Product schemas are compiled into the binaries; contracts enter storage only through explicit apply/install operations.
- Audit stale FDK/bootstrap-token coupling and remove or archive production references.
- Archive only historical ADR/shipped-plan records needed for rationale and mark them superseded/non-normative. Delete FDK capability/bridge pages from `studio-specs/current/` and every FDK-only production, test, scaffold, skill, and user-doc surface.
- Remove active links to FDK material and exclude clearly marked historical archives from current-guidance search/enforcement.
- Add CI guards preventing test fixture imports from production packages.

### Automated testing

- Fresh hub and packaged Desktop boot with zero pinned contracts.
- Explicit test-helper fixture installation.
- Packaging inspection proving no production `Resources/hub/contracts`.
- Guard tests for removed package-catalog names.
- Repository guards prove active specs/docs/code/tests/skills/scaffolds contain no FDK vocabulary or links; archives are explicitly marked non-normative.

### Manual testing

- Launch Desktop with a new user-data directory.
- Follow the documented local reset once, then relaunch from empty state.
- Select an optional example and confirm only that example appears.

### Refinement decisions and open questions

- **Decided:** no bootstrap contract is required; fresh storage contains zero pinned contracts and tests explicitly install fixtures.
- **Decided:** archive only historical ADR/shipped-plan rationale with a superseded banner; delete all current guidance and FDK-only implementation/test/scaffold surfaces.

### Documentation surfaces

- **Normative:** `studio-specs/current/desktop/spec.md`, current index/overview, product clean-state behavior.
- **User docs:** quick start and Part 1 first-screen description.
- **Skills:** remove assumptions that seed contracts exist.
- **Fixtures/examples:** move production fixtures to `test-utils`.
- **Enforcement:** packaging and fresh-boot tests.
- **Changelog:** removal of seeds and local reset instruction.

### Dependencies and ownership

- **Depends on:** T00 confirmation of clean-state target.
- **Blocks:** T10 packaged verification and final Part 1 E2E.
- **Owned paths:** hub bootstrap/catalog stubs, Desktop seed packaging, fixture relocation.

### Done gate

- Fresh boot has zero seed contracts.
- Tests install fixtures explicitly.
- No production code reads or migrates seed-era catalog state.
- Normative Desktop/product docs match the clean state.

---

## T10 — Bundled MCP bridge packaging and discovery verification

### Context

The tutorial promises no separate bridge installation. Relevant code exists, but dev/packaged parity, app relocation, paths with spaces, credential lookup, agent-adapter integration, and connection association need executable verification.

### Goals

- Prove the bundled bridge command works in development and packaged Desktop.
- Ensure every supported integration-context adapter receives the same neutral bundled-bridge descriptor and installs its native MCP/skills configuration without token material.
- Fail with actionable diagnostics after app moves or updates.

### User stories

- As a Desktop user, configuring a supported integration context or using generic instructions works without npm installation.
- As a user who moved the app, discovery refreshes rather than leaving a stale path.
- As support, I can diagnose bridge, token, and grant mismatches from `doctor`.

### Technical specification

- Install/update stable `~/.murrmure/bin/murrmure-mcp` atomically with user-only permissions.
- Generate neutral local Desktop descriptors with that stable launcher path, never the current app-bundle entry path.
- At invocation, have the launcher read `shared.json` discovery to locate and safely execute the current bundled bridge with Hub + connection ID.
- Refresh bundle discovery each launch/update and define actionable behavior when Desktop has moved but has not yet refreshed discovery.
- Define dev-mode command parity.
- Permit a package/PATH-managed launcher for explicit headless installs while preserving the same neutral descriptor shape.
- Certify packaged launcher/discovery/signing only on macOS for this release. Unsupported packaged Windows/Linux paths fail explicitly and produce no unusable adapter configuration.
- Keep launcher-location/discovery behind a platform abstraction so future Windows/Linux implementations preserve the neutral descriptor contract.
- Generate bridge config with Hub + connection ID only; resolve token material from the OS credential store at bridge startup.
- Expose the bundled command and credential-free connection fields through T08's neutral descriptor; do not generate editor/vendor config in bridge core.
- Require each supported integration-context adapter to declare whether it can write configuration, install skills, request reload, and verify; generic fallback writes nothing.
- Extend doctor probes to distinguish missing binary, stale path, invalid token, revoked grant, and hub reachability.
- Do not expose bootstrap/admin credentials.

### Automated testing

- Command generation tests for stable-launcher dev/packaged macOS, spaces, app relocation, and version update.
- Atomic launcher install/update, ownership/mode, stale discovery, and malicious discovery-path tests.
- macOS signing/notarized-package checks plus explicit unsupported packaged Windows/Linux behavior tests.
- Credential-store tests prove generated commands/config carry no token and classify missing, locked, revoked, or mismatched connection credentials.
- Adapter matrix tests consume the same bridge descriptor and preserve unrelated target configuration; generic fallback remains complete and no-write.
- End-to-end bridge handshake and `murrmure_space_status`.
- Doctor classification tests.
- Packaging smoke proving the binary exists and is executable.

### Manual testing

- Install/move/upgrade packaged Desktop and reconnect through supported and generic adapters.
- Complete the Part 1 MCP setup with the T08 grant.
- Revoke the grant and verify doctor guidance.

### Refinement decisions and open questions

- **Decided:** local Desktop descriptors use stable `~/.murrmure/bin/murrmure-mcp`; the launcher resolves the current bundle through discovery at invocation.
- **Decided:** packaged Desktop launcher support/signing is macOS-only this release; Windows/Linux packaged paths fail explicitly, while headless launchers remain separate.

### Documentation surfaces

- **Normative:** Desktop/CLI MCP bridge sections.
- **User docs:** `agents-mcp.md`, quick start, doctor troubleshooting.
- **Tutorial:** Part 1 bundled bridge/config wording.
- **Skills:** context-agnostic connection guidance and adapter-native installation.
- **Scaffolds/examples:** neutral descriptor plus adapter-specific and generic outputs.
- **Enforcement:** packaged bridge smoke and doctor tests.
- **Changelog:** packaged discovery changes if behavior changes.

### Dependencies and ownership

- **Depends on:** T09 for final package shape; may perform read-only verification in parallel. Integrates with T08 grant flow.
- **Owned paths:** Desktop MCP discovery/menu/doctor/package scripts after T09 releases its path lease; T08 owns adapter registry/install behavior.

### Done gate

- A fresh packaged install completes MCP setup without npm.
- Existing generated configuration survives Desktop relocation/version updates through the stable launcher.
- Relocation and revoked credentials produce accurate recovery guidance.
- Every adapter consumes the same credential-free bundled-bridge descriptor; no named harness is required for the generic path.

---

## T11 — Concise, live, contract-correct agent protocol

### Context

The current prompt emits extra sections and placeholder IDs, and may conflate payload and artifact requirements. The tutorial shows a concise task/protocol split with complete resolve calls.

### Goals

- Render only information the agent needs for the active assignment.
- Generate complete branch-specific resolve calls with live IDs.
- Preserve discovery only for multi-contract handlers.

### User stories

- As an agent, I can resolve the assigned step without guessing IDs or payload shape.
- As a handler author, my prompt content remains workflow-owned while Murrmure adds only protocol facts.
- As an operator, prompt logs are useful without leaking tokens.

### Technical specification

- Remove unconditional Session, MCP-tools, Discovery, and Resolve-API prose.
- Begin every injected contract block with exactly `Protocol: murrmure.agent/v1`; do not add a separate metadata section.
- Include Discovery only when the handler's contract scope has multiple keys.
- Render one complete `murrmure_resolve_step` call per branch with live run/step IDs.
- On resumed parent assignments, render a compact returned-child block with child identity, branch, iteration, payload, and artifact references.
- When the active parent has declared children, render `murrmure_open_child_step({ run_id, parent_step_id, child_step_id, idempotency_key })` alongside its own branch resolve calls; never imply that opening a child resolves the parent.
- Describe resume as protocol context. Do not claim that the same shell process or agent session was restored.
- Derive payload and artifact fields from T04's compiled contract.
- Render the complete canonical Draft 2020-12 schema for every active-step branch as compact JSON with deterministic key ordering.
- Label artifact requirements distinctly and explain `artifacts_out` where relevant.
- Do not duplicate schema constraints as prose. For additional scoped contracts, render only identity/summary and require Discovery for full schema retrieval.
- For local MCP agents, generated calls may show bridge-local workspace paths; remote protocol guidance shows artifact references and never implies that the Hub can read the agent filesystem.
- Keep protocol formatting versioned or structurally tested rather than treating incidental whitespace as wire format.
- Render cancellation/failure/custom branches through the same template as all branches. Generate only schema-valid call placeholders; add no special examples or name-derived semantics.
- Redact secrets and avoid exposing unnecessary session internals.

### Automated testing

- Structural prompt assertions for single-key and multi-key handlers.
- Live-ID and branch-specific payload/artifact tests.
- Full-schema canonicalization tests for nested objects, arrays, enums, formats, local refs, deterministic ordering, and no prose duplication.
- No-placeholder/no-forbidden-section tests.
- Branch-neutral rendering tests prove cancel/failure/custom names receive the same structure and only compiled control effects differ.
- Protocol-version presence/exact-value tests for initial and resumed assignments.
- Regression snapshots for target agent handlers outside the tutorial.
- Resumed-parent prompt tests for returned-child context, declared-child activation scope, unchanged parent identity, and absence of duplicate-open/process-restoration claims.

### Manual testing

- Inspect the exact prompt received by the tutorial build agent.
- Complete each branch using only information present in the prompt.
- From a resumed parent prompt, open one declared child and later resolve the parent using only the rendered protocol.
- Verify logs do not expose the grant token.

### Refinement decisions and open questions

- **Decided:** every injected contract block starts with `Protocol: murrmure.agent/v1`.
- **Decided:** active-step branches include full compact canonical schemas; additional scoped contracts are summaries with Discovery.
- **Decided:** no special cancellation/failure examples; every branch receives the same complete generated call template.

### Documentation surfaces

- **Normative:** agent handoff/prompt protocol bridge.
- **User docs:** agent/handler references.
- **Tutorial:** Part 5 prompt extract.
- **Skills:** agent resolve and developer prompt-authoring guidance.
- **Scaffolds/examples:** prompt fixtures.
- **Enforcement:** structural prompt tests tied to tutorial fixture.
- **Changelog:** only if public prompt shape is treated as operator-visible.

### Dependencies and ownership

- **Depends on:** T03 default branches, T04 compiled contract, T05 contract-key scope.
- **Owned paths:** `step-contract-slice.ts`, prompt rendering tests, prompt-specific executor input mapping.

### Done gate

- Tutorial agent receives live IDs and valid calls for every branch.
- Resumed parent agents can distinguish returning child context, child activation, and parent resolution.
- Artifact and payload requirements are not conflated.
- Discovery appears only when needed.
- Acceptance is structural, not tied to a fake fixed run ID.

---

## T12 — Canonical run scratch paths, retention, and local/federated boundary

### Context

Code and tutorial use `.mrmr/dev/runs`, while normative bridges still use `.mrmr.temp/runs`. Path strings are duplicated, retention is undefined, and remote spaces cannot use local filesystem paths.

### Goals

- Establish one local run scratch API and normative root.
- Delete the superseded run-root implementation and stale fixtures.
- Separate local scratch from cross-space exchange artifacts.

### User stories

- As a handler author, documented paths match actual paths.
- As an operator, I know when current scratch is deleted.
- As a federated client, I receive an artifact reference instead of a meaningless remote local path.

### Technical specification

- Adopt `.mrmr/dev/runs/{run_id}/steps/{step_id}/...` for local scratch/stable run artifacts.
- Add one `runScratchPaths()` helper and migrate all call sites.
- Add the canonical consumer input path `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`.
- Before local dispatch, authorize every artifact, verify its digest, copy it to a temporary sibling, and atomically rename it into the consumer input path.
- Expose an absolute singleton `.path` only when `max_files: 1`. For multi-file slots expose the absolute slot `.directory`; reject singular path bindings at apply. Public/remote consumers receive ordered reference arrays.
- Never expose local paths through public APIs, Views, journals, or remote handlers. Remote consumers receive an artifact reference and materialize it in their own space.
- Require all intermediate state and workflow outputs to remain inside the owning run namespace until an explicit final promotion.
- Keep `.mrmr.temp/` only for explicitly documented cross-space exchange if still required.
- Never garbage-collect an active run directory. For terminal runs, retain `.mrmr/dev/runs/{run_id}` until `terminal_at + 7 days`, then remove local bytes while preserving journal metadata and artifact manifests.
- Keep Hub/global artifact retention outside this local GC policy.
- Run local GC once at Hub startup and every 24 hours while the Hub remains active.
- Emit one sanitized summary per pass with scanned runs, deleted directories/bytes, skipped active runs, and failures; do not expose artifact content or host paths.
- Do not add a manual GC command in this release.
- Treat rejected/partial upload cleanup separately from normal run retention: their bytes are deleted immediately while sanitized diagnostics remain.
- Count managed temporary, promoted, and consumer-copy bytes against the fixed file/step/run/space local quotas and reserve capacity atomically.
- Delete `.mrmr.temp/runs` readers, writers, tests, fixtures, and docs; local development data may be removed manually.
- Mark local path tokens unavailable for remote bindings; provide artifact reference/transfer identity where applicable.
- Local-only path tokens are absolute; public surfaces expose no path token value.

### Automated testing

- Path helper unit tests and repository search guard against new literal drift.
- Concurrent-run tests proving distinct run IDs cannot resolve to overlapping scratch, artifact, transfer, or execution-output paths.
- Rejection/absence guards for the removed run root.
- Retention/GC and restart tests covering active-run immunity, the exact seven-day terminal boundary, preserved metadata/manifests, and independence from Hub/global artifact retention.
- Local versus remote artifact-reference tests.
- Consumer-copy tests for source immutability, digest mismatch, interrupted copy, atomic visibility, path traversal, and paths containing spaces/apostrophes.
- Singleton `.path` versus multi-file `.directory` tests, deterministic ordered references, normalized filename uniqueness, and fixed local quota accounting for consumer copies.
- Gitignore/scaffold tests.

### Manual testing

- Inspect Part 4 filesystem layout.
- Restart the hub and reopen a run created under the clean layout.
- Exercise a remote/federated observation path and confirm no false local path is shown.

### Documentation surfaces

- **Normative:** `studio-specs/current/bridges/artifacts.md`, `step-contract.md`, product philosophy path examples.
- **User docs:** artifact/troubleshooting references.
- **Tutorial:** Part 4 and path wording in Parts 5/6.
- **Skills:** artifact/path guidance.
- **Scaffolds/examples:** `.gitignore`.
- **Enforcement:** docs-proof ban for stale run-root text and path helper guard.
- **Changelog:** path normalization, retention, removed root, and local reset instruction.

### Dependencies and ownership

- **Depends on:** T00 path decision.
- **Runs in parallel with:** T02–T10.
- **Consumed by:** T04 and T06.
- **Owned paths:** new path helper, path-only call-site replacements, path normative sections.

### Done gate

- One helper produces all local run paths.
- No active code/spec/tutorial disagreement remains.
- The superseded run root has no code path; remote behavior is explicit and tested.
- Singleton and multi-file materialization expose only the correct local token shape and remain within atomic local quota accounting.

---

## T13 — Safe cleanup, repository isolation, and commit observability

### Context

The tutorial uses shared `specs/current/spec.md`, a fixed archive path, and `git add -A`. Tutorial v3 intentionally avoids Git-worktree orchestration and therefore serializes this flow through a space-owned run policy. Run-namespaced intermediate paths are still required to prevent stale retries and preserve audit. Unrelated or sensitive changes can otherwise be committed, and no-op/missing-identity failures remain undefined.

### Goals

- Keep the tutorial payoff—archive and commit—without teaching unsafe repository mutation.
- Serialize the complete tutorial flow without making serialization part of the portable flow contract.
- Keep every run's mutable intermediate state isolated even while the tutorial is configured for one active run.
- Record the resulting repository state in the journal.

### User stories

- As a repository owner, the workflow commits only files it owns.
- As a concurrent user, one run cannot archive or commit another run's spec.
- As an operator, cleanup failures and resulting commit SHA are auditable.

### Technical specification

- Configure `run_policies: [{ flow: my-dev-flow, max_concurrent_runs: 1 }]` in the tutorial space's `handlers.yaml`; the portable flow remains concurrency-agnostic.
- Keep intake artifacts, copied specifications, and cleanup inputs under the run namespace. A controlled build/promotion step may mutate the linked repository only while this flow owns its single admission slot.
- Do not add Git worktree creation or generic repository-workspace management to Murrmure in this tutorial.
- In the tutorial's first repository-mutating handler, require a clean Git worktree before mutation by checking staged, unstaged, and non-ignored untracked files. `.mrmr/dev` remains ignored.
- Keep this policy entirely in tutorial/space-owned scripts. Do not add a Hub schema, protocol error, Git integration, baseline-isolation engine, or force override.
- Replace `git add -A` with an allowlisted pathspec derived from workflow-owned outputs.
- Archive the submitted specification to `specs/archive/{run_id}.md` and include that repository copy in the final commit. Keep the original immutable upload under run artifact storage and exclude `.mrmr/dev`.
- Validate commit subject/body constraints before shell execution.
- Let ordinary shell failures (archive collision, missing Git identity, non-Git directory, commit failure) exit nonzero and use normal handler/run failure observability.
- Do not add automatic rollback, retry, compensation, or recovery-state logic for this tutorial example.
- Return structured cleanup output including commit SHA, staged paths, and archive path; journal it.
- Keep commit-message values safely quoted through T06.

### Automated testing

- Focused temporary-git tests for the happy path, dirty-worktree preflight, allowlisted staging, archive path, and ordinary nonzero commit failure.
- Assert the handler-local dirty-worktree failure occurs before any repository mutation and has no Hub-specific error contract.
- Assert exact staged path set and commit subject/body/SHA.
- Assert the run-id archive copy is committed, the original run artifact remains immutable, and no `.mrmr/dev` path enters the index.

### Manual testing

- Complete Part 6 in a clean repository.
- Repeat with unrelated dirty work and two overlapping runs.
- Inspect `git status`, commit diff, archive, run output, and journal.

### Refinement decisions

- **Decided:** the tutorial's space handler rejects a dirty worktree before mutation; this is not Murrmure platform behavior.
- **Decided:** commit `specs/archive/{run_id}.md`; preserve the original upload as an uncommitted immutable run artifact.
- **Decided:** archive/commit failures use normal nonzero handler failure only; no special recovery machinery.

### Documentation surfaces

- **Normative:** only generic handler execution/audit and run isolation behavior; no Git-cleanliness platform contract.
- **User docs:** safe repository automation guidance.
- **Tutorial:** Part 6 commands, checkpoints, and troubleshooting.
- **Skills:** handler authoring guidance for Git operations.
- **Scaffolds/examples:** safe cleanup handler/template if provided.
- **Enforcement:** temporary-git security/integration suite.
- **Changelog:** repository safety behavior if platform-enforced.

### Dependencies and ownership

- **Depends on:** T00 isolation decision, T06 safe token execution.
- **Blocks:** final full-run E2E.
- **Owned paths:** tutorial cleanup handler/fixture, cleanup policy/runtime additions, temporary-git tests.

### Done gate

- Full tutorial run commits only intended files and records SHA.
- The tutorial admits at most one non-terminal run, uses no Git worktree, and keeps intermediate state run-namespaced; dirty, no-op, retry, and failure states are deterministic.
- The tutorial no longer teaches `git add -A` as the default.

---

## T14 — Authorized, run-pinned shell home and flow visualization

### Context

The active shell plan combines independent home polish, static graph construction, live branch rendering, and sensitive metadata. It must consume the stabilized compiled contracts and preserve flow identity, authorization, federation, and run pinning.

### Goals

- Deliver the full shell plan without adding resolver modality to flow contracts.
- Show one authorized flows list and a truthful static/live graph.
- Protect handler and schema metadata.

### User stories

- As a user, each flow appears once with correct authored/runnable/preview affordances.
- As an author, I can inspect default and explicit branch shape before running.
- As an operator, a live run graph remains tied to what actually ran.
- As a limited reader, I do not see private handler or schema details.

### Technical specification

- Split implementation into independently reviewable sub-slices:
  1. unified flows list deduplicated by logical `{origin_space_id, flow_id}`;
  2. bounded recent-completed scrolling;
  3. static graph from one compiled catalog/IR digest and server-computed `can_run`;
  4. live graph from run-pinned catalog/IR;
  5. branch decision/fan-out and one shared failure terminal, with no human/gate inference from View bindings;
  6. redacted step metadata with historical/current handler distinction, including `view_resolver` as a space binding.
- Replace separate flat-preview and running-flow page implementations with one shared flow page/component and graph interaction model.
- In applied mode, show the graph with neutral not-started state and a header Run button only when manual run is available and authorized.
- After start, transition the shared page to the created session/run state without changing its layout, controls, or metadata interaction patterns. Route and payload transport may differ internally.
- Do not infer handler matches client-side.
- Project branch contracts and resolver metadata server-side under authorization. With `flow:read`, include branch schemas, routes, artifact constraints, and safe resolver identity; never include resolver commands, prompts, paths, parameters, environment, or secrets.
- Make the client render the server projection directly; it must not compile flow contracts, infer defaults, or match handlers.
- Render all flow steps as modality-agnostic protocol steps; a View resolver may appear in metadata but never changes node kind.
- Keep every step rectangular. Insert a separate decision diamond only when the branch set contains custom or multiple non-default outcomes.
- Render a plain `completed`/`failed` pair directly as a normal success edge plus subdued red failure edge to one shared flow failure terminal; authored and injected default pairs render identically.
- Static preview shows the current applied resolver; live open-step rendering consumes the server-projected inline resolver descriptor, while historical graphs show the handler ID/config digest recorded at dispatch.
- Use step selection to populate the shared page's existing side panel with redacted branch/contract/artifact/resolver metadata. Do not add a metadata popover; use a drawer adaptation on narrow screens.
- Preserve cross-space runnable flows and authorization.
- Keep the recent-completed home payload capped at 20, render it in a fixed-height internal scroller, and link to the full runs view for deeper history.
- Keep flows from different origins separate even when names or content digests match. Current rows point to the latest applied digest; run/live/history payloads pin `{origin_space_id, flow_id, flow_digest}`.
- Version preview/home payload changes or provide a documented cutover.

### Automated testing

- Home dedupe/sort/capability/federation tests.
- Recent-completed tests lock the cap at 20, fixed-height scrolling, stable page height, and View all runs navigation.
- Static graph parity for explicit and default branches.
- Active-run apply rejection leaves live graph/resolver metadata unchanged; historical graph survives a later successful apply.
- Run-button authorization tests.
- Metadata redaction matrix for `flow:read`, `flow:run`, `space:read`, and cross-space access.
- Contract projection parity tests prove static/live panels receive the same authorized compiled schemas/routes/artifact constraints and cannot expose handler internals.
- Component stories/snapshots for branch, failure, gate, long recent list, and metadata states.
- Graph-shape snapshots distinguish plain default pairs from custom decision fan-out and prove one shared failure terminal in applied/live modes.
- Side-panel/drawer interaction, keyboard focus, close/selection persistence, and redaction stories in applied and live modes.

### Manual testing

- Inspect and run the tutorial flow from home and detail pages.
- Attempt apply during the run and verify rejection; finish the run, apply, then compare historical versus new static metadata.
- Test with an actor that can preview but not run and one lacking handler metadata access.

### Refinement decisions and open questions

- **Decided:** applied preview and live run are modes of one shared flow page/component; graph transport is an internal implementation detail.
- **Decided:** logical identity is `{origin_space_id, flow_id}`; versioned/run identity adds `flow_digest`.
- **Decided:** step metadata uses the shared page's side panel, adapting to a drawer on narrow screens; no popover.

### Documentation surfaces

- **Normative:** shell/preview authorization and graph data-source behavior where contractual.
- **User docs:** `apps/docs/guide/creating-flows.md`.
- **Tutorial:** Parts 1 and 4 shell screenshots/instructions.
- **Skills:** none unless agent-visible graph semantics are documented.
- **Scaffolds/examples:** visualization fixtures.
- **Enforcement:** API authorization tests and UI stories.
- **Changelog:** unified home and flow visualization.

### Dependencies and ownership

- **Depends on:** T03 branches/routes, T04 branch contract, T05 handler matching, T07 View projection where reused.
- **Not on the core tutorial runtime critical path**, but required for full completion of the active plan set.
- **Owned paths:** space-home payload/UI, flow-preview graph/API/UI, graph components and shell-client payload types.

### Done gate

- Home has no duplicate or missing authorized flows.
- Static and live graphs are truthful, digest-aware, and authorization-safe.
- Default branches render like explicit branches.
- Sensitive metadata is redacted by the server.

---

## T15 — Program integration, clean-slate cutover, documentation enforcement, and release sign-off

### Context

Individual slices can be locally correct while the tutorial still fails across boundaries. This task closes superseded code paths, stale docs, enforcement, release communication, and packaged/manual evidence.

### Goals

- Prove the complete tutorial from clean boot through commit.
- Remove every superseded code and documentation surface.
- Archive or update superseded focused plans.

### User stories

- As a new user, I can complete the tutorial without discovering an undocumented product gap.
- As the current operator, I have one clear local reset procedure and no hidden old behavior.
- As a maintainer, CI blocks future tutorial drift.

### Technical specification

- Run and stabilize the complete T01 progressive suite.
- Execute Parts 1–6 verbatim as the release manual acceptance path; fix unclear, stale, or unusable tutorial content as a blocking product defect.
- Delete and guard against:
  - `start`;
  - removed wait/empty-branch shapes;
  - lifecycle-only handler `on` plus dispatch `contract_keys`;
  - authored `kill_on`;
  - old direct View upload/resolve APIs, View-held mutation tokens, and obsolete postMessage shapes;
  - obsolete grant capability defaults;
  - public `grant mint` / `grant use` / `agent connect` / `agent activate` command/help/docs in favor of `connection create` / `connection activate`;
  - `space onboard` command/help/docs in favor of `setup` plus granular space commands;
  - generated `MURRMURE_HUB_TOKEN` exports and embedded-token MCP/project configuration;
  - `.mrmr.temp/runs`;
  - superseded home/preview payload fields.
- Audit all current specs for stale gate/checkpoint/FDK/seed/path/View-token language.
- Rename stale diagnostics such as `CHECKPOINT_*`; do not keep aliases.
- Update `studio-specs/plans/README.md` statuses and archive completed focused plans only after their acceptance gates are represented here.
- Record only the agreed manual signed/notarized, real-Keychain, actual-upgrade, and real-integration evidence with version, platform, and test date; deterministic package checks belong in macOS CI.

### Automated testing

- Full CI suite plus tutorial-v3 contract/E2E/security tests.
- Docs-proof for all six pages, references, skills, and banned removed patterns.
- Package/build/typecheck/lint across affected workspaces.
- Repository absence/rejection matrix for every removed item.

### Manual testing

- Execute Parts 1–6 verbatim on a clean packaged Desktop.
- Reset local product data and repeat the clean critical path.
- Verify cancel, success, timeout, invalid upload, dirty repo, and revoked grant recovery.
- Review final docs as a first-time user and as an operator.

### Refinement decisions and open questions

- **Decided:** deterministic package/launcher/bridge/tutorial checks run in macOS CI; only signing/Gatekeeper, real Keychain, actual upgrade, and real integration reload remain manual.
- **Decided:** tutorial correctness and usability are maintained continuously by feature slices and verified manually from the tutorial itself; T15 validates the integrated path rather than performing deferred documentation synchronization.

### Documentation surfaces

- **Normative:** complete sweep of `studio-specs/current/`, especially product, CLI, Desktop, shell, handlers, step-contract, artifacts, grants, and security.
- **Architecture:** final ADR statuses and supersession links.
- **User docs:** tutorial index/Parts 1–6, quick start, creating flows, space handlers, agents MCP, View SDK reference, troubleshooting, known gaps.
- **Skills:** agent and developer skills, flow/handler/View references.
- **Scaffolds/examples:** space, flow, View, handler, and tutorial fixtures.
- **Enforcement:** docs-proof, strict lint, removed-pattern matrix, packaged smoke.
- **Operator:** root `CHANGELOG.md`.
- **Plans:** active plan index and shipped archive.

### Dependencies and ownership

- **Depends on:** T01–T14 required done gates.
- **Owned paths:** final cross-surface doc sweep, removed-pattern matrix, plan index/status, release evidence.
- Behavior fixes discovered here return to their owning task; T15 does not become an unreviewed catch-all implementation PR.

### Done gate

- The definition of full completion in Section 2 is proven.
- Every analysis finding is closed, accepted as an explicit non-goal, or tracked with a named owner outside this release.
- No normative/tutorial/code drift remains.
- Release notes and the one-time local reset procedure are published.

---

## 6. Cross-task acceptance matrix

| Tutorial beat | Primary owners | Required gates |
|---|---|---|
| Part 1 — clean launch and setup | T08, T09, T10 | empty fresh state; user-named space; bundled bridge; verified least-privilege grant |
| Part 2 — minimal flow | T02, T03, T04 | trigger-only strict apply; plain steps compile; file-only branch contract |
| Part 3 — intake view | T04, T07 | exact API typechecks; safe transport; dev mode; no broad token |
| Part 4 — run and artifact | T04, T07, T12, T14 | cancel/submit semantics; canonical path; journal and graph agree |
| Part 5 — handlers and agent | T03, T05, T06, T08, T11 | dispatch/defaults; safe copy; timeout; live resolve grant/prompt |
| Part 6 — cleanup and commit | T06, T13 | prior-step output; isolated staging; deterministic commit SHA |
| Cross-cutting | T00, T01, T15 | clean cutover, docs sync, E2E, security, packaged evidence |

---

## 7. Program risk register

| Risk | Severity | Likelihood | Primary mitigation |
|---|---|---:|---|
| Trigger-only manifest still fails first apply | Critical | Certain without T02 | Exact Part 2 parse/apply gate |
| Branchless steps disappear in one compiler stage | Critical | High | T03 full-pipeline normalization tests |
| Missing file resolves or client/server disagree | Critical | High | T04 compiled contract + hub enforcement |
| View exfiltrates broad shell credentials | Critical | High | T07 host-mediated transport with no View-held Hub token and threat tests |
| Agent-controlled output executes shell code | Critical | Medium | T06 quote-once rule and adversarial tests |
| Cleanup commits unrelated or sensitive files | Critical | Medium | T13 path allowlist/baseline and git tests |
| Parallel plans ship divergent View contracts | High | High | T00 interface freeze and T04/T07 ownership split |
| Detached handler never times out | High | High | T06 process-group timeout/cancel |
| Wizard-connected agent cannot resolve | High | High | T08 fast-path `step:resolve` + capability trace |
| Concurrent tutorial runs corrupt shared repository output | High | Medium | T05 space-owned `max_concurrent_runs: 1` policy plus T12 run-namespaced intermediate paths |
| Oversized/abandoned upload exhausts resources | High | Medium | T04 pre-write bounds and lifecycle cleanup |
| Stale local data obscures clean-slate behavior | Medium | Medium | T09/T15 documented reset and clean-state tests |
| Live graph shows latest config instead of run truth | High | Medium | T14 run-pinned catalog/IR |
| Cross-space flow list collapses distinct origins | High | Medium | T14 canonical origin identity |
| Plans merge but tutorial drifts again | High | High | T01 executable snippets and T15 docs-proof |
| Multiple parallel tasks collide on specs/tutorial files | Medium | High | Path/documentation leases and wave rebases |

---

## 8. Per-PR requirements

Every implementation PR under this plan must state:

1. Task ID and owned paths.
2. Frozen interfaces consumed and produced.
3. Dependency branch/commit and required merge order.
4. Superseded code paths removed and strict-schema rejection/absence guards proving they cannot return.
5. Automated tests added or activated.
6. Tutorial steps manually performed, including chapter/path, environment, and result.
7. Documentation surfaces updated in the same PR.
8. Open questions remaining and why they do not change another task's contract.
9. Security/authorization impact.
10. Rollback or recovery behavior.

A PR is blocked when:

- it modifies another active task's leased path without handoff;
- it duplicates contract interpretation outside the canonical compiler/type;
- it updates code without the affected normative/tutorial/skill surface;
- it changes tutorial-covered behavior without rerunning the affected tutorial path as written;
- it weakens the tutorial target to match current code;
- it adds a dual-read, alias, adapter, deprecation window, or migration shim;
- it relies only on client validation for authorization or resolve correctness.

---

## 9. Immediate execution order

1. Approve T00 decisions and ownership.
2. Start T01 fixture extraction immediately.
3. In parallel, start T02, T08, T09, and T12; T10 performs verification while waiting for the T09 packaging lease.
4. Merge T02, then T03.
5. Start T04 and T05 in parallel.
6. Start T06, T07, and T11 as their dependencies become available.
7. Complete T13 and T14 in parallel with the expanding T01 E2E.
8. Run T15 only after all task-level documentation and tests are already green.

The minimum runnable tutorial critical path is:

```text
T00 → T02 → T03 → T04 → T07 → T01
                 └→ T05 → T06 → T13 → T01
T00 → T08 ───────────────────────────→ T01
T00 → T09 → T10 ─────────────────────→ T01
T00 → T12 ───────────────────────────→ T01
```

Full completion additionally requires T11, T14, and T15.
