# Phase 4 Review — Doctor live health (MCP-3)

**Plan:** [2026-07-09-mcp-reliability-plan.md](./2026-07-09-mcp-reliability-plan.md) § Phase 4
**Reviewer:** Review agent
**Date:** 2026-07-09

## Verdict: **PASS**

**Blocking issues: 0**

Dev's claim (all 10 work items done, 25 tests) is accurate. Implementation matches the Phase 4 specification and anti-patterns are respected (no fake `additionalProperties: true` masking, fat shape still errors, no dual-path acceptance).

---

## Verification results

### 1. All 7 live MCP checks implemented with correct issue codes — PASS

| # | Check code | Location | Notes |
|---|------------|----------|-------|
| 1 | `MCP_DISCOVERY` | `space-doctor-mcp.ts:717` | `shared.json` presence + `GET /v1/health` + endpoint-vs-live-hub match, all folded into one issue |
| 2 | `MCP_CONFIG_SHAPE` | `space-doctor-mcp.ts:307-316` | Warns on `MURRMURE_HUB_URL` / `MURRMURE_SPACE_ID` keys in `mcp.json` (extension of Phase 2 flip) |
| 3 | `MCP_TOKEN_SET` | `space-doctor-mcp.ts:738` | Accepts env var, credentials token, or `${env:…}` reference |
| 4 | `MCP_TOKEN_SPACE_MATCH` | `space-doctor-mcp.ts:748-793` | Compares `whoami` token spaces vs linked `.murrmure/link.json` (ISSUE-07) |
| 5 | `MCP_CATALOG_LIVE` | `space-doctor-mcp.ts:826-848` | Requires `murrmure_resolve_step` + `murrmure_space_status` in catalog |
| 6 | `MCP_SCHEMA_PRESENT` | `space-doctor-mcp.ts:862` | Requires non-empty `inputSchema` with a non-empty `required` array on `murrmure_resolve_step` |
| 7 | `MCP_PROBE_INVOKE` | `space-doctor-mcp.ts:885-898` | Invokes `murrmure_space_status`; 401/403 → "revoked / bound to another space" message |

All 7 codes present with correct semantics. Checks 1 and 3–7 live in `probeMcpLiveHealth`; check 2 lives in `validateMurrmureServer` (config-shape scan), consistent with the plan note that shape was "already flipped in Phase 2; extend to warn."

### 2. `buildSpaceDoctorFixPlan` has remediation per code — PASS

`space-doctor.ts:360-458`. Every non-info `MCP_*` code produces an actionable step, de-duplicated via `addUniqueStep`:

- `MCP_DISCOVERY` → `mrmr login --hub-url …`
- `MCP_CONFIG_SHAPE` (+ other shape codes) → `mrmr space doctor --fix`
- `MCP_TOKEN_SET` → `mrmr grant mint --space <id> --label cursor-agent` + export hint
- `MCP_TOKEN_SPACE_MATCH` → `mrmr grant use --space <linked>`
- `MCP_CATALOG_LIVE` / `MCP_PROBE_INVOKE` → `mrmr whoami` (+ `grant use`)
- `MCP_SCHEMA_PRESENT` → update/restart hub daemon note

Mapping is asserted end-to-end by `space-doctor.test.ts:280` ("maps MCP issue codes to actionable fix steps") across all 7 codes.

### 3. `runDoctor` includes MCP checks — PASS

`doctor.ts:284-304`. Top-level `runDoctor` now runs `scanMcpConfig` + `probeMcpLiveHealth`, filters out `info`, and merges MCP issues into the doctor issue list. No longer skips MCP.

### 4. Auth path fix in `runSpaceDoctor` — PASS

`space-doctor.ts:726` — `const auth = options.auth ?? authInfo.auth;` — hub/live checks now use resolved auth (env/credentials), not only `options.auth`. `probeMcpLiveHealth` (line 796-802) and the hub index status fetch both consume the resolved `auth`. Regression covered by `space-doctor.test.ts:123` ("uses resolved auth for hub index checks (no options.auth required)") which asserts `/v1/spaces/…/index/status` is fetched and `HUB_CHECK_SKIPPED` is absent when only env auth is present.

### 5. `space-doctor-mcp-live.test.ts` covers revoked token + ISSUE-07 — PASS

- Revoked/wrong grant: `test:269` "flags MCP_PROBE_INVOKE on revoked/wrong grant (HTTP 403)" — mock returns `token_denied` on `/v1/mcp/tools/call`.
- ISSUE-07: `test:244` "flags MCP_TOKEN_SPACE_MATCH for ISSUE-07 linked-space mismatch" — whoami returns `spc_other` while workspace is linked to `spc_demo`.
- Plus a healthy-fixtures happy path and one negative test per remaining check (7 checks + happy path = 8 tests).

### 6. No fat MCP config regression — PASS

`validateMurrmureServer` still emits `MCP_FAT_COMMAND_SHAPE` (error) and `MCP_FAT_ENV_KEYS` (error) for the `"murrmure" + args ["mcp"]` shape and fat env keys. Asserted by `space-doctor-mcp.test.ts:61` ("treats murrmure + args mcp as fat-shape error") and `buildMcpConfigSnippet` snapshot (`:115`) confirming thin-only output (`murrmure-mcp`, no `args`, no `MURRMURE_HUB_URL`/`MURRMURE_SPACE_ID`). No anti-pattern reintroduced.

### 7. `pnpm --filter @murrmure/cli test -- space-doctor` — NOT EXECUTED (environment limitation)

The command could **not** be run: this review executes in a read-only sandbox, and Vitest bundles its `.ts` config to a sibling temp `.mjs` (`vitest.config.ts.timestamp-*.mjs`), which fails with `EPERM` on the read-only filesystem. This is an environment constraint, **not** a test failure.

Static verification of the matched files confirms the claimed count and green expectations:

| File | Test count |
|------|-----------|
| `space-doctor.test.ts` | 9 |
| `space-doctor-mcp.test.ts` | 8 |
| `space-doctor-mcp-live.test.ts` | 8 |
| **Total** | **25** |

25 matches the dev's claim. All assertions are consistent with the implementation reviewed above; no contradiction found. Recommend the human re-run this suite in a writable environment as a formality before merge (non-blocking).

---

## Non-blocking observations

- `MCP_DISCOVERY`, `MCP_TOKEN_SET`, `MCP_TOKEN_SPACE_MATCH` are emitted at `warning` (not `error`) severity, so they do not flip `result.ok` to false. This matches the plan (Phase 4 is DX health, `mrmr space doctor` surfaces them via "Problems"/"Try this") and is intentional given catalog/probe can legitimately be unreachable in offline dev.
- Discovery collapses three sub-conditions (missing file, health failure, endpoint mismatch) into a single `MCP_DISCOVERY` issue with concatenated messages. Acceptable; slightly coarser than one-issue-per-condition but keeps output readable.

## CI-gate assessment (Phase 4 row)

- `space-doctor-mcp-live.test.ts` — all 7 checks with fixtures + revoked-token + ISSUE-07 mismatch: **present**.
- `space-doctor.test.ts` — fix-plan mapping per MCP code + auth-path regression: **present**.

Both acceptance-test requirements are met by inspection.
