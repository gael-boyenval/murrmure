# ADR-009 — Space-owned view resolvers and hardened host-only View execution

**Status:** Accepted
**Date:** 2026-07-14
**Owners:** Contracts, Hub core, View SDK, Shell
**Task:** [Tutorial v3 Task 04](../plans/2026-07-14-tutorial-v3-build-tasks/04-intake-view.md)

## Context

ADR-007 made step contracts resolver-agnostic: a step carries no `role`,
`presentation`, or View identity, and an unbound step projects `resolver: null`
while remaining externally resolvable. That left two questions unanswered:

1. **Where does a View identity live?** Earlier shells denormalized `view_ref`
   onto checkpoint steps at apply time and the shell held a View credential
   (`token`) so views could call hub APIs directly. This coupled presentation to
   the flow, leaked a long-lived shell credential into the View iframe, and made
   the shell a second workflow engine that synthesized forms for unbound steps.
2. **How is an embedded View secured?** Views are space-authored HTML/JS loaded
   inside the operator shell. Without a hard boundary, a View could reach hub
   mutation APIs, the network, or parent-frame state.

Both violated the Murrmure ownership boundary: the portable flow must describe
**what** happens; spaces own **how** it is executed and presented; the shell owns
the wire and the host boundary, not business logic or a parallel resolver.

## Decision

1. **Views are bound by the space, not the flow.** A step never carries View
   identity. A space binds a View to a resolver-agnostic step with a
   `view_resolver` handler in `.mrmr/space/handlers.yaml`. The handler owns the
   `view_id`; the flow remains portable.
2. **`on::key` step binding.** Step handlers bind with
   `on: step.opened::{flow_name}.{qualified_step_id}` (or `step.resolved::…`).
   Bare `on: step.opened` is rejected by the strict schema — there is no
   lifecycle-only dispatch. `contract_keys` is retained as **prompt-scope only**
   (which steps a prompt-scoped handler may address), not as the binding key.
3. **`view_resolver` is executor-free.** A `view_resolver` handler carries
   `view_id` and binds `step.opened::…` only; it forbids `command`, `prompt`,
   `params`, `cwd`, and other executor fields. Authored `kill_on` is removed
   entirely (assignment termination is runtime-owned).
4. **Atomic apply with a binding gate.** `validateHandlerBindings` runs on the
   fully resolved post-apply state and fails apply (preserving the prior index)
   on: duplicate flow names, orphan/stale `on::key` aliases, more than one
   `step.opened` resolver per step, a `view_resolver` not bound to `step.opened`,
   an unknown `view_id`, or a View whose build is missing. Failures use typed
   codes.
5. **Sanitized open-step projection.** Run detail projects an `open_steps[]`
   entry with a sanitized `resolver` (`handler_id`, `type`, and `view_id` only —
   no command, prompt, path, parameter, environment, or secret) and, when a
   `view_resolver` is bound, an inline `view` ref (`view_id`,
   `origin_space_id`, `entry`, `shell_route`). `resolver: null` means no space
   handler is bound. The shell loads the View from this descriptor and performs
   **no client-side handler matching**.
6. **Host-only, hardened View execution.** Views run in a sandboxed iframe
   (`sandbox="allow-scripts"` only) under a restrictive CSP (`default-src
   'none'`, no `connect-src`, no `frame-src`). All communication is
   host-mediated postMessage with a transport version and a per-mount nonce;
   the host verifies source window, version, nonce, and origin on every
   message. The host rejects external View entry URLs. Views receive no hub
   credential and must not call hub APIs directly.
7. **No built-in fallback forms.** The shell synthesizes no form or fallback
   control. A bound `view_resolver` opens its View; an unbound step is
   observability-only (state visible, externally resolvable by an authorized
   client). `ViewParamForm`, built-in View routes, and the legacy
   resolve-step adapter are removed.
8. **View SDK v3 contract.** `ViewAppContext` drops `token`/`gate` and adds
   `mode` (`production` | `dev`), `transport_version`, `nonce`, and
   `step.branches`. Authors use `useViewContract` / `submitBranch(branch,
   params)` / `cancel()`; the host ACKs each intent. Dev mode exercises the
   canonical context and validation path and logs non-mutating intents only.

## Consequences

- Flows stay portable: the same flow may run with a View in one space and no
  View (observability-only) in another, with binding explicit in each space.
- The shell is a host and an observer, not a resolver: it never holds a View
  credential, never synthesizes controls, and never matches handlers.
- A compromised or buggy View cannot reach hub mutation APIs, the network, or
  parent-frame state; it can only signal branch/cancel intent to the host.
- Invalid View references (unknown id, unbuilt View, `view_resolver` on
  `step.resolved`) cannot partially replace the applied index — apply is atomic.
- Existing handlers using `on: step.opened`, `kill_on`, or executor fields on a
  View resolver fail strict apply with a named code and no fallback; authors
  migrate to `on::key` and `view_resolver`.

## Enforcement

- `HandlerSpecSchema` is a discriminated union; `HandlerOnStepSchema` is
  `^step\.(opened|resolved)::.+$`. Bare `step.opened`, `kill_on`, and unknown
  executor fields on `view_resolver` fail validation.
- `parseHandlerStepBinding` indexes handlers by `on::key` alias;
  `validateHandlerBindings` enforces alias resolution, `step.opened` resolver
  exclusivity, and `view_resolver` rules on the post-apply state.
- `buildOpenStepProjections` emits the sanitized `resolver` and conditional
  `view` ref; a contract test proves no command/prompt/secret leaks.
- `ViewHostFrame` enforces `sandbox="allow-scripts"` + CSP;
  `attachViewHostBridge` and `isTrustedViewContextMessage` enforce source,
  origin, version, and nonce; `resolveViewEntryUrl` rejects external URLs.
- Shell `shouldShowStepCanvas` is true only for a bound `view_resolver` with a
  `view` ref; absence-of-fallback-form and observability-only-state suites guard
  the unbound path.
- The Tutorial v3 contract, HTTP, View SDK, and shell suites prove strict-apply
  atomicity, projection, host hardening, and the absence of built-in forms.

## References

- [ADR-007 — Resolver-agnostic step contracts](./ADR-007-resolver-agnostic-step-contracts.md)
- [ADR-005 — Tutorial v3 contract ownership](./ADR-005-tutorial-v3-contract-ownership.md)
- [Bridge — Space handlers & contract keys](../current/bridges/handlers.md)
- [View SDK reference](../../../apps/docs/reference/view-sdk.md)
- [Tutorial v3 Task 04](../plans/2026-07-14-tutorial-v3-build-tasks/04-intake-view.md)
