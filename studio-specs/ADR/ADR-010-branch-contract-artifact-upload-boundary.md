# ADR-010 — Branch contracts and host-mediated artifact submission

**Status:** Accepted  
**Date:** 2026-07-15

## Context

A branch may require browser files as part of resolution. Treating files as a
separate scratch upload left requiredness, branch scope, authorization, quotas,
and idempotency ambiguous. Giving a sandboxed View a Hub credential or upload
identifier would also cross the View security boundary established by ADR-009.

## Decision

1. Every compiled branch owns one complete resolve contract: payload schema,
   `payload_required`, `artifact_required`, branch-local `artifact_slots`, and
   route effects. There is no merged step-level slot union.
2. A name in `schema.required` is an artifact requirement when the same branch
   declares that name in `artifact_slots`; all other names remain payload
   requirements. A payload property and artifact slot may not share a name.
3. Trusted runtimes validate Draft 2020-12 schemas through the shared Ajv 8
   wrapper. Only the approved format list is enabled; remote references and
   executable/custom formats are rejected.
4. Production Views send `File`/`Blob` objects only to the trusted shell host.
   The host validates, obtains an actor/run/step/branch/metadata/idempotency-bound
   Hub upload intent, transfers bytes, and consumes that intent with resolve.
   Intent IDs, reservations, and Hub credentials never enter the iframe.
5. The Hub authoritatively revalidates the selected branch before promotion.
   Fixed local ceilings are 25 MiB/file, 50 MiB/resolution, 250 MiB/run, and
   2 GiB/space. Uncommitted intents have a one-hour idle lease and are swept at
   startup and every 15 minutes.
6. Cancellation or failure before commit removes temporary bytes and releases
   reservations. Cancellation after commit reconciles to the idempotent resolved
   result. Persisted diagnostics contain metadata and hashes only, never content,
   credentials, or host paths.

## Consequences

- File-only branches resolve with an empty payload and required artifacts.
- View authors use `submitBranch(branch, { files })`; base64 and direct View
  mutation APIs are removed.
- HTTP, View, MCP, and CLI clients receive the same
  `CONTRACT_VALIDATION_FAILED` entries.
- Agent-local paths remain a trusted bridge input only when they resolve inside
  the active step workdir; remote clients use upload intents or artifact refs.

## Related

- [ADR-007](./ADR-007-resolver-agnostic-step-contracts.md)
- [ADR-009](./ADR-009-space-owned-view-resolver-and-hardened-host.md)
- [Step contract bridge](../current/bridges/step-contract.md)
- [Artifacts bridge](../current/bridges/artifacts.md)
