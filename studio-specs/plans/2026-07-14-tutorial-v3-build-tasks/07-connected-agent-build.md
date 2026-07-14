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

