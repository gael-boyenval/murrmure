# 06 — Copy the specification with a safe shell handler

**Status:** Ready  
**Build order:** 06  
**Depends on:** 05  
**Source work packages:** T05 handler execution subset, T06, T12 materialization subset

## Goal

Deliver the first automated Tutorial Part 5 step: when `write_spec` opens, one concise space handler receives a verified run-scoped copy of the submitted specification, executes safely from the space root, and completes or fails with deterministic timeout and audit behavior.

## User stories

- As a handler author, I bind a shell resolver in one readable `on::key` field and omit routine cwd/delivery boilerplate.
- As a handler author, an artifact token resolves to the correct verified local input.
- As a repository owner, filenames and paths containing spaces or shell metacharacters remain literal data.
- As an operator, timeout, cancellation, external resolution, or Desktop shutdown terminates the complete process tree once.
- As a security reviewer, dynamic values cannot become shell fragments or expose persistent connection credentials.

## Contracts

- Dispatch binding is `on: step.opened::{flow_name}.{qualified_step_id}`; `contract_keys` does not drive dispatch.
- Omitted `cwd` defaults to space root; omitted `delivery` defaults to fail-fast.
- Multiline commands run as `/bin/sh -e -c` on supported POSIX systems without login profiles or silent shell fallback.
- Every dynamic placeholder occupies one complete unquoted argument and is shell-quoted exactly once by runtime.
- Author-added quotes, embedded forms such as `--flag={{value}}`, and raw interpolation are invalid.
- Singleton artifact `.path` resolves only for local execution to an absolute, digest-verified consumer copy.
- Consumer path is `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`.
- Public APIs, Views, journals, and remote handlers receive references, never local paths.
- Missing/null output binding fails before spawn with `HANDLER_BINDING_VALUE_MISSING`; schema-valid empty string remains one empty argument.
- Each spawned handler receives an ephemeral space/run/step/handler credential, never the persistent machine connection.
- Assignment resolution, yield, timeout, cancellation, run terminal, or Desktop shutdown sends process-group `SIGTERM`, waits five seconds, then `SIGKILL`, and records one terminal result.
- Authored `kill_on` is removed.

## Implementation

- Complete canonical handler alias resolution/indexing for shell dispatch.
- Add one `runScratchPaths()` API and verified atomic consumer-copy materialization.
- Implement artifact and prior-step-output token validation/resolution from one audited dispatch context.
- Enforce complete-argument grammar and quote-once substitution.
- Standardize POSIX multiline execution and defaults.
- Issue, deliver, revoke, and redact ephemeral assignment credentials.
- Enforce `timeout_ms` and all automatic process-group termination paths.
- Define `complete:auto` outcomes for stdout, nonzero exit, resolve failure, callback retry, and terminal races.
- Update exact tutorial `write_spec_copy` handler and safe command scaffold.

## Testing

### Automated

- Strict apply and dispatch of exact Tutorial Part 5 copy handler.
- Resolved command vectors for spaces, apostrophes, quotes, `$()`, backticks, newlines, leading dashes, Unicode, and empty strings.
- Rejection of quoted/embedded/raw/unknown placeholders.
- Missing/null/empty output-binding distinction before process creation.
- Digest mismatch, traversal, interrupted copy, atomic visibility, immutable source, and path-with-spaces materialization.
- Default and overridden cwd plus fail-fast delivery.
- POSIX first-failure, no-login-profile, and visible Bash-only-syntax failure.
- Timeout/cancel/external-resolve/yield/shutdown/process-tree/escalation/exit-race tests with one terminal record.
- Ephemeral credential exact scope, inheritance, revocation, cross-run/step denial, and complete redaction.

### Manual

- Execute Tutorial Part 5 through `write_spec` from a repository and artifact path containing spaces and apostrophes.
- Inspect the consumer copy and confirm the original artifact is immutable.
- Try shell metacharacters in filenames/content and confirm they remain data.
- Run a deliberately hanging child process and verify full-tree termination and shell/journal feedback.
- Resolve the step externally while its handler runs and confirm automatic termination with one result.

## Documentation, skills, specs, and ADRs

- **ADR required:** safe handler interpolation/execution and assignment process/credential lifecycle.
- **Normative specs:** handler execution, artifact materialization/path boundary, process lifecycle, security/observability.
- **User docs:** `space-handlers.md`, shell token reference, troubleshooting.
- **Tutorial:** Part 5 copy command and timeout/path troubleshooting.
- **Skills:** handler authoring token, quoting, cwd/delivery, and artifact-path rules.
- **Scaffolds/examples:** safe multiline shell handlers.
- **Enforcement:** handler lint for placeholder grammar and forbidden `kill_on`; security/process tests.
- **Changelog:** handler syntax/defaults, path tokens, quoting, timeout, and automatic termination.

## References

- [Handler authoring simplification](../2026-07-10-handler-authoring-simplify.md)
- [Run scratch normalization](../2026-07-10-run-scratch-path-normalize.md)
- [Coordinating plan T05/T06/T12](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial Part 5](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md)
- [Current handlers bridge](../../current/bridges/handlers.md)

## Done gate

- Exact tutorial copy handler strict-applies, dispatches once, and copies the correct verified artifact.
- Malicious dynamic values remain literal arguments.
- Missing/null bindings and materialization failures prevent process creation.
- All terminal paths revoke credentials, terminate the process group, and record one result.
- No old dispatch, raw interpolation, `kill_on`, persistent child credential, stale run root, or public local path remains.

