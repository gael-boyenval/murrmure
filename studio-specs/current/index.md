# Murrmure — technical specification index (current)

Entry point: [../README.md](../README.md). This index lists the **normative**
specs. Deferred scope is in [../plans/README.md](../plans/README.md); historical
docs are in [../archives/README.md](../archives/README.md). On conflict,
`current/` wins.

## Doc precedence (within current/)

`*/spec.md` (normative behavior) → `bridges/` (wire map) → `fixtures/` (golden examples).

## Product surfaces

| Surface | Spec |
|---------|------|
| **Murrmure Desktop** | [desktop/spec.md](./desktop/spec.md) |
| **CLI (`mrmr`)** | [cli/spec.md](./cli/spec.md) |
| **Observer shell** (Desktop webview) | [shell/spec.md](./shell/spec.md) |

Configure UI and `/setup` wizard are **retired** — archived at [archives/superseded/config-shell-v1.md](../archives/superseded/config-shell-v1.md).

## Platform foundations

| Domain | Spec | Bridge | Fixtures |
|--------|------|--------|----------|
| Kernel | [kernel/spec.md](./kernel/spec.md) | [kernel/packages.md](./kernel/packages.md) | [fixtures/kernel/](./fixtures/kernel/) |
| Hub core | [hub/architecture.md](./hub/architecture.md) | [hub/contracts.md](./hub/contracts.md) | [fixtures/hub/](./fixtures/hub/) |
| Product + review chrome | [product/spec.md](./product/spec.md) · [product/architecture.md](./product/architecture.md) · [philosophy](./product/philosophy.md) | [bridges/product.md](./bridges/product.md) | [fixtures/product/](./fixtures/product/) |
| Space execution (handlers) | [bridges/handlers.md](./bridges/handlers.md) | [step-contract.md](./bridges/step-contract.md) | — |

## Flow platform (Murrmure FDK)

| Domain | Spec | Bridge | Fixtures |
|--------|------|--------|----------|
| Flow runtime | [flow-runtime/spec.md](./flow-runtime/spec.md) | [bridges/flow-runtime.md](./bridges/flow-runtime.md) | [fixtures/flow-runtime/](./fixtures/flow-runtime/) |
| Triggers | [triggers/spec.md](./triggers/spec.md) | [bridges/triggers.md](./bridges/triggers.md) | [fixtures/triggers/](./fixtures/triggers/) |
| Cross-space (XS0) | [cross-space/spec.md](./cross-space/spec.md) | [bridges/cross-space.md](./bridges/cross-space.md) · [bridges/federation.md](./bridges/federation.md) | [fixtures/cross-space/](./fixtures/cross-space/) |
| Feature-spec (reference flow) | [capabilities/feature-spec.md](./capabilities/feature-spec.md) | [bridges/feature-spec.md](./bridges/feature-spec.md) | [fixtures/feature-spec/](./fixtures/feature-spec/) |

## Flow Dev Kit (FDK) — historical

How users **formerly** authored FDK iframe bundles and install HTTP — see
[build-capability/README.md](./build-capability/README.md). **Current path:** `.mrmr/` + `mrmr space apply` ([ADR-004](../ADR/ADR-004-handlers-mrmr-cutover.md)). Published packages:
`@murrmure/cli` + `@murrmure/flow-dev-kit` ([ADR-001](../ADR/ADR-001-murrmure-publish.md)).

Key normative docs:

- [build-capability/cdk.md](./build-capability/cdk.md) — kit definition
- [build-capability/02-sdk.md](./build-capability/02-sdk.md) — CLI + flow-dev-kit
- [build-capability/05-manifest-and-bundle-schema.md](./build-capability/05-manifest-and-bundle-schema.md) — `flow.manifest.json`, bundle + source archives
- [build-capability/06-install-push-apply-http-contract.md](./build-capability/06-install-push-apply-http-contract.md) — legacy install HTTP (404 on shipped hub)
- [build-capability/09-security-execution-boundaries.md](./build-capability/09-security-execution-boundaries.md) — isolation model
- [build-capability/12-worker-runtime-and-host-bridge.md](./build-capability/12-worker-runtime-and-host-bridge.md) — worker runtime, host-bridge
- [build-capability/15-agent-skill-package.md](./build-capability/15-agent-skill-package.md) — `murrmure-flow` Cursor skill (bundled in CLI)
- [build-capability/acceptance.md](./build-capability/acceptance.md) — FDK definition of done

Runnable reference flows live in the repo at
[`examples/flows/`](../../examples/flows/) (or legacy `examples/capabilities/` during migration), not in `packages/`.

## Doc types

- `*/spec.md` — scope, invariants, state machines, HTTP↔hub command mapping, MCP shapes, denial codes, acceptance.
- `bridges/*.md` — implementer wire map: HTTP→command tables, MCP JSON-RPC examples, daemon interfaces, package/file paths.
- `fixtures/**/*.json` — golden HTTP/MCP sequences with expected journal/denial shapes, used as integration test inputs.

## Acceptance

Merged definition of done: [acceptance.md](./acceptance.md) and
[build-capability/acceptance.md](./build-capability/acceptance.md). Every in-scope
row must have a vitest covering it.
