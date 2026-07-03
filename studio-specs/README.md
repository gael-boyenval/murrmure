# Murrmure specs

Source of truth for the Murrmure platform: a local-first kernel, hub daemon, web
shell, and the Flow Dev Kit (FDK) for user-authored flows.

Start at the technical index: [current/index.md](./current/index.md).

## Layout

| Layer | Path | Use |
|-------|------|-----|
| **Normative** | [current/](./current/) | What is built and tested. Implementation and tests must match. |
| **Deferred** | [plans/](./plans/) | Design drafts and deferred scope. Not CI-gated. |
| **Historical** | [archives/](./archives/) | Audit trail. Never overrides `current/`. |
| **ADRs** | [ADR/](./ADR/) | Architecture decisions. |

**On conflict, `current/` wins** over `plans/` and `archives/`.

## Published npm packages (v1)

| Package | Role |
|---------|------|
| `@murrmure/cli` | All CLI commands (`mrmr` / `murrmure`), MCP, bundled skill |
| `@murrmure/flow-dev-kit` | Flow project library (React mount, schema, host/server types) |

See [ADR-001](./ADR/ADR-001-murrmure-publish.md) and [archives/plans/npm-publish-v1.md](./archives/plans/npm-publish-v1.md).

## What is in scope (v1)

Local-first platform: kernel, hub, shell, FDK, and the flow surfaces
covered by [current/acceptance.md](./current/acceptance.md) and
[current/build-capability/acceptance.md](./current/build-capability/acceptance.md) —
flow runtime (install → validate → test → apply → live worker), triggers,
same-hub cross-space queries (XS0), and the feature-spec reference flow.

Reference flows `feature-spec` and `review-loop` live under
[`../examples/capabilities/`](../examples/capabilities/). Platform packages
(`packages/`) contain no bundled workflow flows.

## What is deferred

See [plans/README.md](./plans/README.md): hosted cloud shell, cross-space XS1 extensions, and the [post-v2 backlog](./plans/product/plan/index.md) (gate step execution, step outputs, etc.).

## Done when

```bash
pnpm typecheck          # all workspace packages typecheck
pnpm build              # includes @murrmure/cli and @murrmure/flow-dev-kit
pnpm test               # unit + integration (vitest)
pnpm test:acceptance    # hub-daemon + @murrmure/cli
pnpm check:boundaries   # import boundary rules
```

All green, and every in-scope acceptance row has a vitest covering it.

## Smoke checklist (manual)

1. `pnpm dev` starts the hub daemon and web shell.
2. Scaffold a flow: `mrmr flow init demo` → `mrmr flow build` → push to the hub.
3. Install → validate → test → apply; the flow mounts live and its `/health` route responds.
4. The flow canvas loads in the shell iframe from the hub UI blob route.
5. MCP catalog lists the flow's tools for a grant token with its ACL.
