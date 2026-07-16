# Part 2 — Build view, handlers, apply

Create the presentation view, verify handlers, and index the space.

## 1) Create the view

```bash
mrmr space view init daily-brief
cd .mrmr/views/daily-brief
npm install
```

Implement `src/App.tsx` with two modes based on step id:

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

View submit on **trigger** calls `murrmure_resolve_step` with branch `continue`. The hub emits **`brief.requested`** when your flow declares that event mapping (indexed via handlers below).

Dev loop:

```bash
mrmr view dev daily-brief
```

Production build (required for strict apply):

```bash
npm run build
cd ../../..
```

## 2) Verify handlers

Confirm `.mrmr/space/handlers.yaml` includes the event handler from Part 1:

```yaml
  - id: brief-requested-wake
    contract_keys: []
    on:
      event:
        type: brief.requested
    type: shell_spawn
    complete: auto
    command: echo '{"wake":"handle_brief_requested"}'
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 30000
```

After apply, when the trigger step resolves and the hub emits `brief.requested`, the handler runs **`shell_spawn`** — delivering **`handle_brief_requested`** to listening agents.

Use `murrmure_list_emittable_events` when authoring custom events.

## 3) Link and apply

```bash
mrmr space link --path . --space spc_daily_brief
mrmr space apply --strict
mrmr space status --space spc_daily_brief
```

Confirm:

- Flow **`daily-brief`**
- View **`daily-brief`** indexed with built `dist/`
- Handlers **`daily-brief-agent`**, **`daily-brief-done`**, **`brief-requested-wake`**

## Next

[Part 3 — Connect agent →](./03-connect-agent)
