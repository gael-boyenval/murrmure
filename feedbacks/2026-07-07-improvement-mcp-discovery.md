# Improvement request: MCP tool discovery in Cursor

## Topic

mcp_discovery

## Summary

In a Cursor agent session connected to the Murrmure MCP server, the agent only sees `mcp_auth` in the tool catalog. Hub tools such as `murrmure_emit_event`, `murrmure_space_status`, and other grant-filtered platform tools are not invokable via `CallMcpTool`, even though the same tools succeed when called directly against the hub HTTP endpoint `POST /v1/mcp/tools/call`.

This blocks tutorial onboarding checks (e.g. “Call `murrmure_space_status`”) and prevents agents from emitting feedback or invoking Murrmure protocol tools from within Cursor.

## Suggestion

Ensure the Cursor MCP bridge (`murrmure mcp` stdio server) exposes the full grant-filtered tool catalog after authentication completes — i.e. `tools/list` in Cursor should match `GET /v1/mcp/catalog` for the configured `MURRMURE_SPACE_ID` and grant token.

If a Cursor-side auth handshake (`mcp_auth`) must complete before catalog tools appear, document that flow explicitly and verify `sendToolListChanged` / catalog refresh fires post-auth so clients reload the list.

**Fallback (docs-only):** If Cursor cannot surface hub tools reliably, document in Tutorial 1 Part 2 that agents must use hub HTTP (`/v1/mcp/tools/call`) for `murrmure_emit_event` and similar calls during tutorial runs, with a copy-paste curl or `fetch` example.

## Context

- Space: `spc_my_space` (`/spaces/spc_my_space`)
- Workflow: Tutorial 1 — Local preview review, Part 2 (Setup wizard), Step 2 — MCP connectivity test (`murrmure_space_status`)
- Symptom: Cursor `CallMcpTool` catalog shows only `mcp_auth`; hub HTTP `POST /v1/mcp/tools/call` succeeds for the same grant and space
- Affected tools (non-exhaustive): `murrmure_space_status`, `murrmure_emit_event`, other grant-scoped hub tools
- Bridge: `murrmure mcp` → fetches `/v1/mcp/catalog`, proxies calls to `/v1/mcp/tools/call`

## Source

- Event: `murrmure.feedback.requestImprovement`
- Emitter: `/spaces/spc_my_space`
- Session: `ses_01KWYAKGB3HHTREXT6PZ9K04TE`
- Run: `run_01KWYAKGB67XC3F8ZC8Z4QBVCX`
- Docs: Tutorial 1 Part 2 Step 2 — Test: Call `murrmure_space_status`
