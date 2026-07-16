# ADR-012 — Safe shell handler interpolation, execution, and assignment credentials

**Status:** Accepted
**Date:** 2026-07-15
**Owners:** Executors, Hub core, Contracts
**Task:** [Tutorial v3 Task 06](../plans/2026-07-14-tutorial-v3-build-tasks/06-safe-spec-copy-handler.md)

## Context

Tutorial v3 Part 5 ships the first automated step (`write_spec`) driven by a
concise space shell handler that copies a submitted specification. Three gaps
made the prior shell executor unsafe and unergonomic for this:

1. **Loose interpolation.** The resolver substituted `{{key}}` with a regex and
   silently emptied unknown/missing bindings, so a filename containing spaces,
   apostrophes, `$()`, backticks, or leading dashes could become a shell
   fragment, and a missing artifact could spawn a process that silently did the
   wrong thing. There was no grammar distinguishing a complete argument from an
   embedded `--flag={{value}}` or author-quoted `'{{value}}'`.
2. **No verified consumer copy.** An artifact token resolved to the producer's
   stable path, so a handler could mutate the original, and a traversal-style
   or stale path could escape the run scratch tree. There was no canonical,
   digest-verified, run-scoped input location.
3. **Weak process lifecycle.** The handler ran under the parent shell
   (`shell: true`) with a single `child.kill`, so a timeout or external
   resolution left orphaned children in the process tree, and the ephemeral hub
   credential had no redaction guarantee in recorded audit.

The Murrmure ownership boundary requires the executor to own **safe execution**
while flows stay portable and spaces own what each handler does.

## Decision

1. **Complete-argument grammar.** Every dynamic placeholder must occupy one
   complete unquoted argument. `resolveSafeShellCommand` tokenizes the authored
   command and rejects author-quoted placeholders (`'{{x}}'`, `"{{x}}"`), embedded
   forms (`--flag={{x}}`, `pre{{x}}post`, `{{a}}{{b}}`), and unknown placeholders
   before spawn. A missing/null binding fails with `HANDLER_BINDING_VALUE_MISSING`;
   a schema-valid empty string remains one empty argument. The placeholder and
   token character sets include hyphens so a key like `{{my-step.artifact.path}}`
   is recognized (and rejected as unknown when unbound) instead of silently
   passing through as a literal fragment. The tokenizer preserves authored
   single-quoted literals verbatim (the closing quote is a delimiter, not
   content) so `printf '%s' {{x}}` re-emits `'%s'` exactly.
2. **Quote-once substitution.** The runtime shell-quotes each resolved value
   exactly once (`shellQuote`), so spaces, apostrophes, `$()`, backticks,
   newlines, leading dashes, and Unicode remain literal data and can never
   become shell fragments. `{{prompt}}` is stripped (delivered via stdin) or
   substituted as one quoted argument.
3. **Verified atomic consumer copy.** `materializeConsumerCopy` writes one
   digest-verified, run-scoped copy to
   `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`. The
   source must be a regular file inside the run scratch tree: a literal
   containment check rejects obvious escapes, `lstat` rejects a symlinked source
   entry, and `realpath` canonicalizes both the source and the run root (so a
   host-level symlink such as macOS `/var` → `/private/var` cannot produce a
   false positive) before confirming the real path stays in-tree — this also
   defeats an in-tree symlinked parent directory that resolves outside. The
   destination is contained symmetrically: after `mkdir` the consumer
   `inputs/{slot}` directory is `realpath`-canonicalized against the same
   `realRunRoot` and rejected if it resolves outside the run scratch tree
   (defeating a pre-existing symlink at `.../inputs/{slot}` pointing elsewhere),
   and the final destination entry is `lstat`-checked and rejected if it is a
   pre-existing symlink, so the temp write and atomic rename can never land
   outside the tree or overwrite a malicious link. The source is read once and
   never mutated, and the copy is written to a temp
   sibling and atomically renamed into place (POSIX `rename` atomically replaces
   any existing destination), so a partial file is never observable and a prior
   copy is never left missing. A digest mismatch refuses the copy before any
   consumer bytes are written.
4. **Canonical run-scratch paths.** `runScratchPaths` and its helpers
   (`runScratchDir`, `stepStableDirRel`, `stepWorkdirRel`, `stepInputsDirRel`,
   `consumerInputPath`, `activeContractPath`) centralize every run-scoped path;
   `bareRunId`/`prefixedRunId` normalize the on-disk `run_` prefix. Step-artifact
   and step-contract-slice helpers delegate to these so no path is constructed
   ad hoc.
5. **POSIX multiline execution.** Commands run as `/bin/sh -e -c "<script>"`
   (`shell: false`, `detached: true`) so the child is a process-group leader;
   there is no login-profile sourcing and no silent shell fallback. Omitted
   `cwd` defaults to the space root; omitted `delivery` defaults to fail-fast.
6. **Process-group termination.** Timeout, cancellation, external resolution,
   yield, run terminal, or Desktop shutdown sends `SIGTERM` to the whole group
   (`process.kill(-pgid, ...)`), waits five seconds, then `SIGKILL`, and records
   exactly one terminal result. `terminateProcessGroup` falls back to a direct
   signal when no pid is available. The `SIGKILL` escalation stays armed when the
   shell leader exits after `SIGTERM` (the `close`/`exit` handler only resolves
   early once a signal-0 probe confirms the entire process group is dead — a
   surviving TERM-resistant descendant keeps the group alive, so the escalation
   stays armed), so a TERM-resistant descendant in the group is still reaped
   after the grace period. The escalation timer is **ref'd** (not `unref`'d) and
   `killChildProcess` returns an awaitable `Promise<void>` that resolves once the
   tree is gone; Hub/Desktop shutdown awaits `awaitAllShellExecutorsTerminated`
   before closing persistence and exiting, so a TERM-resistant descendant can no
   longer outlive the daemon. Termination is **once-only**: the executor
   deregisters its cancel handle from the registry when the process settles
   (timeout, error, or close) via the `onProcessStart` unregister callback, so a
   timeout that initiates local termination followed by the run-failure
   cancellation path signals the group exactly once (`SIGTERM` then `SIGKILL`),
   recording one terminal result. Hub/Desktop shutdown calls
   `cancelAllShellExecutors` so no spawned handler process tree is orphaned when
   the daemon stops.
7. **Ephemeral assignment credentials.** Each spawned handler receives a
   run/step/handler-scoped credential (`MURRMURE_HUB_TOKEN`) in its environment,
   never the persistent machine connection. The token carries an `expires_at`
   backstop (action timeout plus grace, else a default TTL) and a `scope_ref`
   (`{run_id}:{step_id}:{handler_id}`); a `harness_id` of `run:{run_id}` marks it
   as ephemeral. `requireToken` denies an expired or revoked token. The
   assignment boundary is enforced on **every endpoint reachable with
   `step:resolve`** — step resolve, upload-intent creation, file transfer, and
   intent abandon — by one shared `requireAssignmentScope` helper: an ephemeral
   token may only act for its own run/step/space (denying another active
   run/step with `TOKEN_RUN_SCOPE_MISMATCH` / `TOKEN_STEP_SCOPE_MISMATCH` and
   another space with `scope_enforcement_failure`), while a non-ephemeral grant
   token carries only the space boundary (preserving human/agent submission to
   any step in their own space). A step binds exactly one handler, so the
   run:step assignment identity implies the handler; the handler segment is
   carried on the token for audit/binding and not re-checked at step-keyed
   routes. A `run-resolve-credential-registry` tracks every minted token and
   revokes it on each terminal path — step resolve/auto-complete, run terminal
   (`terminateRunExecutors`), and Hub/Desktop shutdown (`revokeAllResolveCredentials`)
   — via a daemon-installed revoker, so no persistent child credential survives a
   finished assignment. The dispatch audit records only `command`, `prompt`, and
   `cwd` — never the environment — so the credential cannot leak into the journal
   or public surfaces. Artifact `.path` placeholders in the audit resolve to an
   opaque reference (transfer id when available, else `artifact:{producer}:{slot}`)
   rather than the producer's local run-scratch path or the consumer copy path, so
   journals and public APIs receive references, never local paths. Authored
   `kill_on` is removed; termination is owned by the runtime.
8. **`complete:auto` outcomes.** Exit 0 with parseable stdout completes;
   nonzero exit fails `SHELL_EXIT_NONZERO`; unparseable stdout (when a
   `response_schema` is set) fails `RESPONSE_NOT_JSON`; spawn failure is
   `SHELL_SPAWN_FAILED`; timeout is `ACTION_TIMED_OUT`. A detached handler
   reports its one terminal outcome through `onShellComplete`. Binding and
   materialization failures map to their own typed codes —
   `HANDLER_BINDING_VALUE_MISSING`, `HANDLER_UNKNOWN_PLACEHOLDER`,
   `HANDLER_PLACEHOLDER_QUOTED`, `HANDLER_PLACEHOLDER_EMBEDDED`,
   `ARTIFACT_PATH_TRAVERSAL`, `ARTIFACT_SOURCE_NOT_FOUND`,
   `ARTIFACT_SOURCE_NOT_FILE`, `ARTIFACT_DIGEST_MISMATCH`, `ARTIFACT_COPY_FAILED`
   — and prevent process creation; they are not collapsed into
   `SHELL_SPAWN_FAILED`.

## Consequences

- Handler authors bind one shell resolver in a readable `on::key` field and omit
  cwd/delivery boilerplate; the runtime guarantees their arguments stay literal.
- A repository path with spaces or apostrophes copies correctly; shell
  metacharacters in filenames or content remain data.
- The original submitted artifact is immutable; a consumer step only ever sees a
  verified copy under its own `inputs/` tree.
- Timeout or external resolution cleans up the entire process tree once, with
  one observable terminal result and no orphaned children.
- The journal and public APIs never receive a local path or a persistent
  credential; only the operator audit shows the resolved command shape.
- The executor gains a runtime dependency on `@murrmure/hub-core` for
  `materializeConsumerCopy` and `runScratchPaths` (no cycle: hub-core never
  imports executors).

## Enforcement

- `resolveSafeShellCommand` (`packages/executors/src/shell-command.ts`) and its
  conformance suite enforce the grammar, quote-once, hyphenated-placeholder
  recognition, single-quoted-literal preservation, and the
  missing/null/empty distinction across spaces, apostrophes, quotes, `$()`,
  backticks, newlines, leading dashes, Unicode, and empty strings.
- `materializeConsumerCopy` (`packages/hub-core/src/flow-engine/consumer-copy.ts`)
  and its unit suite enforce digest mismatch, traversal, symlinked-source,
  symlinked-parent, **and destination-parent/destination-symlink** rejection,
  interrupted copy, atomic visibility, immutable source, and basename-neutralized
  filenames.
- `runScratchPaths` (`packages/hub-core/src/flow-engine/run-scratch-paths.ts`)
  is the single source for run-scoped paths; `step-artifacts.ts` and
  `step-contract-slice.ts` delegate to it.
- `createShellSpawnExecutor` spawns `/bin/sh -e -c` detached and terminates the
  group on timeout; the safety suite proves SIGTERM then SIGKILL escalation
  (including SIGKILL-after-close), that the audit never exposes the hub token,
  that artifact `.path` audit placeholders resolve to references not local
  paths, and that binding/materialization failures return typed codes without
  spawning. An integrated suite proves **once-only** termination: a timeout that
  locally terminates followed by the run-failure cancellation path signals the
  group exactly once (one `SIGTERM`, one `SIGKILL`, one terminal result) because
  the executor deregisters its cancel handle on finish.
- `requireAssignmentScope` (`packages/hub-daemon/src/routes/config/scopes.ts`)
  and its unit + HTTP suites enforce the assignment boundary on every
  `step:resolve` endpoint — cross-run (`TOKEN_RUN_SCOPE_MISMATCH`), cross-step
  (`TOKEN_STEP_SCOPE_MISMATCH`), and cross-space (`scope_enforcement_failure`)
  denial for ephemeral tokens, with grant tokens carrying only the space
  boundary — including upload-intent creation, file transfer, and abandon.
- `run-executor-cancel` (`packages/hub-core/src/invoke/run-executor-cancel.ts`)
  exposes `awaitAllShellExecutorsTerminated`; its unit suite proves shutdown
  awaits the ref'd SIGKILL escalation before resolving, that the escalation
  survives a leader exit when a TERM-resistant descendant keeps the group alive
  (signal-0 probe), and that termination is idempotent (a repeated cancel does
  not re-signal).
- `run-resolve-credential-registry` (`packages/hub-core/src/invoke/`) and its
  unit suite enforce step/run/shutdown revocation and cross-step isolation;
  `auth-credential-lifecycle` enforces expiry and revocation denial in
  `requireToken`.
- `dependency-cruiser` permits `executors → hub-core` and reports no violations.

## References

- [Bridge — Space handlers & contract keys](../current/bridges/handlers.md)
- [ADR-007 — Resolver-agnostic step contracts](./ADR-007-resolver-agnostic-step-contracts.md)
- [ADR-010 — Branch contract artifact upload boundary](./ADR-010-branch-contract-artifact-upload-boundary.md)
- [Tutorial v3 Task 06](../plans/2026-07-14-tutorial-v3-build-tasks/06-safe-spec-copy-handler.md)
