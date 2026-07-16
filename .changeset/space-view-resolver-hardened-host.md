---
"@murrmure/contracts": minor
"@murrmure/view-sdk": minor
"@murrmure/shell-client": minor
"@murrmure/cli": minor
---

Space-owned view resolvers, hardened host, no built-in fallback forms

Tutorial v3 Task 04 ships the space-owned View binding and hardened host
boundary. Operator-visible changes:

### `@murrmure/contracts` (breaking)

- Handler authoring moves to `on: step.opened::{flow_name}.{qualified_step_id}`
  (and `step.resolved::…`). Bare `on: step.opened` is rejected by the strict
  `HandlerSpecSchema`; `contract_keys` is now **prompt-scope only**, not the
  binding key.
- New `view_resolver` handler type. It binds `step.opened::…` only, carries a
  `view` (`view_id`), and forbids executor fields (`command`, `prompt`,
  `params`, `cwd`).
- Authored `kill_on` is removed and rejected; assignment termination is
  runtime-owned.
- `OpenStepResolverProjection` now carries a sanitized `resolver`
  (`handler_id`, `type`, `view_id?` — no command/prompt/secret) and, when a
  `view_resolver` is bound, an inline `view` ref (`view_id`,
  `origin_space_id`, `entry`, `shell_route`). `resolver: null` means unbound.
- `SpaceIndexSnapshot` adds `views: IndexedResourceRow[]`; apply indexes Views.

### `@murrmure/view-sdk` (breaking)

- `ViewAppContext` drops `token` and `gate`; adds `mode` (`production` | `dev`),
  `transport_version`, `nonce`, and `step.branches`.
- New contract: `useViewContract`, `submitBranch(branch, params)`, `cancel()`,
  `validateBranchResolve`, `ViewContractError`, `isViewContractError`.
- postMessage is versioned and nonce-bound; the host ACKs `submit_branch` /
  `cancel`. Removed `useViewSubmit`, `useViewHubClient`, and `resolve-step`.
- `ViewHostFrame` hardens the iframe: `sandbox="allow-scripts"` + restrictive
  CSP; `resolveViewEntryUrl` rejects external View URLs.

### `@murrmure/shell-client` (breaking)

- `RunDetailPayload.open_steps` matches the v3 projection: sanitized `resolver`,
  optional `view` ref, and `artifact_slots` on branches.

### `@murrmure/cli`

- `mrmr space apply` runs `validateHandlerBindings` atomically on the post-apply
  state (typed codes: `DUPLICATE_FLOW_NAME`, `HANDLER_ORPHAN_ALIAS`,
  `HANDLER_RESOLVER_CONFLICT`, `VIEW_RESOLVER_NOT_OPENED`,
  `VIEW_RESOLVER_VIEW_NOT_FOUND`, `VIEW_RESOLVER_BUILD_MISSING`); the prior
  index is preserved on failure.
- `HANDLER_MISSING` is removed — an unbound step is valid and observability-only.
- Vite React view scaffold and fixtures migrated to the v3 SDK contract.

### Shell (operator UX)

- The shell consumes the inline resolver/view descriptor and performs no
  client-side handler matching. Built-in fallback forms (`ViewParamForm`,
  built-in View routes, the resolve-step adapter) are removed. Unbound steps
  render an observability-only state.

### Docs

- [ADR-009](../studio-specs/ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md),
  `studio-specs/current/bridges/handlers.md`, `apps/docs/reference/view-sdk.md`,
  and `apps/docs/guide/space-handlers.md` synced.
