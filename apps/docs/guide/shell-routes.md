# Shell UI (inside Desktop)

The observer shell is the UI inside **Murrmure Desktop** — not a standalone browser app.

**North star:** checkpoint steps with `view_ref` render in **ViewCanvasHost** (full primary-region custom UI). Routes below labeled **admin/operator mode** are for observe, debug, and grants — not the primary human path when a view is specified.

## Routes

| Route | Purpose |
|-------|---------|
| **`/spaces/new`** | First-run space creation and linking |
| **`/spaces/:spaceId`** | Space home — sessions, flows, gates (**admin**) |
| **`/spaces/:spaceId/flows/:flowId`** | Flow preview (**admin**) |
| **`/sessions/:sessionId`** | Session orchestration — run graph, gate panel (**admin**) |
| **`/runs/:runId`** | Run detail — graph, gates, retry (**admin**) |
| **`/notifications`** | Notification inbox (**admin**) |
| **`/logs`** | Journal / log explorer (**admin**) |
| **`/connect`** | Contributor debugging — paste hub URL + token |

Legacy **`/configure`** and **`/setup`** redirect to **`/spaces/new`**.

## ViewCanvasHost (primary human UX)

When a run pauses at a **checkpoint** step with `view_ref`, Desktop embeds the custom view from `murrmure/views/` in the **primary region** — not a side drawer or built-in gate form.

- View submits `{ disposition, output }` via the shell adapter
- See [View SDK](../reference/view-sdk) and [Review workflow](./review-workflow)

## Typical workflows

### Human review checkpoint

1. **Run** indexed flow from space home
2. **ViewCanvasHost** opens intake or review view
3. Submit validated / request changes — engine branches via `on_resolve`

### Operator: observe session run

1. Open **`/sessions/:sessionId`** — run graph, pending gate panel, retry
2. Use when debugging — not the primary path when a custom view is specified

### Resolve imperative gate (fallback)

Gate panel on session/run routes when no checkpoint view is active.

## Next

- [Murrmure Desktop](./desktop)
- [Review workflow](./review-workflow)
- [View SDK](../reference/view-sdk)
