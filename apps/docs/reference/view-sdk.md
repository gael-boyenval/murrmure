# View SDK (`@murrmure/view-sdk`)

Client package for **custom checkpoint views** in `murrmure/views/`. Published to npm as `@murrmure/view-sdk`.

Views are **not hub entities** — the hub denormalizes `view_ref` onto checkpoint steps at `mrmr space apply`. At a pending checkpoint, **ViewCanvasHost** loads the view in the full primary canvas; the shell sends `ViewAppContext` via postMessage and maps submit to `{ disposition, output }` at resolve time.

## Install

```bash
npm install @murrmure/view-sdk
```

Scaffold a view package in your space:

```bash
mrmr space view init preview-review
cd murrmure/views/preview-review && npm install
```

## Exports

| Export | Consumer | Role |
|--------|----------|------|
| `@murrmure/view-sdk` | Shell (`shell-web`) | `ViewHostFrame`, `attachViewHostBridge`, `resolveViewEntryUrl` |
| `@murrmure/view-sdk/app` | View apps in `murrmure/views/*/src/` | `createViewMount`, `ViewProvider`, context hooks, submit/cancel |

## Author surface (`./app`)

```tsx
import { createViewMount, useViewContext, useViewSubmit } from "@murrmure/view-sdk/app";

function App() {
  const ctx = useViewContext();
  const { submit, cancel } = useViewSubmit();

  return (
    <button type="button" onClick={() => submit({ outcome: "validated" })}>
      Approve {ctx.gate?.step_id}
    </button>
  );
}

createViewMount({ App });
```

### API

| Symbol | Role |
|--------|------|
| `createViewMount({ App, boundary? })` | Mount to `#root`; listen for `murrmure.view.context`; post `murrmure.view.ready` |
| `ViewProvider` | Internal — wraps app with context + hub client |
| `useViewContext()` | Full `ViewAppContext` from shell |
| `useViewHubClient()` | `@murrmure/shell-client` instance (read APIs only) |
| `useViewSubmit()` | `{ submit(params), cancel() }` → postMessage to shell |
| `ViewErrorBoundary` | Optional error UI (used by default in `createViewMount`) |

### ViewAppContext

All checkpoint mounts (step 0 and mid-run) share one shape:

```typescript
interface ViewAppContext {
  flow_id: string;
  space_id: string;
  hub_base_url: string;
  token: string;           // read-only shell token
  session_id?: string;
  run_id?: string;
  gate?: {
    gate_id: string;
    step_id: string;
    payload_ref?: string;
    responseSchema?: ResponseSchema;  // optional hint — not a form mandate
  };
  steps?: Record<string, { output?: Record<string, unknown>; status?: string }>;
  input?: Record<string, unknown>;
}
```

**Security:** views must use read-only hub APIs. They must **not** call orchestration mutation APIs (attach, apply, grant mint, gate resolve).

## Host protocol (postMessage)

| Direction | Message | Purpose |
|-----------|---------|---------|
| Host → view | `{ type: "murrmure.view.context", context }` | Checkpoint context |
| View → host | `{ type: "murrmure.view.ready" }` | View mounted |
| View → host | `{ type: "murrmure.view.submit", params }` | Human done — **free shape** |
| View → host | `{ type: "murrmure.view.cancel" }` | Human dismissed |

Example submit payloads:

```typescript
submit({ outcome: "validated" });
submit({ outcome: "changes_required", comments: [{ text: "Fix header" }] });
```

The shell maps submit → `{ disposition, output }` at resolve time (phase 05).

## Dev loop

Design against fixture context without a real run:

```bash
mrmr view dev preview-review
mrmr view dev preview-review --fixture gate-round-2
```

- CLI starts the author's `npm run dev` (Vite) subprocess
- Fixture files under `dev/fixtures/*.json` are full `ViewAppContext` snapshots
- Submit in dev mode logs only — no real gate resolve until a production run
- Open Desktop route: `/spaces/{space_id}/dev/views/{view_id}` (after `mrmr view dev`)
- Ship path: `npm run build` → `mrmr space apply`

## Shell helper (host side)

```tsx
import { ViewHostFrame } from "@murrmure/view-sdk";

<ViewHostFrame
  src={entryUrl}
  context={viewAppContext}
  onSubmit={(params) => resolveCheckpoint(params)}
  onCancel={() => closeCanvas()}
/>
```

## Entry URL resolution

Relative `entry` paths in `view.manifest.yaml` resolve to hub-served assets:

```http
GET /v1/spaces/{space_id}/views/{view_id}/{path}
```

Requires the space to be linked with a filesystem root (`mrmr space link`).

## Fallback

If a checkpoint references a view but `dist/` is missing at apply time, apply warns (or `--strict` fails). At run time the shell may fall back to a built-in form — **not** the primary path when a custom view is expected.

## Related

- [Shell client](./shell-client) — read-only HTTP from views
- [Space index](../guide/space-index) — `murrmure/views/` layout
- [Known gaps](../guide/known-gaps) — engine/checkpoint gaps (B1–B4)
