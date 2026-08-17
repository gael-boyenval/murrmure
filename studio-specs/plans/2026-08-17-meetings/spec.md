# Meeting protocol (agent rooms)

**Status:** draft — unshipped design (2026-08-17, **hardened**)  
**Not CI-gated.** Promote into `studio-specs/current/` only with implementation + acceptance tests.  
**ADR:** [ADR-016](../../ADR/ADR-016-meeting-protocol.md)  
**Origin:** architecture conversation — interactive multi-space meetings, personas, async turns, transcript pull.

On conflict with shipped behavior, [`current/`](../../current/) wins.  
On conflict *inside this folder*, [pitfalls.md](./pitfalls.md) locked decisions win over older prose below.

**Surfaces (one file each):** [architecture](./architecture.md) · [code-surfaces](./code-surfaces.md) · [persistence](./persistence.md) · [space-catalog](./space-catalog.md) · [flow-step](./flow-step.md) · [wire](./wire.md) · [cli](./cli.md) · [shell-lens](./shell-lens.md) · [testing](./testing.md) · [tutorial-plan](./tutorial-plan.md)

---

## 0. Hardening (read first)

Verified against code 2026-08-17. Full table: [pitfalls.md](./pitfalls.md).

1. **Journal-first emit.** Today `POST /v1/spaces/:id/events` often does **not** journal and returns fake `seq: 1`. Meeting types MUST append before fan-out.
2. **Attach is a delivery-mode refactor**, not an `if (meeting)` in `dispatchEventHandler`. Non-meeting handlers still `createSession`.
3. **`since_seq` is session-monotonic `meeting_seq`**, not space journal `seq`. Transcript is a **session API**, not `journal_query` (space filter hides other seats).
4. **Join-once is a new notify primitive.** Assignment-mode MCP drops hook wakes. Do not document “reuse pending-wake” as if it exists.
5. **Close XOR `resolve_step`.** Engine resolves the meeting step on `closed`. Human close is a **new** session mutation, not a gate/View.
6. **`meeting:` is a step-level facet**, not “like `artifact_slots`” (those are branch-level). Nested meeting steps rejected in v1.
7. **List-personas for invitees is hub-mediated.** Chair tokens cannot `GET` a foreign space.
8. **Seat prompt is `murrmure.meeting/v1`.** Do not reuse the step envelope that orders `murrmure_resolve_step`.
9. **`spaces_touched` += full roster at convene.** Artifact readers = roster **spaces**, not `ptc_*`.
10. **One run per room (flow) / at most one per live seat (headless).** Never run-per-`said`. 5-minute headless sweeper must not kill seats.

---

## 1. One sentence

A meeting is a **session** with a **roster of seats**. Seats talk with journal events and artifacts. The hub is the wire (membership, delivery, receipts, close). Spaces own personas, prompts, skills, and harness. The **shell** is how humans read the chat. A custom view is only for domain validation (PR, artifacts), not the transcript.

Murrmure does **not** become a chat product, an agent directory, or an LLM runtime.

---

## 2. Problem

| Today | Gap |
|-------|-----|
| Cross-space `query_ask` | Typed RPC, sync timeout — not a conversation |
| Event handlers + `murrmure_emit_event` | Works, but each delivery **creates a new session** (`dispatchEventHandler`) |
| `shell_spawn` per event | New harness every turn — empty brain, transcript dump |
| Space ≡ one voice | QA and designer in one directory cannot be addressed apart |
| Journal tail | Mixes `hook.delivered` / `run.started` with talk |

**Target:** several spaces (and several personas in one space) sit in one room, send text and documents, optionally reply to a message, optionally address one seat, stay async (minutes of work), see that a message was delivered, and let a chair or a human close when the goal is reached.

---

## 3. Layer decision

| Layer | Owns |
|-------|------|
| **Protocol** | Session-as-room, roster, `mrmr.meeting.*`, receipts, transcript projection, attach-to-session, close rules, artifact ACL to roster |
| **Flow** | Optional `meeting:` **step facet** ([flow-step.md](./flow-step.md)): open convenes, close resolves. Not turn-taking. Not `wait:`/`gate:`. Optional validation steps elsewhere. |
| **Shell** | Default human-readable transcript on `/sessions/:id`. Operator chrome, not a View package. |
| **View** | Optional domain validation (PR, artifact review). Must not be required to see talk. |
| **Space** | `personas.yaml` ads, handler per persona, prompts, skills, harness |

**Decision test:** talk is events; meaning is the space; **reading the chat is shell**; validating the *goal* may be a view.

---

## 4. Scope

### In (this design)

- Roster of **participants** (space + optional persona)
- Space-owned **persona catalog** (free-text ads)
- Events: `convened` · `said` · `delivered` / `delivery_failed` (hub) · `closed`
- Optional `in_reply_to` — never required
- Address one seat, several seats, or `{ all: true }`
- Transcript projection + pull (`since_seq`)
- Assignment prompt: trigger + cursor, **not** the full room
- Handler delivery **attaches** to the meeting session
- Join-once: reuse a live assignment for later `said` (no new `ses_*`)
- Chair participant **or** human closes
- Thin meeting flow; **shell transcript lens** (not a space View)
- Optional validation View when the goal needs human review of artifacts / PRs

### Out (this slice)

- Memory / embeddings / hub summaries
- Crash / dead-host spawn policy (queue until reconnect is enough; do not design host resurrection)
- MCP `Mcp-Session-Id` as the meeting id (different noun — see ADR-016)
- `sampling/createMessage` as the wake path
- Typed `meeting.asked` / schema-validated answers (use `query_ask`)
- Hub-owned Agent entities, prompts, skills, models
- Turn-taking engine, typing indicators, “who speaks next”
- Persona-scoped credentials (space remains the ACL principal)
- Federation-specific meeting relay (same-hub first; events + artifacts already federate later)
- Mandatory reply to a message

---

## 5. Nouns

| Noun | Id | Meaning |
|------|----|---------|
| **Meeting** | the `session_id` (`ses_*`) | One room. One session. |
| **Persona** | space-local handle (`designer`) | Advertised voice. Not a Murrmure agent. |
| **Participant** | `ptc_*` | A **seat** in *this* meeting: `{ space_id, persona? }` |
| **Message** | `msg_*` | One `said`. Hub-issued. |
| **Chair** | a `ptc_*` or `{ human: true }` | Who may close. |
| **Transcript** | projection | Fold of meeting events. Rebuildable from journal (K9). |

**Agent** stays `harness × task × context × space`. The meeting addresses **seats**, not agents.

Default seat: invite a space with no persona → one participant, `persona` omitted.

`designer` is not global. Two spaces may both declare it. `ptc_*` is the address.

---

## 6. Persona catalog (space-owned ads)

**Path:** `.mrmr/space/personas.yaml`  
Indexed on `mrmr space apply`. Hub stores handles + blurbs. **Never interprets them.**

```yaml
version: 1
personas:
  - id: researcher
    summary: Technical research and prior art
    asks:
      - literature / papers on a topic
      - latency or perf evidence
    requests:
      - attach a written brief
      - recommend a choice (not decide)
  - id: designer
    summary: Product UI in this repo
    asks:
      - UX review of a flow or screenshot
    requests:
      - critique an artifact
```

| Field | Rule |
|-------|------|
| `id` | `^[a-z][a-z0-9_-]{0,63}$`, unique in the space |
| `summary` | Required short text |
| `asks` / `requests` | Optional string lists. **Ads.** Not query types, not dispatch keys. |

Chair (human or agent) lists personas on spaces they may invite **before** convene. Talk is still free `said`. If the catalog says “attach a brief” and they never do, the hub does not care.

**Capabilities ≠ handlers.** Handler = how the seat wakes. Catalog = what others are told the seat is for.

Prompts, skills, model, harness stay out of this file (`agent.md`, `agents/{id}/`, handler `prompt`).

---

## 7. Convene

Creates meeting state on a **session** (not a new entity type). Three start paths — same room, same events:

| Path | Who | What happens |
|------|-----|----------------|
| **Flow step** | Engine, when a step with a `meeting:` contract opens | Convene on **this** session; step stays open until `closed` |
| **MCP / HTTP** | Agent or operator | `POST /v1/meetings` / `murrmure_start_meeting` — new session or attach if `session_id` given |
| **CLI** | Operator | `mrmr meeting start` (same command as HTTP). No shell wizard |

Shell does **not** grow a “New meeting” composer. Space home **Run** on a flow that has a meeting step is the dashboard trigger. An agent chair uses MCP.

Creates **one session** (or attaches) with meeting state:

```json
{
  "title": "API shape",
  "goal": "Pick an approach for the public list endpoint",
  "participants": [
    { "space_id": "spc_app", "persona": "designer" },
    { "space_id": "spc_app", "persona": "qa" },
    { "space_id": "spc_research", "persona": "researcher" }
  ],
  "chair": { "space_id": "spc_app", "persona": "designer" }
}
```

`chair: { "human": true }` is allowed (close in the shell lens).

Hub:

1. Resolves each `{ space_id, persona? }` against the indexed catalog. Unknown persona → `PERSONA_NOT_FOUND`.
2. Mints `ptc_*` per seat. Duplicate `(space_id, persona)` in one roster → reject.
3. Uses the current `session_id` when convene is a flow step or `session_id` was passed; otherwise creates `ses_*`.
4. Journals `mrmr.meeting.convened` with roster + chair + goal (goal is opaque text). Updates `spaces_touched` with **every** roster space.
5. **One open meeting per session.** A second convene while open → `MEETING_ALREADY_OPEN`. After close, a later step may convene again on the same session.

Convenor needs `space:read` on every invited space. Flow path also needs `flow:run`. Headless path needs session create.

### 7.1 Meeting as a flow step

**Yes.** A meeting is not a resurrected `wait:` / `gate:` kind. It is a **step-level protocol facet** (not a branch field like `artifact_slots`): the step *is a room* until the meeting closes. Details: [flow-step.md](./flow-step.md).

```yaml
steps:
  - id: research
    description: Researcher gathers prior art
  - id: decide
    description: Designer and researcher agree the API shape
    meeting:
      participants:
        - { space: "{{input.app_space}}", persona: designer }
        - { space: "{{input.research_space}}", persona: researcher }
      chair: { space: "{{input.app_space}}", persona: designer }
      goal: "{{input.goal}}"
    branches:
      completed:
        route: { step: implement }
      failed:
        route: { run: failed }
  - id: implement
    description: Build what the meeting decided
```

| On | Hub does |
|----|----------|
| Step `decide` **opens** | Convene on **this session** (templates from run input). Seats wake via their `mrmr.meeting.said` handlers — not a step handler for the chat. |
| Meeting **open** | Step stays open (`working`). Shell Transcript is the human lens. Flowchart still shows `decide`. |
| `mrmr.meeting.closed` | Hub resolves the step `completed` (or `failed` if the close reason says so). Outcome / artifacts land on the step payload. Chair does **not** also call `murrmure_resolve_step` unless they are closing. |
| Next step | Flow advances as today. |

Rules:

- `meeting:` names **spaces + persona handles** (and templates). Not prompts, not harness. Spaces still bind how each seat wakes.
- Do not put a `view_resolver` on `decide` *for the chat*. A later/sibling step may bind a View for PR/artifact validation.
- A space `step.opened` handler on a meeting step is optional (e.g. chair kickoff `said`). It is not required to open the room.
- Standalone convene (no flow) remains valid — headless session, same transcript.

```text
session (one work unit)
  run: research → decide [meeting open] → implement
                  └── shell Transcript on /sessions/:id
```

---

## 8. Events

All meeting events **MUST** carry `session_id` = the meeting. CloudEvents `subject` = `sessions/{session_id}` (or `…/runs/{run_id}` when a run exists). `from` / space on `said` is **hub-stamped**.

### 8.1 `mrmr.meeting.said`

Agent emit (`event:emit`) while the meeting is open and the emitter is a roster seat in the token’s space.

```json
{
  "type": "mrmr.meeting.said",
  "session_id": "ses_…",
  "data": {
    "as_participant_id": "ptc_qa",
    "to": { "participant_ids": ["ptc_des", "ptc_res"] },
    "in_reply_to": "msg_01J…",
    "text": "Empty state breaks this flow.",
    "artifacts": ["xfr_…"]
  }
}
```

`to` is **either** an explicit list **or** the room — not both:

```json
{ "participant_ids": ["ptc_des"] }
{ "participant_ids": ["ptc_des", "ptc_qa"] }
{ "all": true }
```

| Field | Rule |
|-------|------|
| `as_participant_id` | Required unless the token is bound to exactly one live seat. Must be a roster seat whose `space_id` matches the emitter space. |
| `to` | `{ participant_ids: ptc_*[] }` **xor** `{ all: true }`. Both or neither → `TO_AMBIGUOUS`. Every id must be on the roster (`NOT_MEETING_MEMBER`). Duplicates collapsed, order kept. Speaker is dropped if present. After that the list MUST be non-empty (`TO_EMPTY`). `all` = every roster seat except the speaker. |
| `in_reply_to` | Optional. Must be a `msg_*` already in this session. Missing is valid. |
| `text` | Optional if `artifacts` is non-empty. Inline cap 64 KiB. |
| `artifacts` | Optional `xfr_*`. Must authorize roster members as readers (hub expands ACL on accept). |

Hub assigns `message_id` (`msg_*`). Client-supplied ids are ignored.

No `meeting.asked` type. An ask is `said` with a `to`. Typed RPC stays `query_ask`.

### 8.2 `mrmr.meeting.delivered` / `mrmr.meeting.delivery_failed`

**Hub-authored only.** Agents cannot emit these.

Appended when the hub has attempted wake/notify for a target seat of a `said`:

```json
{
  "type": "mrmr.meeting.delivered",
  "session_id": "ses_…",
  "data": {
    "message_id": "msg_…",
    "participant_id": "ptc_res"
  }
}
```

`delivery_failed` adds `reason` (`EXECUTOR_UNAVAILABLE` | `NO_HANDLER` | …).

Receipt ≠ reply. A seat can be `delivered` and never `said` back. The meeting does not time out.

### 8.3 `mrmr.meeting.closed`

Only the chair participant (matching space + persona) or the human chair (**session close mutation** — not a gate, not a View) may close.

```json
{
  "type": "mrmr.meeting.closed",
  "session_id": "ses_…",
  "data": {
    "reason": "goal reached",
    "outcome": "Use cursor-based pagination",
    "artifacts": ["xfr_…"]
  }
}
```

After close: further `said` → `MEETING_CLOSED`. If a flow step is bound, the **engine** `resolveFlowStep` ([flow-step.md](./flow-step.md)). Meeting status is the snapshot, **not** `deriveSessionStatus`.

Hub does not understand “goal reached.” Chair or human does.

---

## 9. Transcript (pull, not paste)

`GET /v1/sessions/{session_id}/transcript?since_seq=`

Projection over `mrmr.meeting.*` only. Rebuildable from journal.  
`since_seq` is **`meeting_seq`** (session-monotonic), not space `journal_index.seq`.  
**Not** `GET /v1/journal` / `murrmure_journal_query` — those filter by emitter space and hide other seats.

```json
{
  "session_id": "ses_…",
  "status": "open" | "closed",
  "roster": [ { "participant_id", "space_id", "persona" } ],
  "chair": { "participant_id" } | { "human": true },
  "since_seq": 848,
  "up_to_seq": 912,
  "messages": [
    {
      "message_id": "msg_…",
      "seq": 850,
      "from": { "participant_id", "space_id", "persona" },
      "to": { "all": false, "participant_ids": ["ptc_des", "ptc_res"] },
      "in_reply_to": "msg_…",
      "text": "…",
      "artifacts": ["xfr_…"],
      "receipts": [
        { "participant_id": "ptc_res", "status": "delivered" | "failed", "reason": null }
      ]
    }
  ]
}
```

Authored `{ all: true }` projects as `{ all: true, participant_ids: [/* roster minus speaker */] }` so the view can say “everyone” and still list receipts per seat.

Optional seat status (from live assignment / latest run on this session): `idle` | `working` | `failed`. Enough for “research is still going.” No `meeting.working` event required.

**Assignment prompt:** Task = handler `prompt`. Seat envelope is **`Protocol: murrmure.meeting/v1`** (not the step ADR-013 block that orders `murrmure_resolve_step`). Protocol includes `session_id`, `participant_id`, triggering `message_id`, `since_seq` (that seat’s last delivery seq, or `0` on first join). **MUST NOT** inline the transcript. Agent pulls if needed. The shell lens shows the full room.

---

## 10. Wake, attach, join-once

### 10.1 Who wakes

| `to` | Who is notified |
|------|-----------------|
| `{ participant_ids: […] }` | Each listed seat’s meeting handler (after dropping the speaker) |
| `{ all: true }` | Every other roster seat with a matching handler |

One `said` → one journal row → **N receipts** (one `delivered` / `delivery_failed` per target).

Read access is separate: any roster member with `journal:read` may pull the whole transcript, including talk not addressed to them.

### 10.2 Attach (required)

Today `dispatchEventHandler` always `createSession`. For `mrmr.meeting.*` that is **forbidden**. This is a **general delivery-mode split** ([architecture.md](./architecture.md) R1), not a meeting `if`.

- Event **MUST** carry the meeting `session_id` (else `MEETING_SESSION_REQUIRED` — never create).
- Delivery **MUST** attach to that session (or `notify_live` if a seat assignment exists).
- Dedup stays per source event id + handler id (each new `said` may notify again).
- Emit **MUST** journal first ([pitfalls.md](./pitfalls.md) D1).

### 10.3 Join-once (happy path)

Per participant, while the meeting is open:

1. **First notify** — start **one** long-lived assignment `(session_id, participant_id)`. Prefer `mcp_session`. `shell_spawn` per message is the wrong executor for a room.
2. **Later `said` to that seat** — if a live assignment exists, **do not spawn and do not create a session.** Publish via a **new** notify method that assignment-mode MCP does **not** drop (today `invoke_action` wakes are dropped when `authMode !== "local"`). Do not call this “pending-wake” — that file is local-auth only.
3. **No live assignment** — start one on the **same** `session_id`. Hard-crash host resurrection is **out of scope**; queue until reachable.
4. **`closed`** — revoke assignments; further talk denied.

If the notify method is not ready, v1 is **first-wake + queue**. Do not ship the tutorial as “assignment reused” until slice 5 lands. `publishToSpace` is too coarse for two personas in one space — address a principal.

A **run** may be one per live seat (observability) or the optional `room` flow run. Either way the **harness** must not reset on every `said` when the assignment is live.

`Mcp-Session-Id` is not `ses_*`. MCP reconnects the pipe. `ses_*` re-joins the room.

---

## 11. Handlers

```yaml
# .mrmr/space/handlers.yaml
- id: meeting-designer
  on:
    event:
      type: mrmr.meeting.said
      participant: designer
  type: mcp_session
  complete: explicit
  prompt: |
    You are the designer seat in this meeting.
    Use local skills/tools as needed. Pull transcript if you need prior turns.
```

`on.event.participant` matches the seat’s persona (or the default seat when omitted on a space with no personas).

If the space declares personas, a handler that omits `participant` MUST NOT match `said` (avoid waking every voice). Apply rejects that combo: `PERSONA_HANDLER_UNSCOPED`.

Platform types `mrmr.meeting.said` / `mrmr.meeting.closed` are emittable by roster members **without** listing them in `events.yaml`. Hub still requires `event:emit`.

---

## 12. Hub enforcement

On `said`:

1. Session is a meeting and **open**
2. Emitter space owns `as_participant_id`
3. `to` is xor list / `all`; every listed id is on the roster; resolved targets non-empty
4. `in_reply_to` exists in this session when present
5. `from` stamped; client `from` ignored
6. Artifacts authorized to the roster
7. Inline size ≤ 64 KiB

On `closed`: emitter is the chair (or human chair path).

After close: `said` denied.

---

## 13. Shell lens vs validation View

**Chat is shell.** Humans read `/sessions/:id` Transcript — [shell-lens.md](./shell-lens.md). No `view_resolver` required. No kernel meeting View.

**Validation is a View** (optional, different job). If the goal needs a human to approve a PR or inspect an artifact, bind a space View to that checkpoint. Same session; transcript tab stays.

A meeting step is the wait ([flow-step.md](./flow-step.md)). Extra steps may be validation gates with `view_resolver`. The flow does **not** declare turns. Close completes the meeting step. **Today** a bound View **unmounts** session chrome — the shell slice must undo that ([shell-lens.md](./shell-lens.md)).

Headless meeting (agents only, no flow) is valid. Shell still shows the historical transcript.

---

## 14. HTTP / MCP (proposed)

| HTTP | MCP | Command |
|------|-----|---------|
| `GET /v1/spaces/{id}/personas` | `murrmure_list_personas` | Indexed catalog |
| `POST /v1/meetings` | `murrmure_start_meeting` | Convene |
| `GET /v1/sessions/{id}/transcript` | `murrmure_meeting_transcript` | Projection |
| `POST /v1/sessions/{id}/meeting/close` | emit `closed` or dedicated close | Human / chair |
| existing emit | `murrmure_emit_event` | `said` / `closed` (chair) |

Scopes: `space:read` (same-space personas), `event:emit` (talk / chair close), `journal:read` or roster membership (transcript), `flow:run` (convene / flow start). Human close: [wire.md](./wire.md) session mutation — **not** a view/gate.

`murrmure_emit_event` for meeting types **requires** top-level `session_id`. HTTP emit requires `event:emit`. Hub-authored types are denylisted. Convenor listing of **foreign** personas is hub-mediated inside convene — not `GET /v1/spaces/{other}/personas`.

Full tables: [wire.md](./wire.md).

---

## 15. Denial codes

| Code | When |
|------|------|
| `PERSONA_NOT_FOUND` | Invite or emit names a persona the space did not index |
| `PERSONA_HANDLER_UNSCOPED` | Apply: meeting handler missing `participant` while personas exist |
| `NOT_MEETING_MEMBER` | Emitter / target not on roster |
| `MEETING_CLOSED` | `said` after close |
| `MEETING_CHAIR_REQUIRED` | Close by a non-chair |
| `REPLY_UNKNOWN` | `in_reply_to` not in this session |
| `MEETING_SESSION_REQUIRED` | Meeting event missing / wrong `session_id` |
| `PARTICIPANT_AMBIGUOUS` | Space has several seats and `as_participant_id` omitted |
| `MEETING_ALREADY_OPEN` | Convene while this session already has an open meeting |
| `TO_AMBIGUOUS` | `to` has both `all` and `participant_ids`, or neither |
| `TO_EMPTY` | Resolved target list empty (only the speaker, or empty array) |
| `MEETING_HANDLER_COMPLETE_AUTO` | Apply: `said` handler `complete: auto` |
| `MEETING_STEP_VIEW_RESOLVER` | Apply: `view_resolver` on a `meeting:` step |

Reuse `INLINE_PAYLOAD_EXCEEDED`, `EXECUTOR_UNAVAILABLE`. `QUERY_POLICY_DENIED` is **not** used (meetings are not `query_ask`).

---

## 16. Worked example

```text
1. Product chair lists personas on spc_app + spc_research
2. Convene ses_m — seats designer, qa, researcher; chair = designer
3. Designer said → researcher: “Need the last latency study.”
4. Hub: delivered(researcher). Research assignment starts (or is notified).
5. Researcher works minutes. Room stays open. No sync wait. Reply not required.
6. Researcher said → `[designer, qa]`, optional in_reply_to, artifact xfr_brief
7. Hub: delivered(designer), delivered(qa). Live seats get msg + since_seq.
8. A later `said` to designer only does not wake QA; QA may still pull the transcript.
9. Designer (or human) closed { outcome, artifact }
```

---

## 17. Acceptance (when implemented)

1. Convene with two personas in one space + one other space → three `ptc_*`, one `ses_*`.
2. `said` to one seat → that handler only; transcript shows `delivered`.
2b. `said` to `[ptc_a, ptc_b]` → both handlers; two receipts; a third seat does not wake.
3. Second `said` to the same live seat → **same** `session_id`, no second session; assignment reused when live.
4. `said` with no `in_reply_to` accepted; unknown `in_reply_to` → `REPLY_UNKNOWN`.
5. Assignment protocol block has trigger + `since_seq` and does not contain prior message bodies.
6. Non-chair `closed` → `MEETING_CHAIR_REQUIRED`; after chair close, `said` → `MEETING_CLOSED`.
7. `GET …/personas` returns ads only (no prompts).
8. `query_ask` unchanged; meetings do not use it.
9. Shell Transcript on `/sessions/:id` needs no `view_resolver` — [shell-lens.md](./shell-lens.md).
10. Flow with `research → decide (meeting:) → implement`: opening `decide` convenes on the same `ses_*`; close advances to `implement`.

---

## 18. Related shipped specs

| Doc | Relation |
|-----|----------|
| [philosophy](../../current/product/philosophy.md) | Session, artifacts, no agent entity; multiple roles per space |
| [product/spec §8](../../current/product/spec.md) | Journal envelope; handler delivery “create or attach” |
| [ADR-013](../../ADR/ADR-013-agent-assignment-prompt-protocol.md) | Thin **step** assignment prompt — seats use `murrmure.meeting/v1` |
| [handlers](../../current/bridges/handlers.md) | `on: event:`; `mcp_session` vs `shell_spawn` |
| [artifacts](../../current/bridges/artifacts.md) | Docs in the room |
| [cross-space](../../current/cross-space/spec.md) | Not this protocol — typed ask/answer |
| [shell](../../current/shell/spec.md) | Meeting Transcript is shell chrome, not ViewCanvasHost |
| [architecture](./architecture.md) | Placement, R1–R7, slice 0–8 |
| [persistence](./persistence.md) | Journal vs snapshot vs `meeting_seq` |
| [testing](./testing.md) | Characterization + pyramid |
| [tutorial-plan](./tutorial-plan.md) | 1b writer brief — pages not written |
