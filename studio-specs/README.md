# Studio specs

Source of truth for the Studio platform: a local-first kernel, hub daemon, web
shell, and the Capability Developer Kit (CDK) for user-authored capabilities.

Start at the technical index: [current/index.md](./current/index.md).

## Layout

| Layer | Path | Use |
|-------|------|-----|
| **Normative** | [current/](./current/) | What is built and tested. Implementation and tests must match. |
| **Deferred** | [plans/](./plans/) | Design drafts and deferred scope. Not CI-gated. |
| **Historical** | [archives/](./archives/) | Audit trail. Never overrides `current/`. |

**On conflict, `current/` wins** over `plans/` and `archives/`.

## What is in scope (v1)

Local-first platform: kernel, hub, shell, CDK, and the capability surfaces
covered by [current/acceptance.md](./current/acceptance.md) and
[current/build-capability/acceptance.md](./current/build-capability/acceptance.md) —
capability runtime (install → validate → test → apply → live worker), triggers,
same-hub cross-space queries (XS0), and the feature-spec reference capability.

The reference capabilities `feature-spec` and `review-loop` ship as runnable CDK
examples under [`../examples/capabilities/`](../examples/capabilities/). The
platform packages (`packages/`) contain no bundled workflow capabilities.

## What is deferred

See [plans/README.md](./plans/README.md): hosted cloud shell, cross-space XS1
(federation + policy editor), and the worker host-bridge needed to fully move the
reference capabilities out-of-process (contract specified in
[current/build-capability/12-worker-runtime-and-host-bridge.md](./current/build-capability/12-worker-runtime-and-host-bridge.md)).

## Done when

```bash
pnpm typecheck          # all workspace packages typecheck
pnpm test               # unit + integration (vitest)
pnpm test:acceptance    # current/**/acceptance.md fixtures
pnpm check:boundaries   # import boundary rules
```

All four green, and every in-scope acceptance row has a vitest covering it.

## Smoke checklist (manual)

1. `pnpm dev` starts the hub daemon and web shell.
2. Scaffold a capability: `studio capability init demo` → `build` → push to the hub.
3. Install → validate → test → apply; the capability mounts live and its
   `/health` route responds through the hub.
4. The capability canvas loads in the shell iframe from the hub UI blob route.
5. MCP catalog lists the capability's tools for a grant token with its ACL.
