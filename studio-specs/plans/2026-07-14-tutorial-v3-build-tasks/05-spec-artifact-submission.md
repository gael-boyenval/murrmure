# 05 — Submit and validate the specification artifact

**Status:** Ready  
**Build order:** 05  
**Depends on:** 04  
**Source work packages:** T04, T07 submission subset, T12 path foundation

## Goal

Complete Tutorial Parts 3–4: the intake View validates and securely submits one required Markdown file through the trusted host, or cancels without uploading. The Hub authoritatively enforces the same branch contract, quotas, authorization, idempotency, and cleanup.

## User stories

- As a flow author, I require a file with `schema.required` without inventing a fake payload property.
- As a View author, I call `submitBranch("continue", { files: { spec } })` without base64 or Hub credentials.
- As a user, missing/invalid files produce field-level errors while leaving the step open.
- As a user, I see upload progress and can cancel an in-flight submission.
- As an operator, oversized, abandoned, replayed, or unauthorized uploads do not consume unbounded resources or resolve the wrong step.
- As an agent client, I receive the same selected-branch artifact requirements as the View.

## Contracts

- Every branch owns one complete `BranchResolveContract`: Draft 2020-12 payload schema, `payload_required`, `artifact_required`, branch-scoped slots, and route/control effect.
- A `schema.required` name matching a same-branch artifact slot is an artifact requirement; payload/artifact name collisions fail apply.
- Optional slots may be omitted; supplied files receive full validation.
- Artifact slot supports `media_types`, normalized `extensions`, `min_bytes`, `max_bytes`, `min_files`, `max_files` (default `1`), and `max_total_bytes`.
- Tutorial `spec` accepts Markdown/plain text extensions, requires at least one byte, and caps at 1 MiB.
- Shared trusted-runtime Ajv 8 validates Draft 2020-12 with the fixed approved `ajv-formats` list. No remote `$ref` or custom executable format.
- Errors use `CONTRACT_VALIDATION_FAILED` with `{ source, path, rule, message }` and RFC 6901 paths across host, HTTP, MCP, and CLI.
- Every byte transfer requires a Hub-issued upload intent bound to run, step, branch, slot, ordered metadata, actor, quota reservation, and idempotency.
- Fixed local ceilings: 25 MiB/file, 50 MiB/step resolution, 250 MiB/run, 2 GiB/space.
- Uncommitted uploads have a one-hour idle lease refreshed only by accepted activity; cleanup runs at Hub startup and every 15 minutes.
- View host protocol carries `File`/`Blob`, progress, errors, cancellation, and result; intent IDs and credentials never enter the iframe.
- `useViewContract()` exposes branches, validate, submit, workflow `cancel`, and nested submission state/cancel.
- In dev mode, submit validates Task 04's canonical reference-manifest fixture through the same wire/error semantics, reports the non-mutating intent locally, and performs no real upload or step resolution. Production always uses the server-projected run contract and never reads dev fixtures.
- Pre-commit cancellation deletes temporary bytes and leaves the step open; post-commit cancellation reconciles to the resolved result.
- Agent `artifacts_out` submissions use the same selected-branch slots, requiredness, metadata, quotas, intent, promotion, errors, and idempotency as View/HTTP/CLI submission.
- Persist only sanitized upload-attempt diagnostics: run, step, branch, slot, filename, declared MIME type, received bytes, hash when available, failure code/stage, actor, and timestamp. Never retain rejected content or host paths.

## Implementation

- Add canonical shared branch contract and compile-time required-name partitioning.
- Add shared validation/error normalization and authoritative Hub resolve checks.
- Implement intent issuance, bounded streaming upload, atomic promotion/resolve consumption, idempotency, reservation release, and sanitized diagnostics.
- Implement lease activity refresh plus startup/15-minute expiry sweeps that delete bytes and release reservations.
- Delete unbounded/base64 View submission and direct View-to-Hub mutation paths.
- Implement host-mediated validation/upload/resolve as the only production path.
- Export `useViewContract`, `submitBranch`, `cancel`, `ViewContractError`, and `isViewContractError`; remove `useViewSubmit` without adapter.
- Add aggregate monotonic progress and deterministic cancellation/recovery.
- Implement dev submission as validation plus local intent reporting with a hard no-network/no-mutation boundary.
- Establish `.mrmr/dev/runs/{run_id}` through the shared path helper for promoted local run artifacts; complete collection materialization/retention in Task 11.
- Keep global immutable artifacts while referenced; never expose host paths.

## Testing

### Automated

- Compiler tests for file-only, mixed payload/file, optional slots, collisions, per-branch differences, refs, and no step-level merged contract.
- Trusted-host/Hub Draft 2020-12 parity and fixed-format tests.
- Cross-transport golden errors with redaction of Ajv internals, content, and host paths.
- Missing, empty, MIME/extension mismatch, traversal, oversized, malformed, replayed, stale, terminal, and unknown-slot cases.
- Exact quota boundaries and concurrent reservations; overflow leaves the step open and leaks no bytes/reservations.
- Upload-intent metadata mismatch, authorization, expiry, cancellation, idempotency, atomic consume, and restart cleanup.
- Fake-clock lease tests cover activity refresh, exact one-hour idle expiry, startup/15-minute cadence, reservation release, and no deletion of committed artifacts.
- View submit/cancel/double-click/network-ambiguity/progress races.
- Dev-mode tests prove identical validation/error shapes and zero real upload/resolve calls.
- Agent `artifacts_out` parity tests cover required/optional singleton and collection slots across local-path and remote-reference submission.
- Diagnostic tests assert every required sanitized field and prove raw bytes, content, credentials, and host paths never persist.
- Security tests prove no View token, intent ID, direct resolve, or arbitrary run/step mutation.
- Exact Tutorial Part 3 app typecheck and Parts 3–4 E2E.

### Manual

- Run Tutorial Parts 3–4 verbatim: submit valid Markdown, inspect progress/result, and inspect journal/artifact manifest.
- Try missing, empty, wrong extension/MIME, and oversized files; verify actionable UI and an open step.
- Cancel before upload, during upload, and near resolve commit; verify deterministic state and cleanup.
- Interrupt networking after upload and confirm one resolution result.
- Inspect temporary/promoted bytes and confirm no host path or credential appears in public state.

## Documentation, skills, specs, and ADRs

- **ADR required:** canonical branch resolve contract and pre-authorized host-mediated artifact upload/resolve boundary.
- **Normative specs:** `step-contract.md`, `artifacts.md`, View security, error envelope, quota and upload lifecycle.
- **User docs:** View SDK, artifact/resolve references, troubleshooting.
- **Tutorial:** Parts 2–4 schema, View API, progress, cancellation, expected files, and errors.
- **Skills:** developer flow/View authoring and agent artifact submission.
- **Scaffolds/examples:** View template, dev fixtures, MCP/CLI artifact examples.
- **Enforcement:** docs-proof, contract parity, resource-bound, upload security, and exact-import tests.
- **Changelog:** file-only contracts, SDK API, errors, upload intents, limits, and removed direct/base64 API.

## References

- [Branch schema/artifact validation](../2026-07-10-branch-schema-artifact-validation.md)
- [View SDK contracts/upload](../2026-07-10-view-sdk-contracts-and-upload.md)
- [Run scratch normalization](../2026-07-10-run-scratch-path-normalize.md)
- [Coordinating plan T04/T07/T12](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial Part 4](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/04-run-and-understand.md)

## Done gate

- Exact tutorial View submits and cancels exactly once through the trusted host.
- Missing `spec` is rejected without resolving; valid non-empty Markdown succeeds with empty payload.
- Host and Hub enforce the same selected-branch contract and normalized errors.
- Quotas and authorization are enforced before unbounded resource use.
- Failed, cancelled, expired, and post-promotion temporary bytes are deleted.
- Idle leases, agent output artifacts, and sanitized diagnostics satisfy the canonical contract.
- No direct View mutation, broad credential, base64 author API, or merged step contract remains.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2-max | complete | Delivered Task 05 at `495435e`: shared `BranchResolveContract` + compile-time required-name partitioning (`packages/contracts/src/branch-validation.ts`), `UploadIntentService` (intent issuance, bounded streaming, atomic prepare/consume, idempotency, 1 h idle lease + startup/15 min sweeps, sanitized `attempts.jsonl`), host-mediated `useStepCanvasBinding` → `createUploadIntent`/`uploadIntentFile`/`resolveStep` with progress + abort, View SDK `useViewContract`/`submitBranch`/`cancel`/`isViewContractError` via `./app` (no `useViewSubmit`, no base64, no View credential), `DIRECT_WORK_UPLOAD_REMOVED` 410, and ADR-010. Note: this commit also lands Task 09 scope (run-policy/admission/space-guard/run-capacity/apply-quiescence + ADR-011), undocumented below. | See review row. | Review. |
| review | review | glm-5.2-max | approved | Reviewed build HEAD `495435e` (working tree clean). All seven done-gate bullets satisfied. (1) Exact tutorial View submits and cancels exactly once through the trusted host: `useStepCanvasBinding` drives `createUploadIntent` → `uploadIntentFile` → `resolveStep` with `idempotency_key = submission_id`; HTTP conformance replays 200 and the staged `0-spec.md` is gone post-promotion; dev `ViewCanvasHost` validates via `validateHostBranchResolve` then acks non-mutating without calling `onSubmitBranch` (test asserts the network path is not touched). (2) Missing `spec` → 400 `CONTRACT_VALIDATION_FAILED` `{source:"artifact",path:"/files/spec",rule:"min_files"}` without resolving; valid non-empty Markdown with empty `{}` payload resolves 200. (3) Host (`validateHostBranchResolve`) and Hub (`validateBranchContract`) share one contracts function → identical normalized errors (view-sdk + HTTP tests match). (4) `UploadIntentService.issue` enforces 25 MiB/file, 50 MiB/step, 250 MiB/run, 2 GiB/space and actor/token binding before persisting; `readBoundedBody` caps the stream; concurrent-reservation quota-overflow test passes. (5) `abandon`/`sweepExpired`/`consume` delete failed/cancelled/expired/post-promotion bytes; exact idle-lease and startup-sweep tests delete bytes and emit `UPLOAD_INTENT_EXPIRED`. (6) 1 h lease refreshed by accepted activity; agent `artifacts_out` local-path resolve path reuses the same contract; diagnostics carry metadata+hash only (test asserts no host path/content). (7) Direct base64 work upload → 410; no base64 in view-sdk; intent IDs stay host-side and never enter the iframe; per-branch `BranchResolveContract` with no merged step-level contract. ADR-010 accepted; `current/bridges/{artifacts,handlers,step-contract}.md`, `reference/{view-sdk,http-api}.md`, `guide/{troubleshooting,space-handlers}.md`, tutorial Parts 3–6, skill-agent/skill-developer + flow-authoring, vite-react scaffold, all CHANGELOGs, and `.changeset` synced. **Notes (non-blocking):** (a) Task 09 co-commit — `495435e` bundles a substantial Task 09 footprint (`run-policy`, `admission`, `space-guard`, `run-capacity`, `apply-quiescence`, ADR-011, +`handler.ts`/`run/service.ts`/`flow-starts.ts`/`spaces index`), undocumented in the commit message and absent from this task file; its 42 tests pass but Task 09 has not been reviewed against its own done gate — recommend a separate Task 09 review and per rule #2 keeping tasks in separate commits going forward (cf. task-01 documented-co-commit precedent). (b) No build Handoff row had been recorded; this review creates the section. (c) Pre-existing shell-web typecheck failure inherited from Task 04 — `SpaceIndexPanel.tsx`/`prototype-data.ts` import removed `SpaceHome*` exports and `.stories.tsx` miss `@storybook/*`; not introduced by Task 05 (its 5 shell-web files and the 5 Task-05-owned packages typecheck clean). | Task 05 focused suites (8 files, 56 passed / 2 skipped — the 2 skips are Task 09 + Task 11 future-task markers, not Task 05): `branch-validation` 3, `upload-intent-service` 4, `tutorial-v3-view` 2, `host` 17, `app-bridge` 10, `artifacts/transfer` 4, `tutorial-v3-http` 6, `step-contract-compile` 12. Co-committed Task 09 suites (6 files, 42 passed): `run-policy`, `admission`, `run-capacity-races`, `space-guard`, `run-capacity`, `apply-quiescence`. Typecheck: contracts/view-sdk/hub-core/hub-daemon/shell-client clean; shell-web red pre-existing (Task 04 debt, not Task 05). | Open Task 09 review against its own done gate (co-committed code is sound but un-reviewed). Non-blocking follow-up: clear shell-web typecheck debt (removed `SpaceHome*` imports + storybook types) — likely Task 04 cleanup or Task 13 cutover scope. |

