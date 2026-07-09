# MCP reliability plan (shipped 2026-07-09)

Phases 0–4 and 6 implemented. Phase 5 (HTTP MCP + OAuth) deferred.

| File | Role |
|------|------|
| [2026-07-09-mcp-reliability-plan.md](./2026-07-09-mcp-reliability-plan.md) | Full plan spec |
| [2026-07-09-mcp-reliability-orchestration.md](./2026-07-09-mcp-reliability-orchestration.md) | Dev/review loop log + remaining manual sign-off |
| `2026-07-09-mcp-reliability-phase*-review.md` | Per-phase review verdicts |
| `2026-07-09-mcp-reliability-plan-review-*.md` | Pre-implementation deep reviews |

**Shipped:** `@murrmure/mcp-bridge` (`murrmure-mcp`), hub `inputSchema` for all 19 platform tools, fat CLI MCP removed, doctor live MCP probes, grant mint/use, docs/skills/specs thin-shape sweep.

**Manual sign-off still open:** Tutorial 1 without curl fallback, Tutorial 3 hook wake E2E, close MCP feedback files with PR links.
