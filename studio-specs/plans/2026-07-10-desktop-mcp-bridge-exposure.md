# Plan — Desktop-bundled MCP bridge exposure

**Date:** 2026-07-10  
**Status:** Planned — verify & close gaps  
**Goal:** After installing Murrmure Desktop, users can connect a coding agent **without** `npm install -g @murrmure/mcp-bridge`. The bundled bridge must be discoverable, referenced in MCP snippets, and exercisable end-to-end.

**Doc target (already written):** [agents-mcp.md](../../../apps/docs/guide/agents-mcp.md), Tutorial 1 v3 Part 1 § Connect your agent.

---

## Expected behavior (normative)

1. Desktop build copies `packages/mcp-bridge/dist` → `Resources/mcp-bridge/` (`apps/desktop/electrobun.config.ts`).
2. Desktop passes `MURRMURE_MCP_BRIDGE_ENTRY` (or equivalent) when starting the hub.
3. Desktop atomically installs/updates user-only `~/.murrmure/bin/murrmure-mcp`.
4. Hub writes `~/.murrmure/hubs/shared.json` with the current absolute bundled bridge entry for launcher-only discovery.
5. `mrmr connection create`, Desktop connection setup, and `resolveMcpBridgeCommand()` place the stable launcher path—not the app-bundle entry—in one neutral connection descriptor.
6. Connection tokens are stored only in the OS credential store, keyed by Hub + connection ID.
7. Integration-context adapters translate the neutral descriptor into native MCP + skill installation; the generic adapter returns portable no-write instructions.
8. The selected MCP client launches the stable launcher with Hub + connection ID only; it resolves the current bundle through discovery and the bridge retrieves the token at startup.
9. `murrmure_space_status` succeeds after adapter-specific reload/verification.

All selected local adapters reuse one machine/trust-boundary connection. Adapter selection does not create per-tool credentials; another machine or CI receives a separate connection.

Local bridge startup fails closed when the credential store is missing or locked; it never falls back to environment/plaintext credentials. Explicit headless/CI mode is separate and may accept runtime environment injection from a CI secret manager.

Packaged Desktop launcher/discovery/signing support is certified on macOS only in this release. Packaged Windows/Linux paths fail explicitly and generate no unusable integration configuration. Headless PATH-managed launchers remain a separate supported mode where available; platform abstraction preserves the neutral descriptor contract for future packaged implementations.

**Fallback (out of scope for Desktop verify):** headless hub → `"murrmure-mcp"` on PATH via global npm install.

---

## Verify checklist

| ID | Check | Where |
|----|-------|-------|
| **MB-1** | Packaged app contains `Resources/mcp-bridge/main.js` | Desktop artifact / `electrobun.config.ts` copy map |
| **MB-2** | Hub startup writes current bundle discovery while Desktop atomically maintains user-only `~/.murrmure/bin/murrmure-mcp` | `packages/hub-daemon/src/ops.ts`, Desktop runner/install |
| **MB-3** | `resolveMcpBridgeCommand()` returns the stable launcher; the launcher resolves the current bundled path at invocation | CLI launcher resolution + tests |
| **MB-4** | `mrmr setup` / `connection create` neutral descriptor uses the stable launcher (not app-bundle path or bare `"murrmure-mcp"`) and contains a connection ID but no token | CLI connection output tests |
| **MB-5** | Desktop setup passes the same neutral descriptor to supported context adapters and generic fallback | `apps/desktop` UI + adapter conformance + `studio-specs/current/desktop/spec.md` |
| **MB-6** | `mrmr doctor` warns if `mcp_bridge.command` missing while Desktop claims running | `space doctor` live probe |
| **MB-7** | Manual smoke: fresh Desktop install → setup wizard → supported adapter and generic adapter → `murrmure_space_status` | Tutorial 1 v3 acceptance |
| **MB-8** | Missing/locked/revoked/mismatched credential-store entry fails with actionable diagnostics and no token disclosure | bridge + doctor tests |
| **MB-9** | Local Desktop bridge rejects environment fallback; explicit headless mode accepts CI secret-manager runtime injection without writing/logging the token | bridge auth-mode tests |
| **MB-10** | Multiple selected local adapters receive one connection ID/actor; another trust boundary receives a separate connection | adapter integration tests |
| **MB-11** | Existing generated configs survive Desktop move/update; launcher install/update is atomic, user-only, and rejects unsafe discovery targets | packaged relocation/security smoke |
| **MB-12** | Signed/notarized macOS package passes launcher smoke; packaged Windows/Linux paths report unsupported and write no integration config | platform/package tests |

---

## Known implementation (partial — confirm in verify pass)

- `electrobun.config.ts` copies mcp-bridge dist ✅
- `hub-daemon/ops.ts` sets `discovery.mcp_bridge` when `mcpBridgeEntry` provided ✅
- `resolveMcpBridgeCommand()` reads `shared.json` → `mcp_bridge.command` ✅
- Specs: `studio-specs/current/desktop/spec.md`, `cli/spec.md`, `product/spec.md` § MCP ✅

**Gaps to confirm during verify:**

- Does Desktop dev mode (`pnpm dev`) write `mcp_bridge.command` the same as packaged build?
- Does launcher discovery behave identically across macOS app bundle layout vs dev `Resources/`?
- Do any docs pages still say `npm i -g @murrmure/mcp-bridge` as default? (sweep: `quick-start.md`, `troubleshooting.md`, older tutorials)

---

## Done when

- [ ] MB-1–MB-12 checked; failures filed as follow-up slices or fixed in same PR
- [ ] No user-facing doc lists `@murrmure/mcp-bridge` npm install as **required** when Desktop is the entry point
- [ ] Tutorial 1 v3 Part 1 connect step matches observed connection-ID-only snippet on a clean Desktop install
- [ ] No generated MCP config, project file, process argument, environment instruction, or log contains a connection token
- [ ] Core bridge/setup code contains no named-agent config paths; supported adapters and generic fallback consume the same descriptor

---

## Related

- MCP reliability (shipped): `studio-specs/archives/plans/shipped-2026-07/mcp-reliability/`
- Hub clean-slate boot (separate): `2026-07-10-hub-clean-slate-boot.md`
