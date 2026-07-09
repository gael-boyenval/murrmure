# Phase 3 Review — MCP Reliability Plan (CLI onboarding + docs/skills/specs sweep)

**Date:** 2026-07-09
**Reviewer:** Phase 3 review agent (ruthless verification pass)
**Plan:** [2026-07-09-mcp-reliability-plan.md](./2026-07-09-mcp-reliability-plan.md) § Phase 3
**Dev claim:** Phase 3 complete — all tests pass, rg gates clean.

## Verdict: **PASS** — 0 blocking issues

All 12 work items are implemented and the acceptance surface (grant mint/use, thin snippet parity, docs/skill/spec/example sweep, environment two-table split, CHANGELOG, docs-proof guard) is present and internally consistent with the code.

> ⚠️ **Test-execution caveat (environment, not a defect):** the reviewer ran in a **read-only sandbox**, so the requested `pnpm --filter @murrmure/cli test` could not execute — `vitest` fails at startup writing its bundled-config timestamp file (`EPERM … vitest.config.ts.timestamp-*.mjs`). This is a sandbox filesystem restriction, **not** a test failure. Every relevant test file was read and its assertions cross-checked against the implementation (see per-item evidence). CI must still be relied upon to confirm green; a maintainer should run the suite once in a writable environment before merge.

---

## Work-item verification (12/12)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | `grant mint` → print `export MURRMURE_HUB_TOKEN=…` + offer write `~/.cursor/mcp.json`; `--local` for project | ✅ | `space/grant.ts::grantMintCommand` prints `export MURRMURE_HUB_TOKEN=<token>` (L222), warns "will not be shown again", `--local`→`resolveMcpConfigPath` (project `.cursor/mcp.json`) vs default `~/.cursor/mcp.json`, `--write-mcp` non-interactive + TTY confirm, `writeThinMcpConfig` uses shared thin builder. |
| 2 | `grant use --space` → `~/.murrmure/grants/<space>.token` + `active` pointer; updates `whoami` effective token | ✅ | `grant-store.ts` (`grantTokenPath`, `activeGrantPath`, `writeGrantToken` mode 0600, `setActiveGrantSpace`, `resolveActiveGrantToken`). Wired into `auth.ts::activeGrantAuth`, `auth-source.ts` (`active-grant` source), `space-id.ts` (default space). `grantUseCommand` stores explicit token or activates stored token, `clearAuthContextCache()`. |
| 3 | `space init` — no default `.cursor/mcp.json`; README pointer to `grant mint` | ✅ | `space/init.ts` scaffolds `murrmure/` only; next-step line points to `mrmr grant mint`. `space-init.test.ts` asserts `.cursor/mcp.json` **not** created (L27). |
| 4 | Docs sweep (~17 pages) — remove `studio-hub-mcp`, fat `murrmure mcp`, three-env snippets | ✅ | `rg 'murrmure mcp\|args…["mcp"]\|MURRMURE_SPACE_ID.*mcp\|studio-hub-mcp' apps/docs` → **0 matches**. `murrmure-mcp` present across docs. |
| 5 | Skill sweep + `skill-eval/mcp-setup.json` | ✅ | `skill-eval/mcp-setup.json` expects `murrmure-mcp`, `mrmr grant mint`, `mrmr grant use`, `murrmure_space_status`. Skill dir has no `murrmure mcp` / fat args (only legit CLI-env `MURRMURE_SPACE_ID` refs). |
| 6 | Spec reconciliation (`cli/spec.md`, `hub/contracts.md`, `product/spec.md`, `bridges/*`, `build-capability/*`, `overview.md`) | ✅ | `rg studio-hub-mcp studio-specs/current` → **0**. `bridges/action-invoke.md` has the executor-env vs MCP-agent-env split (L44 ✅ Space id / L61 ❌ token-derived). `hub/contracts.md` L126 + `product/spec.md` L901 + `build-capability/07…` L26 all state MCP is token-derived, no `MURRMURE_SPACE_ID` pinning. |
| 7 | `environment.md` two tables (CLI/executor env vs MCP agent env token-only) | ✅ | `apps/docs/reference/environment.md`: "## MCP agent env (token only)" (`MURRMURE_HUB_TOKEN` only + notes: no `MURRMURE_SPACE_ID`, no `MURRMURE_HUB_URL`) and "## CLI / executor env" (keeps `MURRMURE_SPACE_ID`). Auth resolution order documents active-grant pointer. |
| 8 | `docs-proof.test.ts` — ban fat shape / `MURRMURE_SPACE_ID` in MCP examples; require `murrmure-mcp` | ✅ | New "phase 3 MCP docs guard" describe block: forbids `/murrmure mcp\|args…["mcp"]\|MURRMURE_SPACE_ID.*mcp\|studio-hub-mcp/i` across all apps/docs markdown, and asserts aggregate contains `murrmure-mcp`. |
| 9 | Examples — update `README.md` / `agent.md` connect sections | ✅ | `rg` fat refs in `examples/flows` → **0**. `murrmure-mcp` present in all example READMEs + `preview-review-v2/agent.md`. |
| 10 | CHANGELOG breaking entry | ✅ | `packages/cli/CHANGELOG.md` "Unreleased › Breaking Changes": removed `murrmure mcp`/`mrmr mcp`, MCP now targets `@murrmure/mcp-bridge` thin config, added `mrmr grant use`. |
| 11 | Delete interim HTTP-fallback section from skill `reference/mcp.md` | ✅ | `rg -i 'fallback\|curl' packages/cli/skill/reference/mcp.md` → **0**. File is a clean tool reference; no HTTP/curl fallback remains. |
| 12 | *(Optional)* `space doctor --fix` rewrites detected fat `mcp.json` | ⚠️ Not implemented (non-blocking) | No `--fix` path in `space-doctor-mcp.ts`. Plan marks this item **Optional**, so absence does not block Phase 3. Recommend tracking as a follow-up if desired. |

---

## Command evidence

**rg regrowth / sweep gates — all clean:**

```text
rg 'murrmure mcp|args…["mcp"]|MURRMURE_SPACE_ID.*mcp|studio-hub-mcp' apps/docs        → 0 (exit 1)
rg '"murrmure".*"args".*"mcp"' packages/cli apps/desktop packages/cli/templates       → 0 (exit 1)
rg studio-hub-mcp studio-specs/current                                                → 0 (exit 1)
rg 'murrmure mcp|args…["mcp"]|MURRMURE_SPACE_ID|studio-hub-mcp' examples/flows         → 0 (exit 1)
rg -i 'fallback|curl' packages/cli/skill/reference/mcp.md                             → 0 (exit 1)
test ! -d packages/cli/src/mcp                                                        → deleted OK
```

- `rg "mrmr-mcp"` remaining hits are confined to plan/review docs and `studio-specs/archives/**` (meta/expected) — no product code, docs, specs, or examples. (Note: FU-2 from the Phase 2 review re: `build-capability/02-sdk.md` should be confirmed resolved; it was flagged as a Phase-3-scope spec sweep item — see below.)

**Snippet parity (item that underpins CI "byte-identical thin snippet" gate):**

- `packages/cli/src/lib/space-doctor-mcp.ts::buildMcpConfigSnippet` (default token `${env:MURRMURE_HUB_TOKEN}`)
- `apps/desktop/src/menus.ts::buildMcpConfigSnippet`
- `packages/shell-web/src/lib/mcp-config-snippet.ts::buildThinMcpSnippet`

All three produce the identical thin shape (`command: "murrmure-mcp"`, single `MURRMURE_HUB_TOKEN` env, no `args`, no `MURRMURE_HUB_URL`/`MURRMURE_SPACE_ID`, no port). `mcp-snippet-shared.test.ts` asserts three-way equality + inline snapshot. `space-grant.test.ts` asserts written config contains `"command": "murrmure-mcp"` + `${env:MURRMURE_HUB_TOKEN}` and **not** `MURRMURE_SPACE_ID`/`args`. Repo `/.cursor/mcp.json` is thin shape with no `tok_` literal.

---

## Test files cross-checked against implementation

| Test file | Key assertions confirmed present |
|-----------|----------------------------------|
| `space-grant.test.ts` | mint prints export + stores `spc_…token`; `--write-mcp` writes global thin snippet (no `MURRMURE_SPACE_ID`/`args`); `--local --write-mcp` writes project config (not global); `grant use` stores token + active pointer and `resolveHubAuth` resolves it (`token`, `defaultSpaceId`). |
| `space-init.test.ts` | no default `.cursor/mcp.json` created. |
| `wizard/setup.test.ts` | thin snippet via `buildMcpConfigSnippet`; grant snippet contains token; setup plan steps `connect…grant`. |
| `mcp-snippet-shared.test.ts` | CLI = Desktop = Shell-web thin snippet (inline snapshot). |
| `docs-proof.test.ts` | phase-3 guard bans fat MCP refs in apps/docs + requires `murrmure-mcp`. |

---

## Non-blocking follow-ups (do not gate Phase 3)

1. **Item 12 (`doctor --fix`)** — optional; not implemented. Track separately if auto-remediation is wanted.
2. **CI green confirmation** — reviewer could not execute vitest (read-only sandbox EPERM). Run `pnpm --filter @murrmure/cli test -- docs-proof space-grant space-init wizard/setup mcp-snippet-shared` once in a writable env before merge.
3. **Phase 2 FU-2 carryover** — confirm `studio-specs/current/build-capability/02-sdk.md` no longer advertises `mrmr-mcp`/fat `murrmure mcp` (it was scoped into the Phase 3 spec sweep). Current `rg` shows the only live-spec `MURRMURE_SPACE_ID` usages are legitimate (CLI/executor env + explicit "token-derived, not required" notes).

---

## Summary

Phase 3 is **complete and consistent**. Grant mint/use is correctly wired end-to-end (store → active pointer → auth resolution → `whoami`/default-space). The thin-snippet contract is single-sourced and byte-identical across CLI, Desktop, and Shell-web. The docs/skill/spec/example sweep leaves no fat `murrmure mcp`, `studio-hub-mcp`, three-env snippet, or interim HTTP-fallback references in shipping surfaces, and `environment.md` cleanly separates MCP-agent (token-only) from CLI/executor env. The only unmet item is the explicitly-optional `doctor --fix`. **PASS with 0 blocking issues.**
