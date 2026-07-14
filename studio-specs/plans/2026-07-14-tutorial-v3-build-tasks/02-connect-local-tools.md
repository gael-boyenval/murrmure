# 02 — Connect local tools through the bundled bridge

**Status:** Ready  
**Build order:** 02  
**Depends on:** 01  
**Source work packages:** T08 connection subset, T10

## Goal

Complete Tutorial Part 1 by creating one least-privilege connection for the local machine/trust boundary, installing the bundled MCP bridge and skills into selected integration contexts, surviving reload, and verifying access without exposing token material.

## User stories

- As a user, setup can connect one or more local tools without installing a separate npm bridge.
- As a security-conscious administrator, I know which machine/trust boundary a connection represents and which capabilities it has.
- As a user with several integration contexts, I install one connection into all selected contexts rather than minting one credential per tool.
- As a user who moves or upgrades Desktop, existing configuration keeps working through a stable launcher.
- As support, I receive distinct diagnostics for missing bridge, stale discovery, locked credential store, revoked connection, and unreachable Hub.

## Contracts

- Public vocabulary is `connection`: `mrmr connection create` and local-only `mrmr connection activate <id>`. Remove `grant mint`, `grant use`, `agent connect`, `agent activate`, and `space onboard` without aliases.
- One persistent connection represents one machine/trust boundary and may be installed in multiple local contexts.
- Default profile is named and versioned `tutorial-builder/v1` and contains exactly `space:read`, `flow:read`, `flow:run`, and `step:resolve`; `journal:read` remains advanced.
- Remove legacy `action:invoke` and `gate:resolve` default capabilities and public tool paths when no clean-system use remains; do not map them to the new profile.
- Setup-created connection is space-wide for current/future flows. Advanced restricted creation may reference only already-applied canonical flow identities; unknown/future aliases fail.
- Local tokens live only in the OS credential store keyed by Hub + connection ID. Config, activation state, logs, arguments, project files, and normal environment guidance contain IDs only.
- Explicit headless/CI mode may consume `MURRMURE_HUB_TOKEN` only as process-runtime secret injection; local mode never falls back to it.
- Neutral integration descriptor carries Hub ID, connection ID, stable bridge command, profile, skill bundle/version, and verification requirements.
- Stable Desktop command is `~/.murrmure/bin/murrmure-mcp`; it resolves the current bundled bridge from discovery at invocation.
- Packaged Desktop certification is macOS-only for this release. Unsupported packaged Windows/Linux paths fail explicitly.

## Implementation

- Add setup consent: “Connect tools on this computer?” Decline creates nothing; acceptance creates and auto-activates one connection.
- Add neutral adapter registry for detection, config/skill install/update, reload handoff, resume, and verification. Generic fallback writes nothing and emits portable instructions.
- Persist setup resume state for every reload handoff, including the generic no-write instruction path, so verification resumes at one explicit next step.
- Present detected contexts in a vendor-neutral multi-select.
- Install/update the stable launcher atomically with user-only permissions and refresh bundle discovery on launch/update.
- Resolve credentials at bridge startup and keep token material out of generated descriptors.
- Verify `murrmure_space_status` and an authorized resolve capability after reload.
- Provide rotation, revocation, second-trust-boundary, existing-connection, and collapsed revoked-history UX.
- Extend doctor classification for binary, discovery, credential, revocation, association, and Hub failures.

## Testing

### Automated

- Wizard interruption/reload/resume, accept/decline, zero/one/many adapters, and generic fallback.
- CLI absence tests for every removed command and help path.
- Connection create/activate, revoked/unknown activation, multiple trust boundaries, and one-connection/multi-adapter reuse.
- Capability authorization matrix proves default graph/read/run/resolve behavior and denies journal/legacy actions.
- Profile tests lock the exact `tutorial-builder/v1` name, version, and capability set.
- Advanced ACL tests prove restricted creation accepts selected applied canonical flow identities and rejects unknown, future, stale, or cross-origin aliases.
- Credential leak tests cover config, activation files, logs, process arguments, generated instructions, project files, and environment output.
- OS-store locked/missing behavior fails closed; explicit CI mode works and redacts.
- Stable launcher install/update/mode, paths with spaces, app move, version update, stale/malicious discovery, and dev/packaged parity.
- Adapter conformance preserves unrelated configuration and verifies idempotent skills/MCP install.
- Generic-adapter tests prove its portable instructions save/resume setup state without writing target configuration.
- Bridge handshake and doctor classification E2E.

### Manual

- Run Tutorial Part 1 on a clean macOS user-data directory with one supported adapter and the generic adapter.
- Select multiple contexts and verify they share one connection identity.
- Reload/resume and complete verification.
- Move and upgrade packaged Desktop, then reconnect without rewriting the descriptor.
- Lock Keychain, revoke/rotate the connection, and verify actionable diagnosis.
- Confirm generated files contain no token.

## Documentation, skills, specs, and ADRs

- **ADR required:** connection/trust-boundary identity and local credential storage; stable per-user launcher plus bundle discovery.
- **Normative specs:** CLI connection lifecycle, grants/security migration bridge, Desktop bridge discovery and supported-platform policy.
- **User docs:** `agents-mcp.md`, quick start, connection rotation/revocation, doctor troubleshooting.
- **Tutorial:** Part 1 consent, context selection, reload/resume, and verification.
- **Skills:** context-neutral participant connection guidance and adapter-native installation.
- **Scaffolds/examples:** neutral descriptor, adapter outputs, generic instructions; no token exports.
- **Enforcement:** adapter conformance, packaged bridge smoke, command-absence, credential-redaction guards.
- **Changelog:** connection vocabulary, least-privilege profile, credential storage, and bundled bridge path.

## References

- [Agent connection onboarding](../2026-07-10-agent-grant-onboarding.md)
- [Desktop MCP bridge exposure](../2026-07-10-desktop-mcp-bridge-exposure.md)
- [Coordinating plan T08/T10](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial Part 1](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/01-launch-and-create-space.md)
- [Agents and MCP guide](../../../apps/docs/guide/agents-mcp.md)

## Done gate

- A fresh user completes local tool setup without a separate bridge install.
- One least-privilege connection works in every selected context and verifies after reload.
- The named/versioned default profile and advanced canonical flow restrictions are enforced.
- Legacy action/gate capabilities and tools have no clean public path.
- No normal local surface contains a connection token.
- Stable configuration survives Desktop relocation/update.
- Revocation, locked credentials, missing bridge, stale discovery, and unreachable Hub are correctly distinguished.

## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2-max | complete | Assessed the Task 02 done gate against committed state and found the build substantially delivered by prior/concurrent agents across `63ed34c` + `776ce89` (both labelled `task-03: fix`): `mrmr connection create/activate/verify/list/revoke/rotate` with OS-store credentials keyed by Hub+connection ID and by-id stored descriptors (`active`/`revoked`), named `tutorial-builder/v1` profile (`space:read`/`flow:read`/`flow:run`/`step:resolve` only), advanced `flow_acl` restricted to already-applied canonical flow ids, stable per-user launcher `~/.murrmure/bin/murrmure-mcp` (atomic 0o700 install, discovery-resolved entry, path-with-spaces quoting, macOS-only packaged certification), neutral adapter registry + generic no-write fallback, setup consent/reload-resume, `mcp-bridge` local mode (`--hub`/`--connection`, `con_` validation, fail-closed, no env fallback) + `--headless-ci` runtime-secret injection, doctor `MCP_CONNECTION_*` classification, ID-only `ConnectPage`/`McpSnippetCard`, ADR-008, `agents-mcp.md`, tutorial Part 2 sync, and broadened VS-9 docs-proof enforcement. This retry completed the one missing Task 02 item: an incomplete rename left by the resource-exhausted cutoff — `space-doctor-mcp-live.test.ts` still asserted `MCP_TOKEN_SET` after the source was renamed to `MCP_CONNECTION_SET`; fixed the title and assertion (now in `776ce89`). | Focused Task 02 suites all green at clean HEAD `776ce89` (135 passed / 0 failed): CLI 122 — `connection-onboarding` 4 (profile lock, adapter idempotency, ID-only resume, active/revoked descriptors), `wizard/setup`, `space-doctor`, `space-doctor-mcp-live` (incl. `MCP_CONNECTION_SET`/`MCP_CONNECTION_SPACE_MATCH`), `help-contract` (asserts `mrmr connection create` present and `grant mint`/`space grant mint`/`space onboard` absent), `docs-proof` 29 (broadened VS-9 fenced + prose + shell-type `requires_view` bans); `apps/desktop` `mcp-launcher` 2; `mcp-bridge` `error-surface` 6 (local fail-closed, OS-credential lookup, CI secret injection, no token leak); `hub-daemon` `grant-mint` 3 (removed `murrmure_grant_mint` → 403); `shell-web` `McpSnippetCard` 2 (ID-only `--hub`/`--connection` args); `hub-core` `config-clean-state` 4 (advanced ACL accepts applied canonical ids, rejects `future-review` with `unknown_flow_acl`). All seven done-gate bullets satisfied. Working tree clean. | review |

