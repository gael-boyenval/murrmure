# Plan — MCP reliability for agent workflows

**Date:** 2026-07-09  
**Status:** Active — primary open platform track after v2 core + step contracts VS-8  
**Goal:** Agents running Murrmure shell steps (Tutorial 1, preview-review, feature-build) can **reliably** call hub protocol tools (`murrmure_resolve_step`, `murrmure_get_run`, `murrmure_wait_for_run`, …) from Cursor without falling back to raw `curl`.

---

## Executive summary

Murrmure v2 core is shipped (B1–B10 closed, step contracts VS-8 shipped). The **remaining agent-loop blocker** is not flow engine logic — it is **MCP integration between Cursor and the local hub**.

We have **three distinct failure modes**, observed across different sessions:

| ID | Symptom | Root cause class | Severity |
|----|---------|------------------|----------|
| **MCP-1** | Cursor catalog shows only `mcp_auth`; hub tools invisible | Stdio bridge / post-auth catalog refresh / server naming | P0 in some envs |
| **MCP-2** | Tools callable but every invoke sends `{}` args → hub validation errors | Missing `inputSchema` in `/v1/mcp/catalog` | P0 in tutorial build |
| **MCP-3** | `mrmr space doctor` passes while MCP is broken at runtime | Doctor scans files only, not live catalog | P1 DX |

**Hub HTTP already works.** `GET /v1/mcp/catalog` and `POST /v1/mcp/tools/call` succeed when called directly with a grant token. Agents recover today by **`curl` fallback** — fragile, undocumented in skills, and hides failures in stream-json.

**Strategic direction (user-confirmed 2026-07-07):** reduce dependence on the **CLI stdio subprocess** (`murrmure mcp`) and move Cursor toward **direct local hub HTTP** where Cursor supports it. Short term: fix schemas + bridge; medium term: hub-native MCP transport.

---

## Evidence — consolidated from feedback + live forensics

### Feedback files (still open)

| File | Type | What it reports |
|------|------|-----------------|
| [`feedbacks/2026-07-07-failure-cursor-mcp-bridge-callmcptool.md`](../../feedbacks/2026-07-07-failure-cursor-mcp-bridge-callmcptool.md) | Failure | Catalog stuck on `mcp_auth`; server name `murrmure` vs `project-0-…-murrmure`; HTTP works |
| [`feedbacks/2026-07-07-improvement-mcp-discovery.md`](../../feedbacks/2026-07-07-improvement-mcp-discovery.md) | Improvement | Same discovery issue; suggests HTTP fallback in docs |
| [`feedbacks/2026-07-07-improvement-cli-doctor.md`](../../feedbacks/2026-07-07-improvement-cli-doctor.md) | Improvement | `MCP_CATALOG_LIVE` check missing from doctor |

Related (not MCP-core but affects agent guidance):

| File | Note |
|------|------|
| [`feedbacks/2026-07-07-failure-integration-skill-name-path-drift.md`](../../feedbacks/2026-07-07-failure-integration-skill-name-path-drift.md) | Stale `murrmure-flow/` skill → wrong MCP docs |
| [`feedbacks/2026-07-07-improvement-docs-tutorial-part1-app-web-layout.md`](../../feedbacks/2026-07-07-improvement-docs-tutorial-part1-app-web-layout.md) | Tutorial layout drift (low priority) |

### Forensic session — `ses_01KX2PTD5D4ZZSZKAA5J8S1F65` (2026-07-09)

**Space:** `spc_murrmuretuto` (`/Users/gaelboyenval/web/GBworkspace/murrmuretuto`)  
**Run:** `run_01KX2PTD5HNWR4FV78XNCSFZB3`  
**Flow:** `flw_flows_preview_review`  
**Step analyzed:** `build` (`feature_build` shell action, stream-json stdout ~1.37 MB)

This session is **not MCP-1** (tools were reachable). It is **MCP-2**:

| MCP tool | Args sent by Cursor | Hub error |
|----------|---------------------|-----------|
| `murrmure_get_pending_wake` | `{}` | OK (no args needed) |
| `murrmure_resolve_step` | `{}` | `run_id, step_id, and branch are required` |
| `murrmure_wait_for_run` | `{}` | `Run not found` |
| `murrmure_get_run` | `{}` | `Get run failed (404)` |
| `murrmure_list_step_contracts` | `{}` | `run_id is required` |

Stream-json shape (every failed call):

```json
{
  "type": "tool_call",
  "subtype": "started",
  "tool_call": {
    "mcpToolCall": {
      "args": {
        "toolName": "murrmure_resolve_step",
        "args": {}
      }
    }
  }
}
```

The task prompt **did** contain `run_01KX2PTD5HNWR4FV78XNCSFZB3` and skill docs show full resolve payloads. The agent still called MCP with empty args.

**Recovery path used by agent:**

1. Read `.cursor/mcp.json` and `.cursor/skills/murrmure/reference/mcp.md`
2. `curl -X POST http://127.0.0.1:8787/v1/runs/.../steps/build.build-loop/resolve` with grant token from `mcp.json`
3. Build loop completed; human review validated

**Catalog inspection:**

```bash
curl -s "http://127.0.0.1:8787/v1/mcp/catalog?space_id=spc_murrmuretuto" \
  -H "Authorization: Bearer <grant>"
```

`murrmure_resolve_step` returns only:

```json
{
  "name": "murrmure_resolve_step",
  "description": "Resolve an active flow step (branch + payload + optional artifacts_out)",
  "required_scope": "step:resolve"
}
```

No `inputSchema`. Only `murrmure_emit_event` gets a schema today (dynamic emit catalog).

### Phase A findings — MCP space mismatch (ISSUE-07)

From archived [`shipped-2026-07/2026-07-07-phase-a-findings.md`](../archives/plans/shipped-2026-07/2026-07-07-phase-a-findings.md):

- agentStudio monorepo MCP wired to `spc_murrmure` while tutorial runs in `spc_my_space` / `spc_murrmuretuto`
- `murrmure_space_status` failed with scope error when wrong space grant is in MCP env

This is a **configuration** issue but must be caught by doctor and tutorial docs.

---

## Architecture today

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Cursor IDE                                                               │
│   CallMcpTool(server, toolName, arguments)                               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
          Path 1 (documented)   │   Path 2 (works today as fallback)
                                │
                                ▼                               ▼
┌───────────────────────────────┐           ┌───────────────────────────────┐
│ murrmure mcp (CLI stdio)      │           │ Hub HTTP (local :8787)        │
│ packages/cli/src/mcp/main.ts  │  proxies  │ packages/hub-daemon/.../mcp/  │
│                               │ ────────► │                               │
│ • fetch GET /v1/mcp/catalog   │           │ GET  /v1/mcp/catalog          │
│ • proxy POST /v1/mcp/tools/call           │ POST /v1/mcp/tools/call       │
│ • murrmure_get_pending_wake   │           │ POST /v1/mcp/session/handshake│
│ • control bus SSE wake        │           │                               │
└───────────────────────────────┘           └───────────────────────────────┘
         ▲                                              ▲
         │                                              │
   .cursor/mcp.json                              Same grant token
   MURRMURE_HUB_URL                               Authorization: Bearer
   MURRMURE_HUB_TOKEN
   MURRMURE_SPACE_ID
```

**Important clarification (from discovery triage):** “Hub-hosted MCP” means the **local hub daemon** inside Desktop dev (`http://127.0.0.1:8787`), not a remote cloud service. The question is whether Cursor talks to that HTTP API **directly** or via a **CLI subprocess** that may be missing from PATH (NVM, etc.).

### Code map

| Layer | Path | Role |
|-------|------|------|
| Hub MCP routes | `packages/hub-daemon/src/routes/mcp/index.ts` | Catalog, tool call, session handshake |
| Tool registry | `packages/hub-daemon/src/mcp-tool-registry.ts` | Grant-filtered tool list; **schemas mostly absent** |
| Tool handlers | `packages/hub-daemon/src/mcp-handlers.ts` | HTTP proxy to `/v1/runs/...`, `/v1/sessions/...` |
| CLI stdio bridge | `packages/cli/src/mcp/main.ts` | Cursor-facing MCP server |
| MCP reference (skill) | `packages/cli/skill/reference/mcp.md` | Agent-facing param docs (markdown only) |
| Docs | `apps/docs/reference/mcp-tools.md`, `apps/docs/reference/http-api.md` | Public API surface |
| Doctor (file scan) | `packages/cli/src/lib/space-doctor-mcp.ts` | Checks `mcp.json` exists, not live catalog |

### Shell action env vars (context for agents)

Long-running shell steps inject protocol context via env (see B3):

- `MURRMURE_RUN_ID`, `MURRMURE_SESSION_ID`, `MURRMURE_SPACE_ID`
- `MURRMURE_ACTIVE_STEP_CONTRACT_PATH`, `MURRMURE_STEP_CONTRACT`, `MURRMURE_STEP_WORKDIR`

Agents **should** read these when calling `murrmure_resolve_step`, but Cursor `CallMcpTool` won't auto-fill without schemas.

---

## Issue deep-dives

### MCP-1 — Catalog discovery / bridge visibility

**Symptoms:**

- Cursor Settings → MCP → Murrmure shows no tools or only `mcp_auth`
- `CallMcpTool` with server `murrmure` → `MCP server does not exist: murrmure`
- `CallMcpTool` with server `project-0-<workspace>-murrmure` → catalog empty after auth

**Contributing factors:**

1. **Post-auth catalog refresh** — bridge may not emit `tools/list_changed` after grant auth
2. **CLI not on PATH** — `mcp.json` runs `murrmure mcp`; NVM/homebrew installs may not be in Cursor's PATH
3. **Server naming** — docs/skills say `murrmure`; Cursor registers `project-0-…-murrmure`
4. **Wrong space in MCP env** — monorepo `spc_murrmure` vs tutorial space `spc_murrmuretuto`

**What works:** direct `POST /v1/mcp/tools/call` with grant token.

### MCP-2 — Empty arguments (catalog schema gap)

**Symptoms:**

- MCP tools appear in Cursor and are invoked
- Every call sends `"args": {}`
- Hub returns `tool_invoke_failed` with validation messages
- Agent falls back to `curl`; stream-json shows many “failed” MCP lines that are easy to miss in UI

**Root cause:**

`/v1/mcp/catalog` omits `inputSchema` for platform tools. Cursor's agent uses JSON Schema to construct `CallMcpTool` arguments. Markdown skill docs are not sufficient.

CLI bridge fallback (`additionalProperties: true` when schema absent) does **not** tell the agent **which** properties to send.

**Affected tools (minimum schema set):**

| Tool | Required args | Notes |
|------|---------------|-------|
| `murrmure_resolve_step` | `run_id`, `step_id`, `branch` | optional: `payload`, `artifacts_out`, `idempotency_key` |
| `murrmure_get_run` | `run_id` | alias `instance_id` in handler |
| `murrmure_wait_for_run` | `run_id` | optional `timeout_ms` |
| `murrmure_list_step_contracts` | `run_id` | |
| `murrmure_get_session` | `session_id` | |
| `murrmure_create_run` | `session_id` | optional `flow_id`, `input`, `space_id` |
| `murrmure_create_session` | optional `title`, `space_id` | |
| `murrmure_invoke_action` | `action_name` | plus dispatch context |
| `murrmure_journal_query` | filters | `session`, `type`, `limit`, … |
| `murrmure_space_status` | optional `space_id` | |
| `murrmure_cancel_run` | `run_id` | |

### MCP-3 — Doctor / onboarding blind spots

From improvement feedback — doctor checks:

- ✅ `.cursor/mcp.json` exists
- ❌ Live `/v1/mcp/catalog` tool count and names
- ❌ Schema presence for critical tools
- ❌ Grant token space matches `.murrmure/link.json` / active tutorial space
- ❌ Skill drift (`murrmure-flow/` vs `murrmure/`)

---

## Remediation phases

### Phase 1 — Input schemas (MCP-2) — **do first**

**Why first:** Unblocks agents even when stdio bridge works (proven in `ses_01KX2PTD5D4ZZSZKAA5J8S1F65`).

**Work:**

1. Add `inputSchema` builders in `packages/hub-daemon/src/mcp-tool-registry.ts` (or sibling `mcp-tool-schemas.ts`)
2. Attach schemas in `listForToken()` for each platform tool
3. Ensure CLI bridge passes schemas through unchanged (`packages/cli/src/mcp/main.ts` line ~122)
4. Add hub test: `GET /v1/mcp/catalog` includes `inputSchema.properties.run_id` for `murrmure_resolve_step`
5. Add docs-proof or CLI test that catalog schemas are non-empty for protocol tools

**Acceptance:**

- Cursor agent calls `murrmure_resolve_step` with populated `run_id`, `step_id`, `branch` in stream-json
- No `curl` fallback needed for resolve/wait/get_run in Tutorial 1 build step

### Phase 2 — Bridge hardening (MCP-1)

**Work:**

1. Verify `sendToolListChanged` fires after catalog-changing events (grant mint, `mrmr space apply`, control wake)
2. Document canonical Cursor server id in skill + tutorial (workspace-prefixed name)
3. `mcp.json` template: prefer absolute path to `murrmure` binary or `npx @murrmure/cli mcp`
4. Integration checklist (manual or CI): auth → catalog includes `murrmure_space_status` → invoke succeeds

**Acceptance:**

- Fresh tutorial Part 2 “call `murrmure_space_status`” passes without HTTP fallback
- No `MCP server does not exist: murrmure` when using documented server name

### Phase 3 — Hub HTTP transport for Cursor (strategic)

**Open product question:** Can Cursor MCP config target `http://127.0.0.1:8787/...` directly (SSE/streamable HTTP)?

**Work:**

1. Spike Cursor config for hub HTTP MCP endpoint (if supported)
2. If not supported: keep stdio bridge but make it a **thin wrapper** with zero business logic
3. Expose stable hub URL in Desktop dev (already `:8787` via sidecar)
4. Consider hub endpoint that speaks MCP over HTTP natively (no CLI subprocess)

**Acceptance:**

- Tutorial setup does not require `murrmure` on PATH for MCP to work
- Single transport documented as canonical

### Phase 4 — Doctor + tutorial guardrails (MCP-3)

**Work:**

1. `MCP_CATALOG_LIVE` check in `packages/cli/src/lib/space-doctor-mcp.ts`
2. `MCP_SCHEMA_PRESENT` — warn if `murrmure_resolve_step` lacks `inputSchema`
3. `MCP_SPACE_MATCH` — compare `MURRMURE_SPACE_ID` in mcp.json vs `.murrmure/link.json`
4. Wire fixes into `buildSpaceDoctorFixPlan` (re-mint grant, skill install, re-apply)
5. Tutorial Part 2 troubleshooting section for MCP failures

**Acceptance:**

- `mrmr space doctor` fails with actionable message when catalog empty or schemas missing
- Tutorial ISSUE-07 (wrong space) caught before agent run

### Phase 5 — Observability in shell UI

**Work (optional, ties to executor output UX):**

1. Parse `mcpToolCall` in agent stream view (done 2026-07-09)
2. Surface MCP failures as errors, not success-wrapped text
3. Link failed MCP lines to hub denial code + missing arg hints

---

## HTTP fallback (interim contract)

Until Phases 1–3 ship, document this **explicit fallback** in Tutorial 1 Part 2 and `packages/cli/skill/reference/mcp.md`:

```bash
# Resolve step when CallMcpTool sends empty args or catalog is broken
curl -s -X POST \
  -H "Authorization: Bearer $MURRMURE_HUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"branch":"completed","payload":{"preview_url":"http://localhost:3000"}}' \
  "http://127.0.0.1:8787/v1/runs/$MURRMURE_RUN_ID/steps/build.build-loop/resolve"
```

Or `POST /v1/mcp/tools/call`:

```json
{
  "name": "murrmure_resolve_step",
  "arguments": {
    "run_id": "run_…",
    "step_id": "build.build-loop",
    "branch": "completed",
    "payload": { "preview_url": "http://localhost:3000" }
  }
}
```

Mark as **interim** — not the long-term agent path.

---

## Success criteria (plan exit)

1. Tutorial 1 Part 2 MCP connectivity step passes in Cursor without curl fallback.
2. Tutorial 1 `feature_build` stream-json shows successful `murrmure_resolve_step` MCP calls with non-empty args.
3. `mrmr space doctor` detects catalog/schema/space mismatches.
4. Documented path from stdio bridge → hub HTTP (or thin wrapper) with no PATH fragility.
5. Open MCP feedback files can be closed or marked resolved with links to PRs.

---

## Out of scope (handled elsewhere)

| Item | Status / location |
|------|-------------------|
| Desktop intake `token_denied` (view iframe auth) | Shipped / archived — Phase A plan, H2 cookie auth |
| Step contracts VS-8 | Shipped — `apps/docs/guide/known-gaps.md` |
| view-sdk scaffold ETARGET | Separate feedback; not MCP |
| Skill name drift | Separate feedback; doctor Phase 4 touches it |

---

## Archived context

Shipped plans moved to [`studio-specs/archives/plans/shipped-2026-07/`](../archives/plans/shipped-2026-07/):

- `product-plan/` — rev-5 phases 01–10 (B1–B10)
- Step contracts specs + vertical slices + review notes
- Tutorial 1 discovery + Phase A desktop auth plan + findings
- Manual acceptance artifacts (VS-0, VS-1, VS-8)

---

## References

- Normative MCP tool list: [`studio-specs/current/product/spec.md`](../current/product/spec.md) § MCP
- Flow runtime bridge: [`studio-specs/current/bridges/flow-runtime.md`](../current/bridges/flow-runtime.md)
- Build capability MCP model: [`studio-specs/current/build-capability/07-mcp-tool-model-and-catalog-rebuild.md`](../current/build-capability/07-mcp-tool-model-and-catalog-rebuild.md)
- Tutorial: [`apps/docs/guide/tutorials/01-local-preview-review/`](../../apps/docs/guide/tutorials/01-local-preview-review/)
- Example flow: [`examples/flows/preview-review-v2/`](../../examples/flows/preview-review-v2/)
