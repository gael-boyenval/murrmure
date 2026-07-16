# 07 — Build with a connected agent

**Status:** Ready  
**Build order:** 07  
**Depends on:** 02, 05, 06  
**Source work packages:** T05 agent binding subset, T06 credential boundary, T08 verification, T11

## Goal

Complete the agent portion of Tutorial Part 5: the connected local tool receives one live, concise, branch-correct assignment, performs the build, and resolves the open step using only scoped protocol information and authority supplied for that assignment.

## User stories

- As a connected agent, I receive live run/step IDs and valid calls for every branch.
- As a handler author, my prompt describes the task while Murrmure injects only protocol facts.
- As an agent, payload and artifact requirements are clearly separated.
- As an operator, the build uses the selected local connection for discovery but the spawned assignment receives only ephemeral mutation authority.
- As a security reviewer, prompts, logs, and child environments do not reveal persistent tokens.

## Contracts

- Agent handler dispatch uses `on: step.opened::{key}`; optional `contract_keys` defines prompt/discovery scope only.
- Every injected contract block begins exactly `Protocol: murrmure.agent/v1`.
- Single-contract assignments omit unconditional Session/MCP-tools/Discovery/Resolve-API prose.
- Discovery appears only when scope contains multiple contract keys.
- Active step renders complete compact Draft 2020-12 schema for every branch with deterministic ordering and distinct artifact requirements.
- Every branch renders a complete `murrmure_resolve_step` call with live run/step IDs and schema-valid placeholders.
- Branch names are semantically neutral; cancel/failure/custom branches use the same rendering template.
- Local bridge guidance may accept workspace paths and upload them; remote guidance uses artifact references. Hub never reads an agent-machine path.
- Handler process receives an ephemeral run/step/handler credential and cannot use the persistent local connection.
- Resolution validates the canonical selected-branch contract and revokes assignment authority/process on terminal state.

## Implementation

- Add/finish explicit agent handler adapter using canonical handler indexing and execution lifecycle.
- Generate protocol blocks from the shared compiled branch contract.
- Remove placeholder IDs, duplicated prose, unconditional sections, and payload/artifact conflation.
- Render local/remote artifact input forms according to transport boundary.
- Connect setup verification from Task 02 to the actual tutorial build resolution path.
- Ensure prompt/audit logging redacts credentials and unnecessary session internals.
- Update fake agent to traverse the real MCP bridge in E2E.
- Update exact tutorial `dev_build` handler, prompt extract, and agent instructions.

## Testing

### Automated

- Structural prompt tests for single/multi-key scope, exact protocol version, deterministic schemas, live IDs, and complete calls.
- Branch-neutral tests for completed, failed, cancel, and custom branches.
- Payload/artifact separation and local-path versus remote-reference rendering.
- No-placeholder/no-forbidden-section/no-token tests.
- Handler dispatch and explicit resolve E2E through the real MCP bridge.
- Capability tests prove the default connection can inspect/start/resolve while assignment mutation remains run/step scoped.
- Credential revocation and process termination on local/external resolve, timeout, cancel, and shutdown.
- Regression snapshots for non-tutorial agent handlers.

### Manual

- Follow Tutorial Part 5 with a real supported local integration context.
- Inspect the exact prompt and complete every branch using only information it contains.
- Confirm the build step resolves and the next step opens.
- Attempt cross-run/cross-step mutation from the assignment and verify denial.
- Inspect prompts, logs, generated MCP config, and child environment for token leakage.
- Repeat through the generic adapter instructions.

## Documentation, skills, specs, and ADRs

- **ADR required:** versioned agent assignment prompt protocol and ephemeral execution-authority boundary; update the Task 02 connection ADR rather than duplicating connection identity.
- **Normative specs:** agent handoff/prompt protocol, handler execution credentials, local/remote artifact boundary.
- **User docs:** agent/handler references and MCP participation guidance.
- **Tutorial:** Part 5 handler, prompt extract, expected agent actions, and troubleshooting.
- **Skills:** agent resolve protocol and developer prompt/handler authoring.
- **Scaffolds/examples:** prompt fixtures and explicit agent handler template.
- **Enforcement:** structural prompt tests tied to tutorial fixture and secret-redaction guards.
- **Changelog:** public prompt protocol and assignment credential behavior.

## References

- [Agent prompt protocol simplification](../2026-07-10-agent-prompt-protocol-simplify.md)
- [Handler authoring simplification](../2026-07-10-handler-authoring-simplify.md)
- [Connection onboarding](../2026-07-10-agent-grant-onboarding.md)
- [Coordinating plan T06/T08/T11](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial Part 5](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md)

## Done gate

- The exact tutorial agent receives one concise, live, contract-correct assignment.
- It completes the build and resolves every branch without guessing IDs or schema.
- Discovery appears only when scope requires it.
- Persistent connection credentials never enter the assignment.
- Local/remote artifacts follow their correct transport boundaries.
- Prompt, SDK/bridge behavior, tutorial, specs, and skills agree.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| review | review | glm-5.2-max | approved | Reviewed clean HEAD `5301006` (working tree clean). All six done-gate bullets are satisfied across the three focus areas. Live contract: `renderMurrmureProtocolEnvelope`/`renderAgentStepContractMarkdown` emit `Protocol: murrmure.agent/v1`, sorted branches with compact recursively key-sorted Draft 2020-12 payload schemas, separate artifact requirements, `Then` effects, and one complete `murrmure_resolve_step` call per branch carrying live `run_id`/`step_id` and schema-valid example values; no `<run_id>` placeholders, no `## Session`/`## MCP tools`/`## Resolve API`, and `## Discovery` only when `contract_key_count > 1`. The exact `dev_build` handler binds `step.opened::my-dev-flow.build` with `contract_keys: [my-dev-flow.build]`, `complete: explicit`, and its authored `prompt` excludes `murrmure_resolve_step` (Task vs protocol separation). Scoped MCP authority: `invoke-service.mintRunResolveToken` mints an ephemeral `step:resolve` token with `harness_id run:{run_id}`, `scope_ref {run_id}:{step_id}:{handler_id}`, and expiry (action timeout + 5 min grace, 2 h backstop); `shell-spawn` passes only that `MURRMURE_HUB_TOKEN` plus the non-secret `MURRMURE_ASSIGNMENT_SCOPE` marker to the child — never the persistent connection credential; the bundled bridge in `assignment` authMode uses `MURRMURE_HUB_TOKEN`, never calls `readMacOsConnectionToken`, and fails closed without the token; `resolveShellDispatchAudit` records only command/prompt/cwd and never the token; `handleShellComplete` revokes the credential on process termination. Fake-agent resolves build: `tutorial-v3-mcp.test.ts` spawns the real stdio bridge under `MURRMURE_ASSIGNMENT_SCOPE=run_01LIVE:build:dev_build` + `MURRMURE_HUB_TOKEN=tok_task_07_ephemeral`, a fake agent calls `murrmure_resolve_step({run_id:"run_01LIVE",step_id:"build",branch:"completed",payload:{...}})`, and the test asserts the forwarded `Authorization: Bearer tok_task_07_ephemeral` and call shape. Local/remote artifact boundary: local calls render workdir-relative `artifacts_out`, remote/`remote_hub` calls render `upload_intent_id`; `invoke-service` selects transport by handler type and the Hub resolve route accepts `upload_intent_id`. Agreement: Tutorial Part 5 extract matches the rendered protocol; ADR-013 added and ADR-008 amended; `bridges/handlers.md` + `bridges/step-contract.md` updated; `agents-mcp.md`, `environment.md`, `mcp-tools.md`, `skill-agent` v1.2.0, `skill-developer` v1.2.0, and CHANGELOG all describe the same boundary. Non-blocking note: the commit co-commits Task 11 retention scope (`run-retention.ts`, `run-retention-gc.ts`, `fs-bytes.ts`, `run-retention.test.ts`, `main.ts` GC wiring) undocumented in the Task 07 message — retention docs are Task 11's responsibility; the code is tested and coherent (matches the Task 05/09 co-commit pattern). | Focused suites, 0 failed: hub-core flow-engine `step-contract-slice` 12, `step-contract-compile` 12, `step-resolve-artifacts` 5, `consumer-copy` 13, `run-retention` 9, `step-resolve` 2, `step-complete-modes` 3, `engine-capabilities` 6 (handler-dispatch, nested-steps, tutorial-v3-repository skipped — beyond Task 07); hub-core `tutorial-v3-handler` 5; executors `invoke-shell-prompt` 3, `shell-spawn-safety` 9, `shell-spawn` 10, `shell-command` 29; hub-daemon `invoke-service` unit, `assignment-scope`, `auth-credential-lifecycle`, `upload-intent-service`, `step-contracts` 2, `resolve-step` 4, `step-work-upload-scope` 4, `nested-resolve`, `invoke-shell`, `tutorial-v3-http` 6 (2 skipped), `catalog-schema` 2, `artifacts/transfer` 4, `artifacts/acl` 1 — 42 passed / 3 skipped; mcp-bridge `tutorial-v3-mcp` 3 (2 skipped) + `error-surface` 8. Total focused: 169 passed / 10 skipped / 0 failed (109+ target met). | Task 08 — nested build/review loop |

