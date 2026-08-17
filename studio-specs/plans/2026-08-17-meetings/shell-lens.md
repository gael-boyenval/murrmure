# Shell meeting lens

**Status:** draft — unshipped (2026-08-17, **hardened**)  
**Protocol:** [spec.md](./spec.md) · [pitfalls.md](./pitfalls.md) D4, L7–L8  
**Shipped shell:** [current/shell/spec.md](../../current/shell/spec.md)

**Code today:** `packages/shell-web/src/routes/SessionPage.tsx` — if a view is bound and `?operator` is off, the page **returns only ViewCanvasHost**. Else `SharedFlowPage` (flowchart + journal waterfall). There is **no** Transcript / Flowchart / Journal tab bar. Close is **not** `gates.resolve` or `runs.cancel`.

The human-readable chat is **shell observability**, not a space View.

A View is a **different job**: domain validation when the meeting’s *goal* needs it (PR, artifact review). It must not be the only way to see what agents said.

---

## 1. Why shell, not a View

| Surface | Job |
|---------|-----|
| **Shell meeting lens** | Read the room: who spoke, to whom, receipts, artifacts as links, close if you are the human chair |
| **Custom View** | Optional. Bound to a *validation* step/gate (preview, review, approve a PR). Same session, not a replacement transcript |
| **`/logs`** | Raw journal. Not the chat |

Same split as flowchart vs ViewCanvasHost: protocol state is always visible in the shell; a View takes over only for authored domain UI.

Anti-patterns:

- Shipping a kernel `.mrmr/views/meeting` chat package
- Requiring a `view_resolver` to see talk
- Synthesizing a chat composer (no built-in form — same rule as unbound human steps)
- Treating the lens as a messenger product (typing indicators, reactions, “who speaks next”)

---

## 2. How you get there (dashboard)

No `/chat`, no `/meetings`, no “New meeting” wizard. The session *is* the room.

**Read (access the chat)**

| From | What you click |
|------|----------------|
| Sidebar **Sessions** | Row with a meeting badge → `/sessions/:id` (Transcript default) |
| Space home **recent sessions** | Same |
| Flowchart on that session | Meeting step (`decide`) is just a node. Session page still has Transcript. |
| **Needs you** | Only human chair / close — not every `said` |

**Start (trigger)**

| From | How |
|------|-----|
| Space home **Run** | Start a flow that has a `meeting:` step. Room opens when that step opens. |
| Agent | `murrmure_start_meeting` or `murrmure_create_run` on that flow |
| CLI | `mrmr meeting start` / `mrmr flow run …` |

Shell does not collect a roster in a form. Roster comes from the flow contract + run input, or from the MCP/CLI payload.

Session is a meeting when it has `mrmr.meeting.convened`.

| Route | Behavior |
|-------|----------|
| `/sessions/:id` | If meeting: **Transcript** is the default pane. Flowchart / journal replay stay available as operator tabs (**must be built** — they are not tabs today). |
| `/sessions/:id` + bound validation View | ViewCanvasHost for that checkpoint. Transcript remains a session tab — **must not unmount**. This **undoes** today’s canvas-only return. Medium-hard; do it in the shell slice, not as a drive-by. |
| `/runs/:id` | Operator run detail unchanged. No second chat. |
| `/logs` | Unchanged. Filter `type=mrmr.meeting.*` is enough for retrieval. |

---

## 3. Layout (operator-grade)

Primary pane = transcript. Reads `GET /v1/sessions/{id}/transcript` + journal SSE invalidation (existing `JournalProvider`).

```text
┌ Session title · goal · open|closed ──────── chair / Close ┐
│ Roster: designer@app  qa@app  researcher@research  [working] │
├────────────────────────────────────────────────────────────┤
│  designer → researcher                                     │
│  Need the last latency study.                              │
│  receipts: researcher delivered                            │
│                                                            │
│    ↳ researcher → designer, qa          [in_reply_to]      │
│      brief attached  ·  xfr_… (open)                       │
│      receipts: designer delivered · qa delivered           │
└────────────────────────────────────────────────────────────┘
```

### Must show

- Session title, opaque goal text, `open` / `closed`
- Roster: persona + space (not raw `ptc_*` as the only label; id available in detail)
- Each `said`: from, resolved `to` (names, or “everyone” when `all: true`), text, time / seq
- `in_reply_to` as a thread hook (indent or “re: …”), not a second product
- Artifact refs: **name + authorized open/download** (existing artifact routes). No in-shell PR/diff renderer
- Per-target receipts (`delivered` / `failed`)
- Seat status `working` when a live assignment exists

### Must not

- Inline the raw journal (`hook.delivered`, `run.started`)
- Paste full artifact bytes into the pane
- Invent a compose box for operators to impersonate seats
- Hide the transcript because a validation View is open

### Human actions (this slice)

| Who | Action |
|-----|--------|
| Human chair | **Close** (reason / outcome optional). Same protocol as `mrmr.meeting.closed`. |
| Anyone with `journal:read` | Read transcript, open artifacts they are allowed to read |
| Human seat speaking | **Out.** No synthesized `said` form. Humans who need to talk use a later slice or a validation View |

Needs-you: only if a human chair must close, or a later human-seat slice. Do not badge every `said`.

---

## 4. Data

| Need | API |
|------|-----|
| Messages, receipts, roster | `GET /v1/sessions/{id}/transcript` |
| Live updates | Existing journal SSE → refetch transcript (or append by `seq`) |
| Artifact open | Existing `GET /v1/artifacts/{transfer_id}` / bytes / materialize |
| Close | `POST /v1/sessions/{id}/meeting/close` — **new** mutation ([wire.md](./wire.md)). Not `gates.resolve`, not `runs.cancel`, not `runs.resolveStep`. |

Shell-client stays read-only except this close. Do not add configure APIs.

---

## 5. Validation View (not the chat)

If the goal needs a human to **validate** something agents produced (PR, spec artifact, preview):

- That is a normal `view_resolver` on a **gate / validation step** in the same session (or a follow-up run).
- ViewCanvasHost takes the canvas for that checkpoint.
- The meeting lens stays the chat tab. The View does not re-implement the transcript.

The meeting step is the wait ([flow-step.md](./flow-step.md)). It is **not** “bind a chat View.” Optional extra steps are for domain validation only.

---

## 6. Acceptance (when implemented)

1. Meeting session `/sessions/:id` shows Transcript by default; no `view_resolver` required.
2. Messages are human-readable (persona + space, text, to/all, receipts). `/logs` is not the primary chat.
3. Artifact on a message is a link, not a built-in review UI.
4. Bound validation View does not remove the Transcript tab.
5. No compose control. Human chair can Close. Non-chair Close denied (protocol).
6. Closed meeting remains readable (historical).
7. No `/meetings` route. Access is Sessions / space-home recent. Start is Run / MCP / CLI, not a shell wizard.
