# View SDK (`@murrmure/view-sdk`)

Client package for **custom step views** in `.mrmr/views/`. Published to npm as `@murrmure/view-sdk`.

Views are **not hub entities** and **not flow entities**. A space binds a View to
a resolver-agnostic step with a `view_resolver` handler in
`.mrmr/space/handlers.yaml`; the View identity (`view_id`) lives in the space, never
in the flow. At apply time the hub indexes the View and, at run time, projects an
inline `view` ref onto the open step. The shell loads the locally built View in a
**hardened iframe host**, sends `ViewAppContext` via postMessage, and mediates
branch/cancel intent back to the hub at resolve time. Views receive **no hub
credential** and must not call hub APIs directly.

See [ADR-009](../../../studio-specs/ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md)
for the ownership and host-boundary decision.

## Install

```bash
npm install @murrmure/view-sdk
```

Scaffold a view package in your space:

```bash
mrmr space view init preview-review-intake
cd .mrmr/views/preview-review-intake && npm install
```

## Binding a View to a step

In `.mrmr/space/handlers.yaml`:

```yaml
handlers:
  - id: intake_view
    on: step.opened::preview-review.intake
    type: view_resolver
    view: preview-review-intake
```

`view_resolver` binds `step.opened::{flow_name}.{step_id}` only and carries no
executor fields. Apply validates the `view_id` and its build atomically; an
unknown or unbuilt View fails apply and preserves the prior index.

## Exports

| Export | Consumer | Role |
|--------|----------|------|
| `@murrmure/view-sdk` | Shell (`shell-web`) | `ViewHostFrame`, `attachViewHostBridge`, `resolveViewEntryUrl` |
| `@murrmure/view-sdk/app` | View apps in `.mrmr/views/*/src/` | `createViewMount`, `ViewProvider`, `useViewContract`, `submitBranch`, `cancel` |

## Author surface (`./app`)

```tsx
import { createViewMount, useViewContract } from "@murrmure/view-sdk/app";

function App() {
  const { context, ready, submitBranch, cancel, submission } = useViewContract();
  if (!ready) return null;

  return (
    <>
      <button onClick={() => submitBranch("continue", { files: { spec } })}>
        Submit {context.step.step_id}
      </button>
      {submission.status === "uploading" ? (
        <>
          <progress value={submission.uploadedBytes} max={submission.totalBytes} />
          <button onClick={submission.cancel}>Cancel upload</button>
        </>
      ) : null}
    </>
  );
}

createViewMount({ App });
```

### API

| Symbol | Role |
|--------|------|
| `createViewMount({ App, boundary? })` | Mount to `#root`; subscribe for context; post `murrmure.view.ready` |
| `ViewProvider` | Internal — wraps app with context |
| `useViewContract()` | `{ context, ready, branches, validate, submitBranch, cancel, submission }` |
| `submitBranch(context, branch, { payload?, files? })` | Post browser files to the trusted host; await resolve result |
| `cancel(context)` | Resolve the workflow `cancel` branch; this is not upload cancellation |
| `submission.cancel()` | Abort the active pre-commit upload; temporary bytes are removed and the step stays open |
| `validateBranchResolve(context, branch, input)` | Fast iframe preflight; the trusted host and Hub perform full validation |
| `isViewContractError(e)` / `ViewContractError` | Typed submission error |
| `ViewErrorBoundary` | Optional error UI (used by default in `createViewMount`) |

### ViewAppContext

All step mounts share one shape. There is **no `token`** and **no `gate`**.

```typescript
interface ViewAppContext {
  flow_id: string;
  space_id: string;
  hub_base_url: string;
  mode: "production" | "dev";
  transport_version: number;   // postMessage envelope version
  nonce: string;               // per-mount nonce bound to every message
  session_id?: string;
  run_id?: string;
  step: {
    step_id: string;
    branches: ViewBranchContract[];   // complete selected-branch contracts
  };
  steps?: Record<string, { output?: Record<string, unknown>; status?: string }>;
  input?: Record<string, unknown>;
}
```

**Security:** views receive no hub credential and run sandboxed. They must not
attempt hub API calls or parent-frame access; all interaction is host-mediated
postMessage.

## Host protocol (postMessage)

Every message carries an envelope `{ v, nonce }` bound to the mount. The host
verifies source window, origin, transport version, and nonce on every message.

| Direction | Message | Purpose |
|-----------|---------|---------|
| Host → view | `murrmure.view.context` (with envelope) | Step context |
| View → host | `murrmure.view.ready` | View mounted |
| View → host | `murrmure.view.submit_branch` `{ submission_id, branch, input }` | Validate, upload, and resolve |
| View → host | `murrmure.view.cancel_submission` `{ submission_id }` | Abort pre-commit submission |
| View → host | `murrmure.view.cancel` | Human dismissed |
| View → host | `murrmure.view.resolved` | View observed resolution |
| Host → view | `murrmure.view.ack` `{ ok }` | Acknowledge submit/cancel |
| Host → view | `murrmure.view.submission` | Monotonic validating/uploading/resolving progress |

`submitBranch`/`cancel` resolve when the host ACKs `{ ok: true }` and reject
with `ViewContractError` on `{ ok: false }`.

`ViewContractError.errors` is the transport-neutral
`CONTRACT_VALIDATION_FAILED` array: `{ source, path, rule, message }`, where
`path` is an RFC 6901 JSON Pointer. Content, credentials, validator internals,
and host paths are never exposed.

Production submission is host-only: the iframe sends `File`/`Blob` objects,
while the shell privately obtains Hub upload intents and streams bytes. Intent
IDs and Hub credentials never cross into the iframe. Dev mode runs the same
contract checks and reports a sanitized, non-mutating intent locally; it makes
no upload or resolve request.

## Dev loop

Design against fixture context without a real run:

```bash
mrmr view dev preview-review-intake
mrmr view dev preview-review-intake --fixture intake
```

- CLI starts the author's `npm run dev` (Vite) subprocess.
- Fixture files under `dev/fixtures/*.json` are full `ViewAppContext` snapshots
  (`mode: "dev"`, with `step.branches`).
- Submit/cancel in dev mode logs non-mutating intents only — no real resolve
  until a production run.
- Open Desktop route: `/spaces/{space_id}/dev/views/{view_id}` (after
  `mrmr view dev`).
- Ship path: `npm run build` → `mrmr space apply`.

## Shell helper (host side)

```tsx
import { ViewHostFrame } from "@murrmure/view-sdk";

<ViewHostFrame
  src={entryUrl}
  context={viewAppContext}
  onSubmitBranch={async (branch, input, submission) =>
    uploadAndResolve(branch, input, submission)
  }
  onCancelSubmission={cancelUpload}
  onCancel={async () => closeCanvas()}
  onResolved={onResolved}
/>
```

`ViewHostFrame` renders the iframe with `sandbox="allow-scripts"` and a
restrictive CSP (`default-src 'none'`, no `connect-src`, no `frame-src`).
External View entry URLs are rejected.

## Entry URL resolution

Relative `entry` paths in `view.manifest.yaml` resolve to hub-served assets:

```http
GET /v1/spaces/{space_id}/views/{view_id}/{path}
```

Requires the space to be linked with a filesystem root (`mrmr space link`).

## Unbound steps

A step with no `view_resolver` is valid and externally resolvable. Its
projection carries `resolver: null` and no `view` ref. The shell renders an
**observability-only** state for it — no built-in form or fallback control is
synthesized. An authorized protocol client resolves the step externally.

## Related

- [Space handlers guide](../guide/space-handlers.md) — `view_resolver` binding
- [Space index](../guide/space-index) — `.mrmr/views/` layout
- [ADR-009 — Space-owned view resolvers and hardened host](../../../studio-specs/ADR/ADR-009-space-owned-view-resolver-and-hardened-host.md)
- [Known gaps](../guide/known-gaps) — engine/checkpoint gaps
