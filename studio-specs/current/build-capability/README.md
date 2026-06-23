# Build capability — local-first user workflows

**Status:** normative (2026-06-21)  
**Scope:** How teams author, store, and load **user-created** capabilities on their machine — **not** in the Studio platform repo.

Supersedes bundled-catalog install for new work — see [archives/superseded/bundled-catalog-migration.md](../../archives/superseded/bundled-catalog-migration.md).

| Doc | Purpose |
|-----|---------|
| [**cdk.md**](./cdk.md) | **Kit definition** — Capability Developer Kit (in/out, tiers) |
| [01-local-layout.md](./01-local-layout.md) | Filesystem layout on user machine + user project |
| [02-sdk.md](./02-sdk.md) | `@studio/capability-sdk` — CLI, validate, build, push |
| [03-shell-host.md](./03-shell-host.md) | Platform shell vs user UI (iframe host) |
| [04-hub-ingest.md](./04-hub-ingest.md) | Hub ingest, worker mount, live apply |
| [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md) | Manifest v1, bundle tree, digest |
| [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md) | Install v2, CLI↔HTTP map |
| [07-mcp-tool-model-and-catalog-rebuild.md](./07-mcp-tool-model-and-catalog-rebuild.md) | MCP tools from bundle |
| [08-auth-profiles-local-cloud-ci.md](./08-auth-profiles-local-cloud-ci.md) | Auth profiles |
| [09-security-execution-boundaries.md](./09-security-execution-boundaries.md) | Worker + iframe isolation |
| [10-routing-collision-and-canvas-resolution.md](./10-routing-collision-and-canvas-resolution.md) | Route rules |
| [11-dev-loop-reload-protocol.md](./11-dev-loop-reload-protocol.md) | `dev` watch + reload + `dev --sim` |
| [12-worker-runtime-and-host-bridge.md](./12-worker-runtime-and-host-bridge.md) | Worker runtime, router, host-bridge debundle contract |
| [13-conformance-fixtures-matrix.md](./13-conformance-fixtures-matrix.md) | Fixture cross-index |
| [15-agent-skill-package.md](./15-agent-skill-package.md) | `@studio/skill` — Cursor agent skill install |
| [acceptance.md](./acceptance.md) | Definition of done |

Historical execution plans and reviews moved to [archives/execution/](../../archives/execution/) and [archives/reviews/](../../archives/reviews/).

**User-facing tutorial:** [`apps/docs/guide/capabilities-tutorial.md`](../../../apps/docs/guide/capabilities-tutorial.md) (VitePress site: `/guide/capabilities-tutorial`).

## One-line goal

A builder scaffolds a capability in **their project**, artifacts live under **`~/.studio/`** (or hub blob store after push), and the Studio shell renders **only** Configure + thin runtime chrome — **all workflow UI comes from the user's bundle**.

## Non-goals

- Bundled / marketplace capability catalog in the platform repo
- Shipping reference workflow UI as part of `@murrmure/shell-web` (use CDK bundles in iframe)
- Visual contract graph editor in Configure v1
