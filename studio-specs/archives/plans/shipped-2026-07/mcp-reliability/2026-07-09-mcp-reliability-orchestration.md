# MCP Reliability Plan — Orchestration Progress

**Started:** 2026-07-09  
**Completed:** 2026-07-09  
**Plan:** [2026-07-09-mcp-reliability-plan.md](./2026-07-09-mcp-reliability-plan.md)

## Loop per phase

1. **Dev** — `gpt-5.3-codex-xhigh`
2. **Review** — `claude-opus-4-8-thinking-high`
3. **Fix** — `composer-2.5-fast`
4. Repeat until phase acceptance criteria pass

## Status

| Phase | Dev | Review | Fix loops | Status |
|-------|-----|--------|-----------|--------|
| 0 — Hygiene | done | PASS | 0 | **complete** |
| 1 — Hub schemas | done | PASS | 0 | **complete** |
| 2 — Bridge + CUTOVER | done | PASS | 1 | **complete** |
| 3 — CLI + docs sweep | done | PASS | 0 | **complete** |
| 4 — Doctor live health | done | PASS | 0 | **complete** |
| 5 — HTTP MCP OAuth | — | — | 0 | **deferred** (plan: long-term, manual spike, non-blocking) |
| 6 — Shell UI observability | done | PASS | 0 | **complete** |

## Review artifacts

| Phase | Review file |
|-------|-------------|
| 0 | (inline PASS — token rotated, thin mcp.json) |
| 1 | [phase1-review](./2026-07-09-mcp-reliability-phase1-review.md) |
| 2 | [phase2-review](./2026-07-09-mcp-reliability-phase2-review.md) |
| 3 | [phase3-review](./2026-07-09-mcp-reliability-phase3-review.md) |
| 4 | [phase4-review](./2026-07-09-mcp-reliability-phase4-review.md) |
| 6 | (inline PASS — 14 component tests green) |

## CI gates — final status

| Gate | Status |
|------|--------|
| No live `tok_` in tracked non-markdown files | ✅ |
| Hub catalog-schema (19 tools) | ✅ 2/2 |
| Bridge stdio integration | ✅ 9/9 |
| CLI fat MCP deleted (`packages/cli/src/mcp/`) | ✅ |
| `rg '"murrmure".*"args".*"mcp"'` in cli/desktop | ✅ 0 matches |
| docs-proof + grant + doctor tests | ✅ 77/77 |
| Shell-web Phase 6 tests | ✅ 14/14 |

## Product integrity checklist

- [x] No live grant token in tracked files
- [x] `packages/cli/src/mcp/` deleted; `murrmure mcp` gone from help
- [x] `@murrmure/mcp-bridge` ships; `murrmure-mcp` bin works
- [x] MCP-CUTOVER landed atomically
- [x] All 19 platform tools have `inputSchema`
- [x] Doctor: live catalog probe, schema check, token↔link space match
- [x] Docs/skills/specs sweep complete; docs-proof enforces shape
- [x] `mrmr grant use` implemented and tested
- [x] CHANGELOG breaking entry present
- [x] Interim HTTP-fallback doc deleted
- [ ] Wake E2E manual sign-off (Tutorial 3 hook wake)
- [ ] Tutorial 1 Part 2 manual sign-off (no curl fallback)
- [ ] Three MCP feedback files closed with PR links

## Remaining manual sign-off (non-CI)

Per plan success criteria § Manual sign-off:
1. Tutorial 1 `feature_build` without curl fallback
2. Hook wake E2E (Tutorial 3) with bridge only
3. Close feedback files with PR links

Phase 5 (HTTP MCP + OAuth) explicitly deferred — stdio bridge remains default until Cursor HTTP MCP GA.
