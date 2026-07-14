# Murrmure specs

Source of truth for the Murrmure platform: a local-first kernel, Hub daemon,
Desktop shell, portable flows and Views, and space-owned execution.

Start at the technical index: [current/index.md](./current/index.md).

## Layout

| Layer | Path | Use |
|-------|------|-----|
| **Normative** | [current/](./current/) | What is built and tested. Implementation and tests must match. |
| **Deferred** | [plans/](./plans/) | Design drafts and deferred scope. Not CI-gated. |
| **Historical** | [archives/](./archives/) | Audit trail. Never overrides `current/`. |
| **ADRs** | [ADR/](./ADR/) | Architecture decisions. |

**On conflict, `current/` wins** over `plans/` and `archives/`.

## Public package surfaces

| Package | Role |
|---------|------|
| `@murrmure/cli` | CLI commands (`mrmr`) plus agent and developer skills |
| `@murrmure/mcp-bridge` | Harness-neutral MCP bridge (`murrmure-mcp`) |
| `@murrmure/view-sdk` | Custom View host and app contracts |

See [ADR-001](./ADR/ADR-001-murrmure-publish.md) for the original publication
decision and `current/` for the shipped package contracts.

## What is in scope

Local-first platform: kernel, Hub, Desktop shell, portable flow orchestration,
custom Views, space-owned handlers, triggers, and same-Hub cross-space queries.
The current definition of done is
[current/acceptance.md](./current/acceptance.md).

Strict-apply test spaces and explicit non-shipped Hub fixtures live under
[`../test-utils/`](../test-utils/). Production packages contain no bundled
workflow or demo state.

## What is deferred

See [plans/README.md](./plans/README.md): hosted cloud shell, cross-space XS1 extensions, and the [post-v2 backlog](./plans/product/plan/index.md) (gate step execution, step outputs, etc.).

## Done when

```bash
pnpm typecheck          # all workspace packages typecheck
pnpm build              # build all workspace packages
pnpm test               # unit + integration (vitest)
pnpm test:acceptance    # hub-daemon + @murrmure/cli
pnpm check:boundaries   # import boundary rules
pnpm check:docs-proof   # docs, skills, fixtures, and clean-state guards
```

All green, and every in-scope acceptance row has a vitest covering it.

## Smoke checklist (manual)

1. Launch Desktop with fresh user data and confirm the space list is empty.
2. In a project directory, run `mrmr setup` and confirm one display name and
   editable slug.
3. Verify `.mrmr/space/space.yaml`, the local link, and Hub state use that
   confirmed identity while the Hub-assigned `spc_*` ID remains opaque.
4. Add a flow under `.mrmr/flows/`, run `mrmr space apply --strict`, and start
   it from Desktop.
5. Confirm custom View presentation and any space-owned handlers execute through
   their current protocol contracts.
