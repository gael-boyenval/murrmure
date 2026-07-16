# Phase 1 Review — MCP reliability (Hub input schemas + wake prompt)

**Date:** 2026-07-09
**Reviewer:** REVIEW agent
**Plan:** [2026-07-09-mcp-reliability-plan.md](./2026-07-09-mcp-reliability-plan.md) § Phase 1
**Scope reviewed:**
- `packages/hub-daemon/src/mcp-tool-schemas.ts` (new)
- `packages/hub-daemon/src/wake-prompt.ts` (new)
- `packages/hub-daemon/test/http/mcp/catalog-schema.test.ts` (new)
- `packages/hub-daemon/src/mcp-tool-registry.ts` (modified)
- `packages/hub-daemon/src/control-bus.ts` (modified)

---

## Verdict: **PASS**

All four Phase 1 work items are implemented and match the acceptance criteria. No blocking issues. No scope creep into Phase 2. Two non-blocking notes are recorded below.

---

## Acceptance criteria trace

### Phase 1 item 1 — `inputSchema` builders in hub — PASS
`mcp-tool-schemas.ts` defines `buildPlatformToolInputSchema(toolName, { emitCatalog })` with a `PLATFORM_TOOL_INPUT_SCHEMAS` map (18 static tools) plus a dynamic branch for `murrmure_emit_event` delegating to `buildEmitEventInputSchema` in `@murrmure/hub-core`. Helper factories (`objectSchema`, `stringSchema`, `stringArraySchema`) default `additionalProperties: false` at the top level.

### Phase 1 item 2 — schemas attached in `listForToken()` for all 19 PLATFORM_TOOLS — PASS
`mcp-tool-registry.ts` `listForToken()` now calls `buildPlatformToolInputSchema(tool.name, { emitCatalog })` for every tool that passes the capability filter and attaches it as `def.inputSchema`. `PLATFORM_TOOLS` contains exactly 19 entries; 18 have static schemas and `murrmure_emit_event` is built from the emittable-events catalog (lazily, only when a bare space is present).

**All 19 tools verified with schemas** (not the tutorial subset only):
`query_ask`, `murrmure_apply_space`, `murrmure_space_status`, `murrmure_grant_mint`, `murrmure_invoke_action`, `murrmure_resolve_step`, `murrmure_list_emittable_events`, `murrmure_emit_event`, `murrmure_create_session`, `murrmure_list_sessions`, `murrmure_get_session`, `murrmure_create_run`, `murrmure_get_run`, `murrmure_list_step_contracts`, `murrmure_get_run_graph`, `murrmure_attach_orchestration`, `murrmure_cancel_run`, `murrmure_wait_for_run`, `murrmure_journal_query`.

**No fake `{ additionalProperties: true }` top-level masks (anti-pattern #11).** Every tool schema is `type: "object"` with concrete named `properties` and `additionalProperties: false` at the root. `additionalProperties: true` appears only on genuinely free-form nested payload fields (`params`, `bundle`, `input`, `expect`, `payload`), which is correct — those are opaque JSON blobs, not the tool argument surface.

### Phase 1 item 3 — per-tool schema matrix + P0 required fields — PASS
`catalog-schema.test.ts` asserts (a) catalog tool-name set equals all 19, (b) every tool has a non-empty `inputSchema`, and (c) P0 `required` arrays match. Verified P0 required fields in `mcp-tool-schemas.ts` against the plan's P0 table:

| Tool | Plan required | Implemented `required` | Match |
|------|---------------|------------------------|-------|
| `murrmure_resolve_step` | `run_id, step_id, branch` | `["run_id","step_id","branch"]` | Yes |
| `murrmure_get_run` | `run_id` | `["run_id"]` | Yes |
| `murrmure_wait_for_run` | `run_id` | `["run_id"]` | Yes |
| `murrmure_list_step_contracts` | `run_id` | `["run_id"]` | Yes |
| `murrmure_get_session` | `session_id` | `["session_id"]` | Yes |
| `murrmure_create_run` | `session_id` | `["session_id"]` | Yes |
| `murrmure_invoke_action` | `action_name` | `["action_name"]` | Yes |
| `murrmure_journal_query` | optional | (no `required`) | Yes |
| `murrmure_space_status` | optional | (no `required`) | Yes |

### Phase 1 item 4 — pre-rendered `prompt` on control-bus wake messages — PASS
`wake-prompt.ts` is a faithful, verbatim port of the CLI `packages/cli/src/mcp/wake-prompt.ts` (`formatInvokeActionWake`, `formatWakePendingWake`, `formatControlWake`) — byte-for-byte identical logic (same instruction extraction, same `Data:` block that strips `instruction`/`prompt`, same trailing confirmation line). `control-bus.ts` adds an optional `prompt?: string` field to both `murrmure/control.invoke_action` and `murrmure/control.wake_pending` params, and `publish()` now runs `withRenderedPrompt()` which renders the prompt via `formatControlWake` unless one is already present. The handshake route (`routes/mcp/index.ts`) drains and returns messages verbatim, so the rendered `prompt` reaches the client. Hub owns rendering — matches the "Hub renders, bridge relays verbatim" split (anti-pattern #13 respected).

---

## Test execution

**Command:** `pnpm --filter @murrmure/hub-daemon test -- test/http/mcp/catalog-schema.test.ts`

**Result: NOT EXECUTED — blocked by read-only sandbox.** Vitest fails at startup with `EPERM: operation not permitted, open .../vitest.config.ts.timestamp-*.mjs` because Vite must write a bundled-config temp file next to `vitest.config.ts`, which the review sandbox (read-only filesystem, Ask mode) disallows. This is an environment limitation, not a test failure.

**Static trace instead (high confidence the 2/2 tests pass):**

- *Test 1 (catalog schema matrix):* the fixture grants all platform capabilities (`hub:admin`, `space:read/write`, `action:invoke`, `step:resolve`, `flow:run`, `flow:read`, `gate:resolve`, `journal:read`). Every one of the 19 tools' `required_scope` is satisfied by `hasRequiredCapability`, so all 19 appear in the catalog → name-set assertion passes. Each receives a non-empty `inputSchema` (18 static + `emit_event` fallback schema, which is non-empty even with zero events). P0 `required` arrays match the table above.
- *Test 2 (handshake wake prompt):* handshake registers the principal (seq ≥ 1), the `murrmure_invoke_action` call publishes a `control.invoke_action` message whose `prompt` is rendered by `withRenderedPrompt`, and the second handshake drains it. The rendered prompt contains all asserted substrings (`Murrmure control wake: action invoke`, `Action: handle_spec_published`, `Instruction:`, the instruction text, and the `spec_key` value `ins_catalog_prompt` via the `Data:` block).

**Recommendation:** re-run the command in a normal (writable) environment to confirm 2/2 green before merge. Nothing in the code indicates it would fail.

---

## Scope-creep check — CLEAN

No Phase 2 work present:
- `packages/mcp-bridge/` does **not** exist.
- No new `murrmure-mcp` bin, no bridge/discovery/stdio-proxy code.
- No deletions of `packages/cli/src/mcp/*` (correctly deferred to Phase 2 MCP-CUTOVER).
- No doctor shape-flip, no snippet rewrites.
- The two modified hub files (`control-bus.ts`, `mcp-tool-registry.ts`) contain only Phase 1-relevant changes (prompt field + schema wiring).

(Note: the working tree contains many other unrelated modified files — `invoke-service.ts`, `flow-engine/*`, `sessions/index.ts`, etc. — but these predate this task per the initial git snapshot and are not attributable to the Phase 1 dev work under review.)

---

## Non-blocking notes (no fix required for Phase 1)

1. **Handshake test sends `space_id` in the request body.** The target architecture (plan §Wake cutover) says the bridge must NOT send `space_id` for non-bootstrap tokens. That constraint lands in Phase 2; the current test exercising `space_id` is consistent with the present hub contract and is fine for Phase 1. Flag it so the Phase 2 handshake-replay test drops `space_id`.
2. **`emit_event` schema depends on live space state.** When the space has no hooks/events, the fallback schema (`event_type` + `payload` required) is used — still non-empty, so the test passes. Worth a dedicated assertion in a future test that `murrmure_emit_event` yields a `oneOf` branch schema when events exist, to guard the dynamic path.

---

## Fixes for Composer agent

None required. Verdict is PASS. Only action item: run the test suite in a writable environment to convert the static trace into an executed 2/2 pass before merging.
