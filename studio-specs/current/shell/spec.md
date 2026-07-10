# Shell (Murrmure v2)

**Status:** normative  
**Architecture:** [product/architecture.md](../product/architecture.md) · [product/spec.md](../product/spec.md)  
**North star:** [philosophy.md § North star](../product/philosophy.md#north-star-non-negotiable--2026-07-03)

---

## Product role of the shell (read first)

Murrmure is an **agentic operating system**. The shell is **not** the product UI authors ship to users.

| Mode | What it is | When |
|------|------------|------|
| **Custom view (ViewCanvasHost)** | **Primary human experience** — author's full UI from `murrmure/views/`; generic shell chrome hidden or minimized | Gates, human checkpoints, workflow-specific dashboards |
| **Shell admin chrome** | **Operator/admin** — space home, flowchart, notifications, grants, session debug | Managing spaces, observing runs, fallback when no view loaded |

**Implementation must not treat** space home, flowchart, or `GateResolvePanel` as the default human path when a view exists or should exist.

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

v2 retires Configure mode and the setup wizard. Default shell routes are **admin/operator** surfaces:

- Space mutations via CLI (`mrmr space init`, `link`, `apply`)
- Agent grants via `mrmr grant mint` (no Configure grants UI)
- Legacy `/configure` and `/setup` redirect to `/spaces/new`

---

## Routes (phase 06 subset)

| Route | Purpose |
|-------|---------|
| `/` | Redirect to first space or `/spaces/new` |
| `/spaces/new` | CLI instructions + SSE waiting indicator |
| `/spaces/:id` | Space home (six sections + Run) |
| `/spaces/:id/flows/:flowId` | Flow preview (`flow:read`) |
| `/connect` | Hub URL + token + MCP snippet (non-bundled) |
| `/notifications` | Actionable inbox (gates primary) + resolve panel |
| `/logs` | Journal explorer with filter chips (retrieval only) |
| `/runs/:id?gate=chk_*` | Run detail with flowchart or journal replay + gate tab |
| `/sessions/:id` | Session — pending checkpoint with `view_ref` → **ViewCanvasHost** (session title chrome) |
| `/spaces/:id/dev/views/:viewId` | View dev — author iframe + fixture tabs (`mrmr view dev`) |

---

## Notifications & gates (phase 07)

- Header **Needs you (n)** badge from `GET /v1/notifications` pending count; persists across refresh.
- Gate resolve uses embedded `GateFormSchema` default form (`GateResolvePanel`).
- Hidden space §6.4: assignees see "Private space" without nav link; non-assignees suppressed.
- Profile menu sets landing space via `PATCH /v1/me`.

### Out-of-shell (phase 15)

- `PATCH /v1/me` also accepts `notify_email` and `notify_desktop` (boolean, default on).
- Profile menu checkboxes toggle per-channel opt-out.
- Hub dispatches `out_of_shell.desktop` SSE for desktop push when journal types are `mrmr.gate.pending` or `mrmr.run.failed` only.
- Email uses `MURRMURE_SMTP_*` or `MURRMURE_EMAIL_WEBHOOK_URL`; dev default is log-only noop adapter.
- Admin self-test: `POST /v1/notifications/test` (`hub:admin`).

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
| Checkpoint step | `checkpoint.view` → `view_ref` on gate | **ViewCanvasHost** (full canvas) |
| Missing view bundle | — | `GateResolvePanel` form fallback (**admin only**) |

**Session UX (decision 07):** ViewCanvasHost chrome shows **session title** / workflow name — not raw `run_*` ids. Operator run detail remains at `/runs/:id?admin=1`.

**Dev route:** `/spaces/:id/dev/views/:viewId` — iframe loads author dev server; fixture tabs switch `dev/fixtures/*.json` context (decision 02).

Hub denormalizes `view_ref` at apply onto flow IR checkpoint steps. Assets: `GET /v1/spaces/{id}/views/{view_id}/*`.

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
