# @murrmure/view-sdk

Client package for **custom checkpoint views** in `murrmure/views/`. Published to npm.

## Exports

| Export | Consumer |
|--------|----------|
| `@murrmure/view-sdk` | Shell — `ViewHostFrame`, `attachViewHostBridge` |
| `@murrmure/view-sdk/app` | View apps — `createViewMount`, hooks, submit/cancel |

## Author quick start

```bash
mrmr space view init my-view
cd murrmure/views/my-view && npm install
```

```tsx
import { createViewMount, useViewContext, useViewSubmit } from "@murrmure/view-sdk/app";

function App() {
  const ctx = useViewContext();
  const { submit } = useViewSubmit();
  return <button onClick={() => submit({ outcome: "validated" })}>{ctx.gate?.step_id}</button>;
}

createViewMount({ App });
```

Dev loop: `mrmr view dev my-view` · Ship: `npm run build` → `mrmr space apply`

See [apps/docs/reference/view-sdk.md](../../apps/docs/reference/view-sdk.md) for full protocol and types.
