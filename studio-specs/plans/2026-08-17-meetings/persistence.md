# Meetings — persistence

**Status:** draft (hardening 2026-08-17)  
**Binds:** [pitfalls.md](./pitfalls.md) D10 · [architecture.md](./architecture.md)

Journal is canonical (K9). SQLite is a local projection. Federation later = replay journal, not sync a `meetings` table.

---

## 1. Tables that exist (do not reinvent)

From `packages/hub-persistence/src/migrate.ts`:

| Table | Role | Copy for meetings? |
|-------|------|--------------------|
| `sessions` | title, status, `spaces_touched`, actor | **No new columns** — not `meeting_status`, not roster JSON (D10). Status ≠ meeting open/closed. Snapshot is `meeting_sessions`. |
| `runs` / `run_step_memo` | flow + headless execution | Flow path uses these. Not the roster. |
| `journal_index` | `entry_id`, `seq` (space), `space_id`, `type`, `session_id`, `payload_json` | **Source of talk.** Needs a **session-monotonic** cursor (see §4). |
| `space_hooks` / `space_events` / `flow_index` / `space_views` | apply snapshot | **Personas follow this pattern.** |
| `artifacts` | `authorized_readers_json` | Expand to roster **spaces** on `said`. |
| `gates` / `notifications` | orchestration interrupt / inbox | **Do not** store the room here. Optional Needs-you for human-chair close only. |
| `queries` | `query_ask` | **Do not touch.** |
| `tokens` / `grants` | space-bound ACL | Persona is not a principal. |

`SessionRow` has no metadata bag. `exec_context` is run-scoped kitchen sink — **forbidden** for roster (headless convene has no flow run; merges overwrite).

---

## 2. Space catalog — personas

Same as handlers/events:

1. CLI `readSpaceApplyBundle` reads `.mrmr/space/personas.yaml` (file **optional**).
2. `applyIndexDiff` adds resource `"personas"`.
3. Persist as `IndexedResourceRow[]` in `SpaceIndexSnapshot.personas`.
4. Physical store: either a new `space_personas` table (`space_id`, `name`, `digest`, `payload_json`) **or** reuse a generic indexed-resource table. Prefer **`space_personas`** mirroring `space_events` — one apply resource, easy `listIndexedPersonas`.

Hub stores `id`, `summary`, `asks`, `requests`. **Never** interprets ads. Prompts stay out.

`listIndexedPersonas(space_id)` on the persistence port. Convenor path: hub reads **multiple** spaces’ indexes (D7), not the client.

---

## 3. What must persist vs fold

| Data | Persist how | Why |
|------|-------------|-----|
| `mrmr.meeting.convened` / `said` / `delivered` / `delivery_failed` / `closed` | **Journal** | Audit, transcript, federation later |
| Roster, chair, goal, open/closed | Journal + **write-through snapshot** | Every `said` needs open + roster without a full scan. Pattern = `GateRow` + journal, `run_step_memo` + `mrmr.step.*` |
| `ptc_*` / `msg_*` | In journal payload; snapshot holds roster ids | Mint at convene / said. Lookup `in_reply_to` = journal (or snapshot message-id set) |
| Transcript DTO | **On-read fold** of `mrmr.meeting.*` | K9. Optional cache later if rooms get huge — not v1 |
| Persona ads | Space index | Apply-time catalog |
| Live assignment `(session_id, participant_id)` | **Runtime map** (memory + optional sqlite) | Not truth. Lost on process restart → next `said` starts a new assignment on the **same** `ses_*` (join-once happy path is in-process) |
| `spaces_touched` | Existing session column | **Must** include every roster space at convene |
| Session-monotonic `meeting_seq` | On each meeting journal row + snapshot `up_to_seq` | **Not** space `seq` |

---

## 4. Recommended schema (minimal)

### 4.1 Snapshot table `meeting_sessions`

One row per session that has ever convened. After close, a later convene **replaces** the row (journal keeps history).

```text
session_id          TEXT PRIMARY KEY   -- bare or ses_* — match sessions.session_id convention
status              TEXT NOT NULL      -- open | closed
title               TEXT
goal                TEXT               -- opaque
chair_json          TEXT NOT NULL      -- { participant_id } | { human: true }
roster_json         TEXT NOT NULL      -- [{ participant_id, space_id, persona? }]
convene_entry_id    TEXT NOT NULL
convene_meeting_seq INTEGER NOT NULL
close_entry_id      TEXT
close_meeting_seq   INTEGER
bound_run_id        TEXT               -- flow run if any
bound_step_id       TEXT               -- meeting step if any
updated_at          TEXT NOT NULL
```

Uniqueness of **one open meeting per session**: `UNIQUE(session_id)` plus application CAS — `UPDATE … WHERE status='closed'` / insert only if missing. Second convene while `open` → `MEETING_ALREADY_OPEN`. No second aggregate type.

Port:

- `getMeetingBySession(session_id)`
- `upsertMeetingSnapshot(row)` — convene/close
- `listOpenMeetingSessionIds()` — optional, operator

Rebuild: fold journal `mrmr.meeting.convened` + later `closed` for that `session_id`. Snapshot is a cache with CAS, not source of truth.

### 4.2 Session-monotonic sequence

Do **not** use `journal_index.seq` (per-space) as `since_seq`.

**Locked: option A.** `journal_index.meeting_seq` (nullable, non-meeting rows stay null) + `meeting_seq_counters(session_id PRIMARY KEY, next_seq)`. Query: `WHERE session_id=? AND meeting_seq > ?`.

Transcript `since_seq` / `up_to_seq` are these values.

### 4.3 Live assignments (optional table)

v1 may be **process memory** (`Map<`${session_id}:${participant_id}`, { run_id?, last_delivery_seq, principal? }>`).

If we persist (survive daemon restart without “new assignment”):

```text
meeting_assignments
  session_id, participant_id  PRIMARY KEY
  run_id                      TEXT
  handler_id                  TEXT
  last_delivery_meeting_seq   INTEGER
  status                      TEXT  -- live | revoked
  updated_at                  TEXT
```

Not the roster. Close revokes all rows for the session.

### 4.4 Message-id lookup

`msg_*` lives in `said` payload. `in_reply_to` check: `queryJournalIndex` type `mrmr.meeting.said` + `session_id` + payload `message_id`, **or** a tiny `meeting_messages(session_id, message_id, meeting_seq)` if the fold is too slow. **v1: journal query is enough** (rooms are small). Add the table only if tests show pain.

### 4.5 What we explicitly do not add

- `meetings` as a kernel aggregate (new id space besides `ses_*`)
- `sessions.meeting_status` / `meeting_roster_json` / `meeting_chair_json` (rejected vs a late research option — D10)
- Persona columns on `tokens`
- Transcript blob table
- Durable `meeting_assignments` as **required** v1 (process memory is enough; crash resurrection is out)
- `ptc_*` as `authorized_readers`
- Kernel `projection_states` for transcript

---

## 5. Artifact ACL

On accept of `said.artifacts`:

1. Load each `xfr_*`.
2. Union `authorized_readers` with every roster `space_id` (prefixed).
3. Persist the updated artifact row.

If there is no update API today, add **`updateArtifactReaders(transfer_id, readers)`** on the port — meeting-scoped, not a public ACL editor. Do not rewrite bytes.

---

## 6. Journal query gaps to close

`queryJournalIndex` today: `since`/`until` are **timestamps**, `ORDER BY time DESC`, default limit 100, then **space filter** for non-admin.

Transcript path **MUST**:

- filter `session_id` + `type` prefix `mrmr.meeting.`
- order by `meeting_seq` ASC
- **not** apply the emitter-space filter (roster auth already decided)
- honor `since_seq`

Do not implement transcript as a wrapper over `GET /v1/journal`.

---

## 7. Migration

`migrateStudio` is `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` `ALTER`.

1. `space_personas` (or snapshot JSON column — prefer table).
2. `meeting_sessions`.
3. `meeting_seq_counters` + `journal_index.meeting_seq` (nullable) if option A.
4. Optional `meeting_assignments`.

`memory.ts` **must** implement the same port methods in the same PR. Existing tests: `packages/hub-persistence/test/flow-index.test.ts` — add `meeting-snapshot.test.ts` + `personas-index.test.ts` (memory + sqlite parity, same style as other port tests).

---

## 8. Pitfalls

| Risk | Rule |
|------|------|
| Dual-write snapshot ≠ journal | Append journal **first**; then snapshot. Rebuild test: delete snapshot, fold, compare |
| Stale open | Close **must** update snapshot in the same commit as `closed` |
| Session `completed` while room open | Do not derive meeting status from `deriveSessionStatus` |
| Federation | Remote hub without journal rows cannot see the room — expected until relay |
| Space ACL vs persona | Snapshot roster is routing; tokens stay `space_id` |
| `exec_context` temptation | Reject in review |
