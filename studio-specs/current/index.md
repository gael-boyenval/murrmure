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

## Flow platform

| Domain | Spec | Bridge | Fixtures |
|--------|------|--------|----------|
| Flow runtime | [flow-runtime/spec.md](./flow-runtime/spec.md) | [bridges/flow-runtime.md](./bridges/flow-runtime.md) | [fixtures/flow-runtime/](./fixtures/flow-runtime/) |
| Triggers | [triggers/spec.md](./triggers/spec.md) | [bridges/triggers.md](./bridges/triggers.md) | [fixtures/triggers/](./fixtures/triggers/) |
| Cross-space (XS0) | [cross-space/spec.md](./cross-space/spec.md) | [bridges/cross-space.md](./bridges/cross-space.md) · [bridges/federation.md](./bridges/federation.md) | [fixtures/cross-space/](./fixtures/cross-space/) |

Runnable reference flows live in the repo at
[`test-utils/spaces/`](../../test-utils/spaces/) — strict-apply fixtures for CI and manual smoke; not linked from `apps/docs/`.

## Doc types

- `*/spec.md` — scope, invariants, state machines, HTTP↔hub command mapping, MCP shapes, denial codes, acceptance.
- `bridges/*.md` — implementer wire map: HTTP→command tables, MCP JSON-RPC examples, daemon interfaces, package/file paths.
- `fixtures/**/*.json` — golden HTTP/MCP sequences with expected journal/denial shapes, used as integration test inputs.

## Acceptance

Merged definition of done: [acceptance.md](./acceptance.md). Every in-scope row
must have a vitest covering it.
