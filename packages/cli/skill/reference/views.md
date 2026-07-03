# Custom views (checkpoint steps)

Murrmure v2 views are **clients** that read protocol APIs — not hub entities. Human UX lives on **checkpoint steps** (`steps[].checkpoint.view`), not on trigger blocks.

**North star:** custom views fill **ViewCanvasHost** (full primary canvas). Shell chrome and built-in forms are admin/fallback only.

## Space layout

```text
murrmure/
  flows/my-flow/flow.manifest.yaml   # steps[].checkpoint.view: preview-review
  views/preview-review/
    view.manifest.yaml
    package.json                       # scripts.dev + scripts.build (required)
    dev/fixtures/                      # simulated ViewAppContext for mrmr view dev
    src/main.tsx                       # createViewMount({ App })
    dist/                              # required before apply
```

## Flow manifest (checkpoint)

```yaml
triggers:
  manual: true
steps:
  - id: review
    checkpoint:
      view: preview-review
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
```

On `mrmr space apply`, the hub parses the view manifest and denormalizes `view_ref` onto the flow index.

## Author workflow

| Phase | Commands |
|-------|----------|
| Scaffold | `mrmr space view init <id>` |
| Design | `mrmr view dev <id>` (fixtures under `dev/fixtures/`) |
| Ship | `npm run build` → `mrmr space apply` |
| Validate | Run flow in Desktop — real exec_context, no fixtures |

Legacy `mrmr view init` redirects to `mrmr space view init` (exit 1).

## view-sdk/app

```tsx
import { createViewMount, useViewContext, useViewSubmit } from "@murrmure/view-sdk/app";

function App() {
  const ctx = useViewContext();
  const { submit } = useViewSubmit();
  return (
    <button type="button" onClick={() => submit({ outcome: "validated" })}>
      Approve {ctx.gate?.step_id}
    </button>
  );
}

createViewMount({ App });
```

Install in the view package:

```json
{ "dependencies": { "@murrmure/view-sdk": "^0.1.0" } }
```

## Dev fixtures

Each `dev/fixtures/*.json` file is a complete `ViewAppContext` (same shape the shell sends via `murrmure.view.context`). Tab label = filename without `.json`.

Submit in dev mode **logs only** — no hub resolve until a real run.

## Shell integration

1. Engine pauses at checkpoint → shell mounts **ViewCanvasHost** with view bundle
2. Shell posts `murrmure.view.context` to iframe
3. View calls `submit(params)` → shell maps to `{ disposition, output }` → resolve API

Built-in `GateResolvePanel` is fallback when the view bundle is missing — not the primary path.

Legacy `mrmr view init` redirects to `mrmr space view init` (exit 1). Inside `murrmure/`, `mrmr flow init` redirects to `mrmr space flow init`.
