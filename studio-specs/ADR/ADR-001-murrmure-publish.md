# ADR-001: Murrmure v1 npm publish and rebrand

**Status:** accepted (2026-06-23)  
**Plan:** [archives/plans/npm-publish-v1.md](../archives/plans/npm-publish-v1.md)

## Context

Studio capability authoring was split across `@studio/capability-sdk`, `@studio/capability-dev-kit`, `@studio/hub-mcp`, and `@studio/hub-cli`. npm v1 requires a clean Murrmure brand and two published packages only.

## Decision

1. Publish **`@murrmure/cli`** (all commands, MCP, skill assets) and **`@murrmure/flow-dev-kit`** (author library).
2. Rebrand user-facing vocabulary: **flow** replaces capability; **Murrmure** replaces Studio in product/docs.
3. HTTP install wire uses **`/v1/.../flows/...`**; scopes `flow:install`, `flow:configure`.
4. Push ships **runtime bundle + source snapshot** (`bundle.tar.zst`, `source.tar.zst`).
5. Env vars **`MURRMURE_*` only** — no `STUDIO_*` aliases in v1.
6. Monorepo hub packages remain `@studio/*` internally until a follow-up rename.

## Consequences

- Legacy packages (`capability-sdk`, `hub-mcp`, etc.) are deprecated; delete after downstream references are removed.
- `studio-specs/` folder name retained; content updated incrementally toward flow/Murrmure vocabulary.
- Release via changesets; CI pack smoke validates global CLI install + `mrmr flow init`.
