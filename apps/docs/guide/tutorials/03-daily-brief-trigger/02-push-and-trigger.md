# Part 2 — Build view, hooks, apply

Create the checkpoint view, wire the event hook, and index the space.

## 1) Create the view

```bash
mrmr space view init daily-brief
cd murrmure/views/daily-brief
npm install
```

Implement `src/App.tsx` with two modes based on checkpoint step:

```tsx
import { useViewContext, useViewSubmit } from "@murrmure/view-sdk/app";

export function App() {
  const ctx = useViewContext();
  const { submit, cancel } = useViewSubmit();
  const stepId = ctx.step?.id;

  if (stepId === "trigger") {
    return (
      <main style={{ fontFamily: "system-ui", padding: "1.5rem" }}>
        <h1>Daily brief</h1>
        <button type="button" onClick={() => submit({ requested: true })}>
          Run daily brief
        </button>
        <button type="button" onClick={() => cancel()}>Cancel</button>
      </main>
    );
  }

  // review step — show output from agent / done step preview
  const body = ctx.steps?.agent?.output?.body ?? "(waiting for agent…)";

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem" }}>
      <h1>Review daily brief</h1>
      <pre>{typeof body === "string" ? body : JSON.stringify(body, null, 2)}</pre>
      <button type="button" onClick={() => submit({ approved: true })}>Mark done</button>
      <button type="button" onClick={() => cancel()}>Cancel</button>
    </main>
  );
}
```

View submit on **trigger** resolves the checkpoint. The hub emits **`brief.requested`** when your flow/skill declares that event mapping (indexed via hooks below).

Dev loop:

```bash
mrmr view dev daily-brief
```

Production build (required for strict apply):

```bash
npm run build
cd ../../..
```

## 2) Hooks

`murrmure/hooks.yaml`:

```yaml
version: 1
hooks:
  brief_requested_wake:
    on:
      event:
        type: brief.requested
    do:
      - invoke:
          action: mcp_wake
          params:
            wake_label: handle_brief_requested
```

After apply, when the trigger checkpoint resolves and the hub emits `brief.requested`, the hook runs **`mcp_wake`** — delivering **`handle_brief_requested`** to listening agents.

## 3) Link and apply

```bash
mrmr space link --path . --space spc_daily_brief
mrmr space apply --strict
mrmr space status --space spc_daily_brief
```

Confirm:

- Flow **`daily-brief`**
- View **`daily-brief`** indexed
- Hook **`brief_requested_wake`**

## Next

[Part 3 — Connect agent →](./03-connect-agent)
