# ADR-008 — Local connection credentials and stable bundled launcher

**Status:** Accepted  
**Date:** 2026-07-14

## Context

The former local MCP path treated an agent grant token as configuration: setup
printed an environment export, wrote plaintext token files, and generated MCP
JSON containing a token reference. Desktop discovery also exposed the
versioned app-bundle entry directly, so moving or upgrading Desktop invalidated
client configuration. That model conflated a tool with an authorization
identity and made one credential per integration context appear normal.

## Decision

1. The public resource is a **connection**. One persistent connection represents
   one machine/trust boundary and may be installed into several local
   integration contexts. Murrmure does not store an agent entity.
2. Tutorial setup uses the named profile `tutorial-builder/v1`, containing
   exactly `space:read`, `flow:read`, `flow:run`, and `step:resolve`.
3. Local connection tokens live only in the operating-system credential store,
   keyed by Hub identity plus connection ID. Activation, descriptors, generated
   configuration, logs, project files, and reload state contain IDs only.
4. Local bridge startup requires `--hub` and `--connection` and fails closed
   when credential lookup is unavailable. It never falls back to an environment
   token. Explicit `--headless-ci` mode may consume `MURRMURE_HUB_TOKEN` as a
   process-runtime secret supplied by a CI secret manager.
5. Desktop atomically maintains the user-only launcher
   `~/.murrmure/bin/murrmure-mcp`. The launcher resolves the current bundled
   entry from discovery at invocation and validates it against the path embedded
   when Desktop installed the launcher. Desktop refreshes both discovery and
   launcher on each launch/update.
6. Packaged launcher/credential-store certification is macOS-only for this
   release. Unsupported packaged platforms fail explicitly and do not generate
   unusable adapter configuration.
7. Setup core emits one neutral descriptor. Context adapters own detection,
   config/skill installation, reload handoff, and verification. Generic fallback
   writes no target configuration and emits portable instructions. Every
   selected local adapter receives the same connection ID.
8. Setup-created connections are space-wide for current and future flows.
   Advanced restricted creation accepts only canonical flow IDs already applied
   to that space.

## Consequences

- `mrmr connection create` creates, stores, installs, and activates;
  `mrmr connection activate <id>` changes only the local pointer.
- `grant mint`, `grant use`, `agent connect`, `agent activate`, and
  `space onboard` have no public CLI aliases.
- Rotation creates a new connection identity and credential; revocation removes
  the local credential while Hub audit history remains read-only.
- A Desktop move or upgrade requires relaunching Desktop, not rewriting every
  MCP client configuration.
- Credential-store prompts and real signed/notarized relocation remain release
  smoke checks; deterministic launcher and adapter behavior remains automated.
