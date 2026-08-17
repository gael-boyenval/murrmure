# Part 4 — Run it and read the room

**Concept:** A **run** that opens `decide` **convenes** on **this session**. The session *is* the meeting. You read **Transcript**, not `/logs`.

## Before you start

Parts 1–3 applied. No said handlers yet — that is correct.

## Step 1 — Run from the dashboard

Desktop: **meeting-app** → **Flows** → **api-shape** → **Run**.

You should see:

- New session `ses_…`, run `run_…`
- Route `/sessions/:id` with **Transcript** as the **default** pane
- Status **open**
- Goal text from the manifest
- Roster of **three** seats, labels like `designer@meeting-app`
- **No messages**
- **No compose box**
- Flowchart / journal tabs still exist (operator), not the chat
- Step `decide` still **open** / working

```text
flow.run.started
  └─ step.opened(decide)
       └─ mrmr.meeting.convened   (3 ptc_*, chair=human)
            └─ run remains open  (no said handlers fire)
```

## Step 2 — What you are not looking at

- `/logs` filtered to `mrmr.meeting.*` is retrieval, not the product chat.
- Do not ask the agent to `murrmure_journal_query` and summarize the room.
- **Needs you** may show Close (human chair). It must **not** badge “new message” (there are none, and v1 does not badge every `said` later either).

## Step 3 — Close as human chair

Click **Close**. Optional reason/outcome fields if the shell has them; empty is valid.

You should see:

- Transcript status **closed**
- `decide` resolved **completed**
- Run **succeeded**
- Historical transcript still readable
- A second **Run** is allowed

```text
mrmr.meeting.closed
  └─ step.resolved(decide, completed)
       └─ run.terminal(success)
```

## Step 4 — Five-minute tour (terms only)

| Term | What you just saw |
|------|-------------------|
| **Session** | The room (`ses_…`) |
| **Run** | One walk through `api-shape` |
| **Meeting** | Facet on `decide` — not a new entity type |
| **Roster / participant** | A seat `{ space, persona }` → `ptc_*` |
| **Transcript** | Fold of `mrmr.meeting.*` only |
| **Journal** | Full audit; includes hooks/runs you do not need in the chat |
| **View** | Not used |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| ViewCanvasHost / blank canvas | Someone bound a view or expected 1a | No view on `decide`; open **Sessions** → Transcript |
| No **Run** | Flow not applied / wrong space | Apply from `meeting-app` |
| `PERSONA_NOT_FOUND` | Typo or research not applied | Part 2 apply both; ids match catalog |
| Convenor / invite error | App run cannot read research | Same hub; both spaces created by you; re-check `spc_…` in the manifest |
| Compose box | Product bug or stale build | v1 has none — do not “type as designer” |
| Run stuck open | Did not Close | You are the chair |

## Checkpoint

- [ ] **Run** opened Transcript by default
- [ ] Three seats, 0 messages, no compose box
- [ ] Human **Close** completed `decide` and the run succeeded
- [ ] You noted `ses_…` / `run_…` on a sticky note
- [ ] You did **not** emit `said` yet

## Next

[Part 5 — Wake a seat →](./05-wake-seats)
