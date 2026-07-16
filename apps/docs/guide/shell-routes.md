# Shell UI (inside Desktop)

The observer shell is the UI inside **Murrmure Desktop** — not a standalone browser app.

**North star:** checkpoint steps with a space-bound view render in **ViewCanvasHost** (full primary-region custom UI). Routes below labeled **admin/operator mode** are for observe, debug, and grants — not the primary human path when a view is bound.

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

When a run pauses at a **checkpoint** step with a space-bound view (a `view_resolver` in `handlers.yaml`), Desktop embeds the custom view from `.mrmr/views/` in the **primary region** — not a side drawer or built-in gate form. Unbound steps stay observability-only.

- View submits a branch + params host-mediated via `submitBranch` / `cancel` (`@murrmure/view-sdk`)
- See [View SDK](../reference/view-sdk) and [Review workflow](./review-workflow)

## Typical workflows

### Human review checkpoint

1. **Run** indexed flow from space home
2. **ViewCanvasHost** opens intake or review view
3. Submit / cancel a branch — the engine routes via the step's `branches`

### Operator: observe session run

1. Open **`/sessions/:sessionId`** — run graph, pending step observability, retry
2. Use when debugging — not the primary path when a custom view is bound

### Unbound step (observability-only)

When no `view_resolver` is bound, the step shows why it is waiting with no form or fallback resolve control; an authorized protocol client resolves it externally.

## Next

- [Murrmure Desktop](./desktop)
- [Review workflow](./review-workflow)
- [View SDK](../reference/view-sdk)
