# Studio V2 — developer handoff (copy this directory)

**Start here:** [HANDOFF.md](./HANDOFF.md)

Single directory: technical specs + wire bridges + fixtures + phase 2 build orders.

**Phase 1** (kernel → config + review): reference only — already in codebase.  
**Phase 2** (capability-runtime → cloud): [build/](./build/) — what to implement now.

See also: [technical-index.md](./technical-index.md) · [overview.md](./overview.md)

## Layer stack

```
build-capability/   CDK — user-local capabilities, install v2, worker + iframe (BC0–BC6)
cloud/              Hosted admin, BFF session auth, CI capability push
triggers/           Contract-aware triggers, mcp_wake templates
capabilities/       Reference capabilities (feature-spec)
capability-runtime/ Dynamic mount, grant-scoped MCP, control bus
config/             Configure UI + config HTTP routes
product/            Shell, hub edge, review capability, MCP
hub/                Domain-agnostic hub architecture + wire contracts
kernel/             Business-agnostic FSM engine (@runtime/*)
```

## Dependency graph

```
kernel
  └── hub (architecture + contracts)
        └── product
              ├── config
              └── capability-runtime  ← phase 2 spine
                    ├── capabilities/feature-spec
                    ├── triggers
                    └── cloud (uses CR for live apply)

cross-space  ← parallel after hub federation (S3); extends product MCP
```

## Implement order

### Phase 2 — build now (phase 1 shipped)

1. **capability-runtime** CR0–CR2
2. **feature-spec** FS0–FS2
3. **triggers** TR0–TR1
4. **cross-space** XS0–XS1
5. **cloud** CL0–CL1

### Reference — full stack (historical; do not rebuild phase 1)

kernel R0–R7 → hub S0–S3 → product P0–P5 → config CS0–CS2 → *(phase 2 above)*

## Spec index

| Path | Scope |
|------|--------|
| [build-capability/README.md](./build-capability/README.md) | **CDK** — local user capabilities, install v2, security, acceptance |
| [overview.md](./overview.md) | End-to-end stories, personas, non-goals |
| [kernel/spec.md](./kernel/spec.md) | Hexagonal FSM executor, journal, fan-out, testing |
| [kernel/packages.md](./kernel/packages.md) | `@runtime/*` package layout and build order |
| [hub/architecture.md](./hub/architecture.md) | Hub-core modules, data model, APIs, federation, evolution |
| [hub/contracts.md](./hub/contracts.md) | Wire types, commands, kernel bridge, hub implementation decisions |
| [product/spec.md](./product/spec.md) | Platform HTTP/SSE/MCP, review capability, shell, packages |
| [config/spec.md](./config/spec.md) | Configure UI, config HTTP, grants, evolution pipeline |
| [capability-runtime/spec.md](./capability-runtime/spec.md) | Dynamic mount, MCP catalog, control bus, handshake v2 |
| [capabilities/feature-spec.md](./capabilities/feature-spec.md) | Spec document lifecycle, `spec.published`, MCP/HTTP |
| [triggers/spec.md](./triggers/spec.md) | Event catalog, templates, mcp_wake dispatch |
| [cross-space/spec.md](./cross-space/spec.md) | query_ask / query_answer HTTP + MCP |
| [cloud/spec.md](./cloud/spec.md) | Session auth, BFF proxy, CI push |

## Wire bridges (implementer detail)

| Path | Maps spec → packages / JSON-RPC |
|------|----------------------------------|
| [bridges/capability-runtime.md](./bridges/capability-runtime.md) | MountRegistry, handshake v2, control bus |
| [bridges/feature-spec.md](./bridges/feature-spec.md) | HTTP/MCP → hub instance ops |
| [bridges/triggers.md](./bridges/triggers.md) | Template API, mcp_wake dispatch |
| [bridges/cross-space.md](./bridges/cross-space.md) | query_ask/answer routes |
| [bridges/cloud-shell.md](./bridges/cloud-shell.md) | BFF routes, env, CI push |

Phase 1 bridges: [bridges/product.md](./bridges/product.md), [bridges/config.md](./bridges/config.md).

## Phase 2 build orders

| Path | Purpose |
|------|---------|
| [HANDOFF.md](./HANDOFF.md) | **Dev entry point** |
| [build/README.md](./build/README.md) | Order, done-when, scope |
| [build/01–05-*.md](./build/) | Per-layer why + DoD |
| [build/acceptance.md](./build/acceptance.md) | Fixture checklist |
| [build/journey-traceability.md](./build/journey-traceability.md) | Journey map |

## Fixtures

Golden acceptance scenarios live under [fixtures/](./fixtures/) — one subdirectory per domain. Use these for integration tests and journey validation.

## Source archive

`research/studio/` remains as the research archive (ADRs, impl briefs, hardening reviews). **Implement from this tree.**
