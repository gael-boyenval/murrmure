# Space handlers & `.mrmr/` cutover (shipped 2026-07-09)

VS-0 through VS-6 implemented. Doc/spec gap audits remediated in the same slice.

| File | Role |
|------|------|
| [2026-07-09-space-handlers-contract-keys-plan.md](./2026-07-09-space-handlers-contract-keys-plan.md) | Full plan spec |
| [2026-07-09-space-handlers-contract-keys-orchestration.md](./2026-07-09-space-handlers-contract-keys-orchestration.md) | Dev/review loop log + CI gate status |
| `2026-07-09-space-handlers-contract-keys-plan-review-*.md` | Pre-implementation deep reviews |
| [doc-updates/](./doc-updates/) | Post-cutover doc/spec gap audits (all remediated) |

**Shipped:** `handlers.yaml` + `contract_keys`, protocol-only flow manifests, unified `.mrmr/{space,flows,views,dev}` layout, `mrmr step resolve`, split skills (`murrmure-agent` / `murrmure-developer`), briefing removal, Desktop-bundled `mcp-bridge`, Tutorial 1a concept-first path.

**Normative truth:** [current/](../../../current/) — especially [handlers.md](../../../current/bridges/handlers.md), [cli/spec.md](../../../current/cli/spec.md), [desktop/spec.md](../../../current/desktop/spec.md).

**Manual sign-off still open:** per-step handler run E2E, subgraph-owner loop, worker federation E2E.
