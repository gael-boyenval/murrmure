# Meetings — locked decisions (hardening)

**Status:** draft — binds the other files in this folder.  
**Date:** 2026-08-17  
**Not CI-gated.** Implementation must not start while a row below is still “open.”

The first draft ([spec.md](./spec.md)) is directionally right: session = room, talk = events, shell reads chat, hub is the wire. Several “today / already / one-line” claims are **false against shipped code**. This file records what we verified and what we lock.

On conflict: `current/` wins for shipped behavior. This file wins for *unshipped meeting design* over the first-pass prose in `spec.md`.

---

## 1. Lies we found (code vs draft)

| # | Draft assumed | Code actually does |
|---|----------------|-------------------|
| L1 | Emit produces a journal row + real `seq` | `POST /v1/spaces/:id/events` without `instance_id` **does not journal**. Returns `{ seq: 1 }` (fake). Dispatches hooks only. |
| L2 | Attach is a small change in `dispatchEventHandler` | Always `createSession` + `admitAndCreateRun`. `HookSourceEvent` has no `session_id`. MCP emit never sends one. |
| L3 | Join-once reuses “the control bus / pending wake” | No `(session_id, participant_id)` live map. `publishToSpace` fans out to **every** MCP in the space. Assignment-mode MCP **drops** further `invoke_action` wakes (`mcp-bridge` `authMode !== "local"`). |
| L4 | `since_seq` is journal `seq` | `seq` is **per-space**. `queryJournal` `since` is a **timestamp**. Default limit 100, newest first. No `since_seq`. |
| L5 | Any roster member `journal_query`s the room | Space-bound tokens **drop** other spaces’ rows. Designer `said` is invisible to a researcher token. |
| L6 | Chair `GET /v1/spaces/{other}/personas` | `requireToken` is path-bound to **one** space. Foreign GET is denied. |
| L7 | Human close uses “the view / gate path already scoped to the room step” | Meeting step must **not** have `view_resolver`. Flow steps create **no** gate rows. Shell-client mutations are `gates.resolve` / `runs.resolveStep` / `runs.cancel`. |
| L8 | `/sessions/:id` already has tabs; Transcript is a pane add | If a view is bound, `SessionPage` **returns only ViewCanvasHost**. Else flowchart + journal waterfall. No Transcript / Flowchart / Journal tab bar. |
| L9 | `meeting:` is “same family as `artifact_slots`” | `artifact_slots` is a **branch** field. Step schemas are `.strict()` — `meeting:` is rejected today. |
| L10 | Platform types without `events.yaml` | **Code** already allows undeclared emit. **`current/`** (`bridges/triggers.md`) claims `events.yaml` gates emit. Both cannot stay. |
| L11 | `on.event.participant` just works | `HandlerEventFilterSchema` is `type` + `source?` only. Extra keys are **stripped**. `matchEventHandlers` is type+source. |
| L12 | Assignment prompt is ADR-013 + `since_seq` | `renderMurrmureProtocolEnvelope` always: execute Task, call `murrmure_resolve_step`, do **not** call `get_pending_wake`. Event-handler wakes get **no** protocol block (`buildFlowInvokeStepContract` is undefined when `!flow_id`). |
| L13 | `spaces_touched` will list the room for all seats | Only updated in `createRun`. Convene without per-seat runs → invitees missing from session list. |
| L14 | Artifact ACL “expands on accept” | `authorized_readers` is set at **register**. No patch. Readers are `spc_*` / `actor:*`, not `ptc_*`. |
| L15 | `current/product/spec.md` §5.3 “create or attach” | Product spec already lies. Code never attaches. |
| L16 | Wake is a thin trigger + `since_seq` | `eventExecContext` spreads the **full** event payload into run input; `wake-prompt.ts` dumps params JSON as **Data**. |
| L17 | Apply will index `personas.yaml` if we drop the file in | `SpaceApplyBundle` extra keys are **stripped**. No field → personas vanish. |

---

## 2. Locked decisions

### D1 — Journal-first emit (blocker for everything)

Every `mrmr.meeting.*` that is not hub-authored **MUST** `appendSpaceJournal` **before** handler fan-out. Return the real hub `seq`. Fake `{ seq: 1 }` is forbidden for meeting types.

Prefer one `emitAndDeliver` in `hub-core` for **all** session-correlated events, not a meeting-only fork. Minimum: journal-first for types that carry `session_id`.

### D2 — Delivery mode is hub policy, not an author field

Do **not** add `if (meeting) skip createSession` inside today’s `dispatchEventHandler`. Split delivery:

| Envelope | Mode |
|----------|------|
| No `session_id` (webhooks, `spec.published`) | `create` — today’s behavior, keep tests green |
| `session_id` present, session exists | `attach` — no new `ses_*` |
| `session_id` + live assignment for that seat | `notify_live` — no new session, no new run |
| Meeting type missing/wrong `session_id` | deny `MEETING_SESSION_REQUIRED` — **never** create |

Authors do not pick the mode. `startFlowRun` already attaches when `session_id` is passed — reuse that shape.

### D3 — Close XOR resolve

**One** close path:

1. Chair (or human chair) emits / posts `mrmr.meeting.closed`.
2. Hub journals `closed`, marks the snapshot closed, revokes live assignments.
3. If a flow step is bound, the **engine** calls `resolveFlowStep` (`completed`, or `failed` if the close payload says so).

Chair **MUST NOT** also call `murrmure_resolve_step` on the meeting step. Seat assignment tokens **MUST NOT** be able to resolve that step (`TOKEN_STEP_SCOPE_MISMATCH` or no `step:resolve` on the seat credential).

`complete: auto` on a `mrmr.meeting.said` handler is **rejected at apply** (`MEETING_HANDLER_COMPLETE_AUTO`).

### D4 — Human close is a new session mutation

Not a gate. Not a View. Not `runs.cancel`.

`POST /v1/sessions/{id}/meeting/close` (or equivalent) with the same payload as `mrmr.meeting.closed`. Shell-client grows **one** write. Needs-you: only human-chair close, not every `said`.

### D5 — Transcript is a session API, not `journal_query`

`GET /v1/sessions/{id}/transcript?since_seq=`

- Auth: caller is a roster seat’s space **or** has `journal:read` on a roster space (lock in [wire.md](./wire.md)).
- Fold `mrmr.meeting.*` only.
- **`since_seq` is session-monotonic**, minted on meeting journal rows. It is **not** space `seq`.
- Agents **MUST NOT** be taught to `journal_query` the room.

### D6 — Join-once is a new primitive (honest v1)

Do **not** write slice 5 as “wire existing `mcp_session`.” Assignment-mode MCP drops hook wakes.

**v1 allowed honesty:** first wake starts one assignment; later `said` **queues** until that assignment can receive a **new** notify method that assignment-mode does **not** drop. Crash resurrection stays out.

If that notify method is not ready, **do not publish** tutorial Part 5 as “same assignment reused.”

### D7 — List personas and convene are hub-mediated

Chair token is bound to the convenor space. Hub reads invitee catalogs from the **index**, like `query_ask` looks up the target. Do not make the chair `GET` a foreign `/v1/spaces/{other}/personas`.

`GET /v1/spaces/{id}/personas` stays for **that** space’s own token (operator / same-space agent).

### D8 — `meeting:` is a step-level facet

Optional `meeting` on the **step** (`FlowStepSchema` + catalog entry). Not a branch field. Not `wait:` / `gate:`. Amend ADR-007 / `step-contract.md` “nothing else” in the same PR as the schema.

Templates via existing `resolveTemplateString`. Desktop **Run** in the tutorial pastes literal `spc_*` because v1 has no roster form.

### D9 — Meeting assignment envelope is not the step envelope

New block: **`Protocol: murrmure.meeting/v1`**. Not the step envelope.

Must include: `session_id`, `participant_id`, triggering `message_id`, `since_seq`.  
Must **not** include: transcript bodies, `murrmure_resolve_step` as the operating rule, “do not pull.”

Step assignments stay on today’s ADR-013 envelope. Do not reuse `renderMurrmureProtocolEnvelope` for seats.

### D10 — Persistence: journal is truth

Roster, messages, receipts, close = journal. Optional write-through **snapshot** keyed by `session_id` (gate/memo pattern), rebuildable. **No** meeting columns on `sessions`. **No** roster in `exec_context`. Personas live in the **space index**, like events.

See [persistence.md](./persistence.md).

### D11 — ACL principals stay spaces

`as_participant_id` is attribution + routing, not a token. Artifact `authorized_readers` = **union of roster `space_id`s** (plus existing source). Never `ptc_*`. Expand at `said` accept for newly cited `xfr_*`; do not invent a general ACL patch API in v1.

### D12 — `spaces_touched` at convene

Convene **MUST** `updateSessionSpacesTouched` with every roster space. Otherwise invitees never see the session.

### D13 — HTTP emit requires `event:emit`

Parity with MCP. Hub-authored types (`convened`, `delivered`, `delivery_failed`) are **denylisted** on agent emit.

### D14 — One observability run, not one run per `said`

- Flow path: the **flow run** is the observability run. Seats are assignments on that session, not new headless runs per message.
- Headless path: **at most one** headless run per live seat (or none — live map only).  
- **Forbidden:** run-per-`said` + `createSession`.
- `reconcileHeadlessRuns` (5-minute stale sweeper) **MUST NOT** kill a live meeting seat. Exempt or don’t use headless-working memos as the live signal.
- Session status (`deriveSessionStatus`) **MUST NOT** mean “meeting closed.” Meeting status is the snapshot / last `convened`/`closed`.

### D15 — Two personas, one space, one MCP pipe

`publishToSpace` is too coarse. Join-once / first wake **MUST** address a principal (or handler id), not “anyone connected to `spc_app`.” Until that exists, two voices in one space are not testable as independent wakes.

### D16 — `current/` emit-gate story

On ship: `bridges/triggers.md` + philosophy must stop saying “`events.yaml` gates emit at apply” **or** we add that gate. Meetings need platform types **without** `events.yaml`. Prefer: declarations enrich schema; platform `mrmr.meeting.said` / `closed` are always emittable to roster members with `event:emit`.

### D17 — Facet lives on the catalog, not a new IR kind

`compileStepContractCatalog` **must** persist `meeting` on `StepContractCatalogEntry`. `compile.ts` IR stays `step_contract` / `parallel` / `start_flow`. A new IR kind rewrites flowchart + advance. Nested `meeting:` is rejected (D19).

`handler-catalog-lint` **must not** require `step.opened` on a meeting step.

### D18 — Do not special-case `if (isMeetingEvent)` inside today’s dispatcher

[testing.md](./testing.md) characterization pins **current** create-session behavior. The split is `resolveEventDeliveryTarget()` (D2). A meeting `if` bolted onto `dispatchEventHandler` is the rejected design.

`createSession` itself stays a ULID mint. Callers attach. `ensureSessionAndRun` must never see a missing `session_id` on the meeting path.

`trigger-dispatcher.ts` is retired — do not hang meetings there.

### D19 — Former open rows (locked 2026-08-17)

| ID | Lock |
|----|------|
| O1 | Transcript: caller’s space is on the roster **or** token has `journal:read` on a roster space |
| O2 | Close `failed` → `data.failed: true`. Omit / false → `completed` |
| O3 | Envelope is `murrmure.meeting/v1` |
| O4 | Nested `meeting:` rejected at apply |
| O5 | Second convene after close allowed (MCP and flow). While open → `MEETING_ALREADY_OPEN` |
| O6 | Speaker is never a delivery target, even if listed in `to` |
| O7 | `list_emittable` includes `said` / `closed` for a roster member of an **open** meeting, no `events.yaml` required |
| O8 | Headless seat `working` comes from the live-assignment map. No map → omit (do not fake a run) |
| seq | `meeting_seq` = `journal_index` column + `meeting_seq_counters` (persistence option A) |
| chair | Human chair = session `actor_id` (or bootstrap). Close = `POST …/meeting/close`. Not a gate |
| seat | Seat credential: `event:emit` + transcript on that `ses_*`. **No** `step:resolve` on the meeting step |
| join | **Build join-once** (slice 5). Do not ship “reuse” as a lie. First-wake + queue only if slice 5 fails in-tree |

No remaining product forks. Implementers do not ask.

---

## 3. Do not implement until

1. Characterization tests for `dispatchEventHandler` exist ([testing.md](./testing.md) §2). That **is** slice 0 — start there.
2. Follow D1–D19. [pitfalls.md](./pitfalls.md) wins on conflict.
