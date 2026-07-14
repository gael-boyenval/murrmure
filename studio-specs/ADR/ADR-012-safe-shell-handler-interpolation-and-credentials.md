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
   a schema-valid empty string remains one empty argument.
2. **Quote-once substitution.** The runtime shell-quotes each resolved value
   exactly once (`shellQuote`), so spaces, apostrophes, `$()`, backticks,
   newlines, leading dashes, and Unicode remain literal data and can never
   become shell fragments. `{{prompt}}` is stripped (delivered via stdin) or
   substituted as one quoted argument.
3. **Verified atomic consumer copy.** `materializeConsumerCopy` writes one
   digest-verified, run-scoped copy to
   `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`. The
   source must be a regular file inside the run scratch tree (traversal rejected),
   is read once and never mutated, and the copy is written to a temp sibling and
   atomically renamed, so a partial file is never observable. A digest mismatch
   refuses the copy before any consumer bytes are written.
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
   signal when no pid is available.
7. **Ephemeral assignment credentials.** Each spawned handler receives a
   run/step-scoped credential (`MURRMURE_HUB_TOKEN`) in its environment, never
   the persistent machine connection. The dispatch audit records only
   `command`, `prompt`, and `cwd` — never the environment — so the credential
   cannot leak into the journal or public surfaces. Authored `kill_on` is
   removed; termination is owned by the runtime.
8. **`complete:auto` outcomes.** Exit 0 with parseable stdout completes;
   nonzero exit fails `SHELL_EXIT_NONZERO`; unparseable stdout (when a
   `response_schema` is set) fails `RESPONSE_NOT_JSON`; spawn failure is
   `SHELL_SPAWN_FAILED`; timeout is `ACTION_TIMED_OUT`. A detached handler
   reports its one terminal outcome through `onShellComplete`.

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
  conformance suite enforce the grammar, quote-once, and the
  missing/null/empty distinction across spaces, apostrophes, quotes, `$()`,
  backticks, newlines, leading dashes, Unicode, and empty strings.
- `materializeConsumerCopy` (`packages/hub-core/src/flow-engine/consumer-copy.ts`)
  and its unit suite enforce digest mismatch, traversal, interrupted copy,
  atomic visibility, immutable source, and basename-neutralized filenames.
- `runScratchPaths` (`packages/hub-core/src/flow-engine/run-scratch-paths.ts`)
  is the single source for run-scoped paths; `step-artifacts.ts` and
  `step-contract-slice.ts` delegate to it.
- `createShellSpawnExecutor` spawns `/bin/sh -e -c` detached and terminates the
  group on timeout; the safety suite proves SIGTERM then SIGKILL escalation and
  that the audit never exposes the hub token.
- `dependency-cruiser` permits `executors → hub-core` and reports no violations.

## References

- [Bridge — Space handlers & contract keys](../current/bridges/handlers.md)
- [ADR-007 — Resolver-agnostic step contracts](./ADR-007-resolver-agnostic-step-contracts.md)
- [ADR-010 — Branch contract artifact upload boundary](./ADR-010-branch-contract-artifact-upload-boundary.md)
- [Tutorial v3 Task 06](../plans/2026-07-14-tutorial-v3-build-tasks/06-safe-spec-copy-handler.md)
