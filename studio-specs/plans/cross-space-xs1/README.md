# Cross-space XS1 — deferred

> **Not normative.** Deferred scope tracked here until promoted to
> [current/cross-space/spec.md](../../current/cross-space/spec.md). XS0 (same-hub
> ask/answer) is the normative, in-DoD surface; XS1 below builds on it.

## Deferred surfaces

| Area | Description |
|------|-------------|
| Config `query_policy` editor | Configure UI to edit a space's inbound/outbound query allowlists and `forbidden_topics`/`forbidden_fields`. XS0 enforces policy; XS1 adds the editor. |
| Cross-hub federation relay | `query.ask` across hubs via the hub S3 relay. On relay down: fail fast with `TARGET_SPACE_UNREACHABLE`; local-only spaces unaffected (c02-J13). Outbound queue drains in order on reconnect — no synchronous cross-hub wait. |
| `context_fetch@1` query type | Knowledge-capability handler returning `{ sections: [{ title, content, relevance }] }`, max N sections, topic policy (c02-J14). Params: `{ topic: string, max_sections?: number }`. |
| `openapi_diff_ref@1` query type | Platform/capability handler returning `{ ref: string }` blob ref for an OpenAPI diff. |

## Deferred acceptance (XS-full)

1. Federation ask: personal hub → company hub returns a structured answer.
2. Relay down → `TARGET_SPACE_UNREACHABLE` without hang; local-only spaces unaffected.
3. `context_fetch@1` registered and answered with section cap + topic policy.

## Promotion criteria

Promote an item to `current/cross-space/spec.md` when it has a green fixture under
`current/fixtures/cross-space/` and a vitest covering it. Federation additionally
requires the hub S3 relay subsystem to be in scope.

## Source

XS0 normative spec: [current/cross-space/spec.md](../../current/cross-space/spec.md).
Worker-dispatch contract for capability-owned query types:
[current/build-capability/12-worker-runtime-and-host-bridge.md](../../current/build-capability/12-worker-runtime-and-host-bridge.md) §6.
