# ADR-013 — Versioned agent assignment prompt and bridge authority

**Status:** Accepted
**Date:** 2026-07-15
**Owners:** Hub core, Executors, MCP bridge
**Task:** [Tutorial v3 Task 07](../plans/2026-07-14-tutorial-v3-build-tasks/07-connected-agent-build.md)

## Context

An agent handler needs two things that must not be conflated: a user-authored
task and the live protocol contract for its current assignment. The former
prompt envelope repeated session metadata, discovery prose, and generic tool
instructions while branch calls still contained placeholder run IDs. A spawned
local harness also inherited a persistent local MCP connection path even though
the Hub had minted narrower assignment authority.

## Decision

1. Every generated assignment contract begins exactly
   `Protocol: murrmure.agent/v1`. The handler `prompt` is the Task; generated
   protocol facts are a separate delimited block.
2. The active step is rendered from the canonical compiled branch contract.
   Branches are sorted, each carries a compact recursively key-sorted Draft
   2020-12 payload schema, separate artifact constraints, its compiled control
   effect, and a complete `murrmure_resolve_step` call with live run and step
   IDs plus schema-valid example values. Branch names do not select a rendering
   template or add inferred semantics.
3. A one-key assignment contains only Contracts. Discovery is emitted only
   when `contract_keys` contains more than one key. Session, MCP-tools,
   Resolve-API, placeholder-ID, and duplicated mechanics sections are absent.
4. Local handlers render workspace-relative `artifacts_out` inputs. Remote or
   federated handlers render an authorized upload-intent reference; the Hub
   never reads a path on an agent machine.
5. The Hub continues to mint the ephemeral run/step/handler credential decided
   in [ADR-012](./ADR-012-safe-shell-handler-interpolation-and-credentials.md).
   The executor adds a non-secret `MURRMURE_ASSIGNMENT_SCOPE` marker. When a
   local MCP descriptor starts inside that assignment, the bundled bridge uses
   `MURRMURE_HUB_TOKEN` as assignment authority and does not read the persistent
   OS-store connection. Missing assignment authority fails closed. Normal local
   bridge startup remains the connection-ID/credential-store behavior in
   [ADR-008](./ADR-008-local-connection-credentials-and-launcher.md).
6. Terminal step/run, timeout, cancellation, process exit, or shutdown revokes
   the credential and terminates the process group through the shared lifecycle.
   Prompt and dispatch audit surfaces never contain the credential.
7. A nested parent contract lists only its direct declared children and renders
   a complete `murrmure_open_child_step` call with live identifiers. A resumed
   assignment renders `reason: resumed` and the canonical returned-child
   identity, branch, iteration, payload, and artifact references. Activating a
   child revokes the old assignment before dispatch; return creates a fresh
   assignment under [ADR-015](./ADR-015-nested-step-call-return.md).

## Consequences

- A connected agent can resolve every branch from the prompt without guessing
  identifiers or reconstructing schemas.
- Handler authors describe domain work instead of copying protocol mechanics.
- A setup-created persistent connection discovers and starts work, while each
  spawned assignment mutates only its own run and step.
- An agent cannot keep mutating a yielded parent, and child return carries the
  same protocol facts across agent, shell/script, and View adapters.
- Prompt protocol changes require a new version rather than silent shape drift.

## Enforcement

- Hub-core structural tests cover protocol prefix, forbidden sections,
  deterministic schemas, branch neutrality, live IDs, payload/artifact
  separation, and local/remote artifact forms.
- The Tutorial Part 5 fixture is compiled and asserted against its exact
  `dev_build` handler.
- MCP bridge tests prove assignment mode bypasses credential lookup and that a
  fake agent resolves through the real stdio bridge with the ephemeral token.
- Assignment scope, expiry, revocation, and process termination remain enforced
  by the ADR-012 route and lifecycle suites.
