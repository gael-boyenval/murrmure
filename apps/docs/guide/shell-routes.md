# Shell UI (inside Desktop)

The observer shell is the UI inside **Murrmure Desktop** — not a standalone browser app.

**North star:** checkpoint steps with a space-bound view render in **ViewCanvasHost** (full primary-region custom UI). Routes below labeled **admin/operator mode** are for observe, debug, and grants — not the primary human path when a view is bound.

## Routes

| Route | Purpose |
|-------|---------|
| **`/spaces/new`** | First-run space creation and linking |
| **`/spaces/:spaceId`** | Space home — runs, flows, gates (**admin**) |
| **`/spaces/:spaceId/flows/:flowId`** | Flow preview (**admin**) |
| **`/sessions/:sessionId`** | Session — **Transcript** default when the session is a meeting; **Review** tab if a validation View is bound (does not replace Transcript); Flowchart / Journal operator tabs. `?operator=1` defaults to Flowchart. No `/meetings` route. |
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
3. Meeting sessions open on **Transcript** — the conversation (who said what,
   when, and delivery/reply latency). Journal dumps stay on the Journal tab. A
   human chair can compose to selected seats/everyone and Close. There is no
   `/meetings` route. Header **Meetings** + **+** lists rooms and convenes.
   Closed rooms **Resume** the same session. Header
   **New directive** sends one prompt to eligible spaces (handler opt-in) and
   stays in the dialog with success/fail + message. No `/directives` route.

### Watch a meeting

1. Header **+** (pick spaces + personas), or an agent/CLI convene. Optional: **Run** a flow with a `meeting:` step
2. Open the session from header **Meetings** (open + closed) — Transcript is the default pane. The room is not listed on space home. **Resume** a closed room to continue the same `ses_*`
3. Convene wakes seats (`mrmr.meeting.convened`). Empty Transcript means no
   `said` yet; the human-chair composer remains available

### Operator: send a directive

1. Header **New directive** — type a prompt, pick spaces that bound
   `step.opened::directive.execute` (muted spaces need the handler recipe)
2. Submit fans out `POST /v1/flows/flw_mrmr_directive/run` per pick
3. Stay in the dialog: lifecycle, resolve `message`, link to `/sessions/:id`
4. Not a conversation. Opt in with the handler in
   [space handlers](./space-handlers) / the developer skill `reference/directive.md`

### Unbound step (observability-only)

When no `view_resolver` is bound, the step shows why it is waiting with no form or fallback resolve control; an authorized protocol client resolves it externally.

## Next

- [Murrmure Desktop](./desktop)
- [Meetings](./meetings)
- [Review workflow](./review-workflow)
- [View SDK](../reference/view-sdk)
