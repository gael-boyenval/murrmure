# Failure: integration_failure — Cursor MCP bridge broken

## Summary

Cursor agent `CallMcpTool` cannot invoke Murrmure hub tools (`murrmure_emit_event`, `murrmure_space_status`, and others). After completing `mcp_auth`, the MCP server `project-0-agentStudioTestEnv-murrmure` still exposes only `mcp_auth` in the tool catalog. Direct `CallMcpTool` calls targeting server name `murrmure` fail with **"MCP server does not exist: murrmure"**.

The hub HTTP API works: the same operations succeed via `POST /v1/mcp/tools/call`. The agent was forced to fall back to `curl` against the hub instead of using the Cursor MCP bridge configured with `murrmure mcp` in `mcp.json`.

## Context

- **Repo / space:** `/spaces/spc_my_space`
- **Failure type:** `integration_failure`
- **Environment:** Cursor IDE, workspace `agentStudioTestEnv`
- **MCP config:** `.cursor/mcp.json` — command `murrmure mcp` (stdio bridge to hub)
- **Reported at:** *(not provided in payload)*

## Evidence

**Summary (from emitter):**

> Cursor agent CallMcpTool cannot invoke murrmure_emit_event or murrmure_space_status; server project-0-agentStudioTestEnv-murrmure only lists mcp_auth after mcp_auth; CallMcpTool returns "MCP server does not exist: murrmure". Agent forced to use curl to /v1/mcp/tools/call. Hub HTTP works; Cursor MCP bridge broken.

**Observed symptoms:**

| Path | Result |
|------|--------|
| `CallMcpTool` → server `murrmure` | Error: `MCP server does not exist: murrmure` |
| `CallMcpTool` → server `project-0-agentStudioTestEnv-murrmure` | Catalog shows only `mcp_auth` after auth completes |
| `POST /v1/mcp/tools/call` (hub HTTP) | Succeeds for `murrmure_space_status`, `murrmure_emit_event`, etc. |

**Affected tools (non-exhaustive):** `murrmure_emit_event`, `murrmure_space_status`, other grant-scoped hub tools that should appear after `mcp_auth`.

**Logs (from emitter):** *(empty)*

**Docs (from emitter):** *(empty)*

**Repro (inferred):**

1. Configure Cursor MCP with `murrmure mcp` and a valid grant for `spc_my_space`.
2. Open an agent session in `agentStudioTestEnv`.
3. Complete `mcp_auth` if prompted.
4. Attempt `CallMcpTool` for `murrmure_space_status` or `murrmure_emit_event`.
5. Observe catalog stuck on `mcp_auth` only, or server-name mismatch error for `murrmure`.

Related improvement request: `feedbacks/2026-07-07-improvement-mcp-discovery.md` (same root cause, DX angle).

## Murrmure improvement

1. **Fix post-auth catalog refresh** — After `mcp_auth` completes on the `murrmure mcp` stdio bridge, emit `tools/list_changed` (or equivalent) so Cursor reloads the full grant-filtered catalog from `GET /v1/mcp/catalog`. `tools/list` in the IDE must match hub HTTP for the configured `MURRMURE_SPACE_ID` and grant.
2. **Align MCP server naming** — Document the canonical server identifier Cursor registers (e.g. `project-0-agentStudioTestEnv-murrmure` vs `murrmure`) and ensure agent-facing docs/skills reference the name agents must pass to `CallMcpTool`, or alias both to the same bridge.
3. **Integration test for Cursor bridge** — Add a CI or manual checklist that verifies: auth → catalog includes `murrmure_space_status` → `CallMcpTool` succeeds without HTTP fallback.
4. **Document HTTP fallback until fixed** — In Tutorial 1 Part 2 and MCP reference, state that if the Cursor catalog shows only `mcp_auth`, agents may call `POST /v1/mcp/tools/call` with the grant token until the bridge refresh issue is resolved.

## Source

- Event: `murrmure.feedback.failure`
- Emitter: `/spaces/spc_my_space`
- Session: `ses_01KWYC0EV44HZS2H982JPBGVJX`
- Run: `run_01KWYC0EV58H0KN43N9TA8A3WT`
