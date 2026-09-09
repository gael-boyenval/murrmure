# Shell (Murrmure v2)

**Status:** normative  
**Architecture:** [product/architecture.md](../product/architecture.md) · [product/spec.md](../product/spec.md)  
**North star:** [philosophy.md § North star](../product/philosophy.md#north-star-non-negotiable--2026-07-03)

---

## Product role of the shell (read first)

Murrmure is an **agentic operating system**. The shell is **not** the product UI authors ship to users.

| Mode | What it is | When |
|------|------------|------|
| **Custom view (ViewCanvasHost)** | **Primary human experience** — author's full UI from `.mrmr/views/`; generic shell chrome hidden or minimized | Gates, human checkpoints, workflow-specific dashboards |
| **Shell admin chrome** | **Operator/admin** — space home, flowchart, notifications, grants, session debug | Managing spaces and observing runs, including unbound steps |

**Implementation must not treat** space home, flowchart, or a built-in gate form as the default human path when a view is bound. Unbound steps stay observability-only — no form is synthesized.

---

## Package split

| Package | Role |
|---------|------|
| `@murrmure/shell-ui` | shadcn/ui components, Tailwind v4 dark theme, layout primitives |
| `@murrmure/shell-client` | rev-1 read APIs only — spaces list, journal SSE (no configure/flow-install APIs) |
| `@murrmure/shell-web` | Routes, pages, React Query + `JournalProvider` composition |

Shell must **not** import flow install or configure APIs from `@murrmure/hub-client`.

---

## Observer / admin mode

v2 retires the retired configure shell. Default shell routes are **admin/operator** surfaces:

- Space mutations via CLI (`mrmr space init`, `link`, `apply`)
- Local connections via `mrmr connection create` (no token-bearing retired configure shell)
- Legacy `/configure` and `/setup` redirect to `/spaces/new`
- Header **Meetings** + **+** button group: list open and closed rooms (`GET /v1/meetings`); **+** convenes (`POST /v1/meetings`). Closed rooms offer **Resume** (`POST /v1/sessions/{id}/meeting/resume`)
- Header **New directive** fans out the hub-owned `flw_mrmr_directive` run (`POST /v1/flows/flw_mrmr_directive/run`) to spaces that bind `step.opened::directive.execute`. Stays in the dialog (lifecycle + message + session link). No `/directives` route. Agent fan-out uses `murrmure_list_directive_eligible` / `murrmure_start_directive` (`hub:admin` only).

---

## Routes (phase 06 subset)

| Route | Purpose |
|-------|---------|
| `/` | Redirect to first space or `/spaces/new` |
| `/spaces/new` | CLI instructions + SSE waiting indicator |
| `/spaces/:id` | Space home (title + optional `description` purpose, runs/flows + Run) |
| `/spaces/:id/flows/:flowId` | Flow preview (`flow:read`) |
| `/connect` | Hub URL + token + MCP snippet (non-bundled) |
| `/notifications` | Actionable inbox linking bound checkpoints to their custom Views |
| `/logs` | Journal explorer with filter chips (retrieval only) |
| `/runs/:id?gate=chk_*` | Run detail with flowchart or journal replay + gate tab |
| `/sessions/:id` | Session tabs: **Transcript** (meeting when `GET /v1/sessions/:id/transcript` is 200), **Review** (bound validation View), **Agent activity** for meeting turn runs / **Flowchart** otherwise, **Journal**. Meeting default is Transcript. Non-meeting + bound view defaults to Review. `?operator=1` defaults to Flowchart. A bound View is a tab — it must not unmount Transcript. No `/meetings` or `/chat` route. |
| `/spaces/:id/dev/views/:viewId` | View dev — author iframe + fixture tabs (`mrmr view dev`) |

---

## Notifications & gates (phase 07)

- Header **Needs you (n)** badge from `GET /v1/notifications` pending count; persists across refresh.
- Gate resolve uses the bound View in **ViewCanvasHost**; unbound steps are observability-only (no built-in form).
- Hidden space §6.4: assignees see "Private space" without nav link; non-assignees suppressed.
- Profile menu sets landing space via `PATCH /v1/me`.

### Out-of-shell (phase 15)

- `PATCH /v1/me` also accepts `notify_email` and `notify_desktop` (boolean, default on).
- Profile menu checkboxes toggle per-channel opt-out.
- Hub dispatches `out_of_shell.desktop` SSE for desktop push when journal types are `mrmr.gate.pending` or `mrmr.run.failed` only.
- Email uses `MURRMURE_SMTP_*` or `MURRMURE_EMAIL_WEBHOOK_URL`; dev default is log-only noop adapter.
- Admin self-test: `POST /v1/notifications/test` (`hub:admin`).

---

## Meeting Transcript (session chrome)

A meeting is a session. Humans read talk on `/sessions/:id` — not a space View and not `/logs`.

- **Transcript** is the conversation: title, opaque goal (`session.subject`), `open` / `closed`, roster as `persona@space` (slug, not raw `spc_*` / `ptc_*`), each `said` as a chat turn (speaker, to/everyone, **Markdown** text, `HH:mm:ss`; full ISO on hover). Opening the room scrolls to the last message and stays pinned to the bottom until the reader scrolls up. The header chevron collapses goal + roster; the goal auto-collapses after more than five messages. **Reload** refetches the transcript. Receipts show Hub delivery latency. Replies show elapsed time from the parent message. `in_reply_to` quotes the prior text. Artifact refs show **name + size + a capped text preview** via `GET /v1/sessions/:id/artifacts/:xfr?preview=1` (same auth as the transcript). A right rail lists unique attachments; click jumps to the sharing turn and opens the preview. Not a PR/diff product, not full bytes in the pane. Journal lines (`hook.delivered`, `run.started`) stay on the **Journal** tab — they must not paint under Transcript.
- **Human-chair compose.** While open, `{ human: true }` chair may send text to selected seats or everyone through `POST /v1/sessions/{id}/meeting/say`. **Reply** on a turn sets `in_reply_to` and defaults `to` to that sender seat. Artifact cards **Expand** into a modal; **Reply** / **Cite** from that modal set `in_reply_to` and/or `artifacts: [xfr_*]` on the next say. The Hub stamps `from: { human: true }`; the UI never impersonates an agent seat. Human chair **Close** remains `POST /v1/sessions/{id}/meeting/close` — not `gates.resolve`, not `runs.cancel`. Human chair **Resume** on a closed room is `POST /v1/sessions/{id}/meeting/resume` — same `ses_*` and `ptc_*`, seats re-woken with `trigger: resumed`.
- Live updates: every accepted `said` broadcasts `journal.append` with its `session_id`; `JournalProvider` immediately invalidates `["session-transcript", sessionId]`. An open Transcript also polls every second as a reconnect/failure fallback. SSE reconnect (hub replace / HMR) invalidates transcript, session, and meetings queries. Needs-you is **not** invalidated on every `said`.
- Closed meetings stay readable (historical) and remain in header **Meetings**. **Resume** reopens that room.
- Access is header **Meetings** (`GET /v1/meetings`, open + closed) — the room is not owned by a space. Operator start is header **+** (spaces + personas → `POST /v1/meetings`, human chair) plus optional Run / MCP / CLI. No `/meetings` UI route. Convene wakes seats (`mrmr.meeting.convened`). Resume re-wakes the same seats (`mrmr.meeting.resumed`). Empty Transcript means no `said` yet.

### Must show

- Session title, opaque goal text, `open` / `closed`
- Roster: persona + space (not raw `ptc_*` as the only label; id available in detail)
- Each `said`: from, resolved `to` (names, or “everyone” when `all: true`), text, time / seq
- `in_reply_to` as a thread hook (indent or “re: …”), not a second product
- Artifact refs: **name + size + capped text preview** (session artifact GET). **Expand** modal. **Reply** / **Cite** from the modal. Right rail lists unique `xfr_*` and jumps to the share. No in-shell PR/diff renderer
- Header minimize (title + status stay)
- Per-target receipts (`delivered` / `failed`)
- Seat status `working` when a live assignment exists
- Meeting **Agent activity** lists every roster seat and watches that seat’s live PTY in a wterm emulator with the Ghostty VT core (watch-only). Viewer grid is 120×40 — same as the persistent PTY — so spinner CSI (cursor-up / CR) overwrites in place. One process per seat until close; last output remains after exit until hub restart.

### Must not

- Inline the raw journal (`hook.delivered`, `run.started`)
- Paste full artifact bytes into the pane
- Let a non-chair compose, or stamp a human message as an agent seat
- Hide the transcript because a validation View is open

### Human actions

| Who | Action |
|-----|--------|
| Human chair | **Send** to selected seats / everyone; **Reply** to a turn (`in_reply_to`); **Close** with optional reason / outcome; **Resume** a closed room. |
| Anyone with `journal:read` | Read transcript, open artifacts they are allowed to read |
| Non-chair human speaking | **Out.** No seat impersonation |

Needs-you: only if a human chair must close. Do not badge every `said`.

### Validation View (not the chat)

If the goal needs a human to **validate** something agents produced (PR, spec artifact, preview), bind a `view_resolver` on a **validation** step. ViewCanvasHost takes the Review tab. Transcript stays. Do not bind a chat View on the meeting step.

### Acceptance

1. Meeting session `/sessions/:id` shows Transcript by default; no `view_resolver` required.
2. Messages are a conversation (speaker, text, to/all, quiet receipts). `/logs` and the Journal tab are not the primary chat.
3. Artifact on a message is a link, not a built-in review UI.
4. Bound validation View does not remove the Transcript tab.
5. Human-chair compose stamps `{ human: true }`; selected/all targeting works.
   Human chair can Close. Non-chair say/Close denied.
6. Closed meeting remains readable (historical). Human chair can Resume the same `ses_*`.
7. Message time, delivery latency, and reply latency remain visible and derive
   from journal timestamps.
8. No `/meetings` route. Header **Meetings** + **+** lists rooms and convenes (spaces + indexed personas, human chair) then opens Transcript. Run / MCP / CLI remain valid starts.
9. No `/directives` route. Header **New directive** lists eligible spaces (`GET /v1/directives/eligible`), requires a prompt, starts one run per pick, and shows completed/failed + `message` in the dialog.

---

## Session / run flowchart (phase 09)

- **`RunFlowchartView`** — `@xyflow/react`, lazy-loaded on `/sessions/:id` and `/runs/:id` when `flow_id` present
- Fork/join nodes for matrix parallel lanes; lane click selects run in right panel
- **`JournalWaterfallView`** — Inngest-style fallback when no declared graph (headless hook/action runs)
- Partial failure: lane border green (`completed`) / red (`failed`); session badge `partial_failure`
- **Retry** on failed lane → `POST /v1/runs/{id}/retry` (new run, `reference_run_ids`)

Graph data: `GET /v1/runs/{id}/graph` (manifest overlay + step memo + sibling lanes).

---

`JournalProvider` opens one global subscription:

```http
POST /v1/auth/sse-ticket     # Bearer → tkt_* (≈60s)
GET  /v1/journal/subscribe?ticket=tkt_…
```

SSE events invalidate TanStack Query caches (`spaces`, per-space sessions/runs).

| Client | Auth |
|--------|------|
| Desktop bundled | Same-origin; token in localStorage → sse-ticket |
| Web hosted | Bearer stored in localStorage → sse-ticket (EventSource cannot send Authorization) |

Hub broadcasts include `space.list_changed`, `journal.append`, `mrmr.space.index_updated`, gate events.

---

## Custom views (ViewCanvasHost — phase 05)

Views are **full custom UI** in the **primary content region** (sandboxed iframe via **ViewCanvasHost**), not a narrow drawer.

| Moment | Field | Shell surface |
|--------|-------|---------------|
| Checkpoint step | space `view_resolver` → inline view ref on `open_steps[]` | **ViewCanvasHost** (full canvas) |
| No view bound | — | Observability-only (no fallback form synthesized) |

**Session UX (decision 07):** ViewCanvasHost chrome shows **session title** / workflow name — not raw `run_*` ids. On `/sessions/:id` a bound View is the **Review** tab and must not unmount Transcript. Operator run detail remains at `/runs/:id` (`?operator=1` for flowchart-first).

**Dev route:** `/spaces/:id/dev/views/:viewId` — iframe loads author dev server; fixture tabs switch `dev/fixtures/*.json` context (decision 02).

The hub projects the space's `view_resolver` as a sanitized inline descriptor (`view_id`, `origin_space_id`, `entry`, `shell_route`) on `open_steps[]`; the shell consumes it without client-side handler matching. Production assets are locally built under `<space>/.mrmr/views/{view_id}/` and served by `GET /v1/spaces/{id}/views/{view_id}/*`. Flow records carry no View identity, and the shell provides no built-in fallback form.

See `packages/cli/skill-developer/reference/flow-authoring.md` and `packages/view-sdk/README.md`.

---

## UI stack

- Tailwind CSS v4 + CSS variables (dark default, Vercel-inspired)
- shadcn/ui primitives in `shell-ui` (Button, Sidebar, Card, Badge, Dialog, Sheet, Command)
- Lucide icons
- TanStack Query for data fetching

---

## Dev

```bash
pnpm dev          # hub-daemon + shell-web (Vite :5174, proxies /v1)
pnpm desktop:dev  # builds bundled shell + desktop app
```

Bundled build: `pnpm --filter @murrmure/shell-web build:bundled` (`VITE_MURRMURE_BUNDLED=1`).
