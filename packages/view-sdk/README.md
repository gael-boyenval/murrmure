# @murrmure/view-sdk

Client package for **custom checkpoint views** in `.mrmr/views/`. Published to npm.

## Exports

| Export | Consumer |
|--------|----------|
| `@murrmure/view-sdk` | Shell — `ViewHostFrame`, `attachViewHostBridge` |
| `@murrmure/view-sdk/app` | View apps — `createViewMount`, hooks, submit/cancel |

## Author quick start

```bash
mrmr space view init my-view
cd .mrmr/views/my-view && npm install
```

```tsx
import { createViewMount, useViewContract } from "@murrmure/view-sdk/app";

function App() {
  const { context, ready, submitBranch } = useViewContract();
  if (!ready) return null;
  return (
    <button onClick={() => submitBranch("continue", {})}>
      Continue {context.step.step_id}
    </button>
  );
}

createViewMount({ App });
```

Dev loop: `mrmr view dev my-view` · Ship: `npm run build` → `mrmr space apply`

See [apps/docs/reference/view-sdk.md](../../apps/docs/reference/view-sdk.md) for full protocol and types.
