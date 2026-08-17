# Meetings — architecture and placement

**Status:** draft (hardening 2026-08-17)  
**Binds:** [pitfalls.md](./pitfalls.md) · [spec.md](./spec.md) · [persistence.md](./persistence.md) · [code-surfaces.md](./code-surfaces.md)

Hub stays the wire. Spaces own personas, prompts, skills, harness. Shell reads chat. No agent entities.

---

## 1. Current map (what we bolt onto)

```text
emit / step-open
    → journal append          ← often SKIPPED today (space-scoped POST /events)
    → handler match           ← type + source only
    → createSession           ← ALWAYS (dispatchEventHandler)
    → admitAndCreateRun
    → InvokeService.invokeAction
        → mint run:step:handler token (step:resolve only)
        → ExecutorPort (mcp_session | shell_spawn | …)
            → ControlBus / McpSessionRegistry   (per SPACE, not seat)
    → step memo + resolve-credential registry
```

| Noun | Module | Meeting relevance |
|------|--------|-------------------|
| Session | `hub-core/src/run/service.ts` `createSession`; `session/status.ts` | Room id. Status derived from **runs** — must not mean “meeting closed.” |
| Run | `admitAndCreateRun`, `run_step_memo` | Flow path = one run. Do not mint a run per `said`. |
| Journal | `hub-core/src/journal/append.ts`; `handlers/hub.ts` `appendSpaceJournal`; `journal_index` | Canonical talk. Today emit often **does not** write it. |
| Handlers | `contracts` `HandlerSpecSchema`; `index/parse-handlers.ts`; `space_hooks` | Need `on.event.participant`. |
| Event emit | `hub-daemon/src/routes.ts` `POST /v1/spaces/:id/events`; `mcp-handlers.ts` `murrmure_emit_event` | No `session_id` on the wire. HTTP does not require `event:emit`. |
| Dispatch | `hub-core/src/hooks/dispatch.ts` `dispatchEventHandler` | **Refactor-first hotspot.** |
| Assignments | implicit: token `scope_ref`, `McpSessionRegistry`, `registerResolveCredential` | No live-seat table. |
| MCP wake | `executors` `mcp-session.ts`; `mcp-bridge` `pending-wake.json` | Assignment-mode **drops** hook wakes. |
| Flow open | `flow-engine/step-open.ts` `openStepContract` | Already stays `working` with no handler. Hook convene here. |
| Flow resolve | `flow-engine/step-resolve.ts` | Engine must call this on `closed`. |
| Prompt | `step-contract-slice.ts` `renderMurrmureProtocolEnvelope` | **Do not reuse** for seats. |
| Artifacts | `artifacts/acl.ts` — `spc_*` / `actor:*` | Expand to roster **spaces**. |
| Cross-space RPC | `cross-space/query.ts` | **Do not touch.** |
| Orchestration attach | `orchestration/attach.ts` | False friend — binds a **flow graph**, not event delivery. |

`current/product/spec.md` §5.3 already says handler delivery “create **or attach**.” Code never attaches.

---

## 2. Required refactors (before feature code)

Order is dependency, not PR size. Characterization tests first ([testing.md](./testing.md) §5).

### R1 — Split event delivery (`hub-core`, not daemon)

`dispatchEventHandler` mixes dedup, session create, run admit, invoke, `HOOK_DELIVERED`.

```text
hooks/dispatch.ts
  dispatchHooksForEvent        — keep (match + fan-out)
  dispatchEventHandler         — thin: dedup → resolve target → deliver → receipt
  resolveEventDeliveryTarget() — NEW: create | attach | notify_live
  deliverToAssignment()        — NEW: invoke OR notify
```

Policy table: [pitfalls.md](./pitfalls.md) D2 / D18. Non-meeting tests (`event-handler-dispatch`, `emit-event` feedback) stay on `create`. Attach path must pass `session_id` through — `ensureSessionAndRun` creates a session if the id is missing.

### R2 — Journal-first emit

New `hub-core/src/events/emit.ts` (name flexible):

1. Authorize + validate (meeting rules are a validator plugin).
2. `appendSpaceJournal` (real seq, `session_id` on envelope).
3. Post-commit: match → `resolveEventDeliveryTarget` → deliver.
4. Hub-author `delivered` / `delivery_failed`.

Daemon `POST /events` and `murrmure_emit_event` become adapters. Meeting types **require** `session_id`.

### R3 — Handler schema + apply

- `HandlerEventFilterSchema`: optional `participant`.
- `matchEventHandlers`: type + source + participant (meeting `said` only).
- Apply: `PERSONA_HANDLER_UNSCOPED`; `MEETING_HANDLER_COMPLETE_AUTO`.
- `SpaceApplyBundle` + snapshot: `personas` resource (**required** — extra keys are stripped today).
- CLI `readSpaceApplyBundle`: `.mrmr/space/personas.yaml`.
- `handler-catalog-lint` must **not** demand `step.opened` on a `meeting:` step.

### R4 — Step facet

Relax `.strict()` **only** by adding typed `meeting`. Compile onto `StepContractCatalogEntry` (**must survive compile** — D17). No new IR kind. Nested `meeting:` rejected. `openStepContract`: if facet → convene on **this** `session_id`. Do not require `step.opened` for the chat. A bound `step.opened` executor on a meeting step is **optional kickoff** and **MUST NOT** `complete: auto`.

### R5 — Assignment identity + prompt

Live map `(session_id, participant_id)` → assignment key, last delivery seq, optional `run_id`.  
Seat credential: `event:emit` + transcript read, bound to `session_id` — **not** `step:resolve` on `decide`.  
Renderer: `murrmure.meeting/v1` ([pitfalls.md](./pitfalls.md) O3).

### R6 — MCP addressability

`publishToPrincipal` (or handler/client filter) **before** two personas in one space are independently testable. `McpSessionRegistry` stays reachability; it is not the live-assignment store.

### R7 — Shell canvas

`SessionPage` must not unmount operator chrome when a validation View is bound. Transcript stays a session tab. This is a **shell** refactor, not a pane add. Do it in the shell slice, not as a drive-by.

---

## 3. Module placement

`contracts → hub-core → hub-persistence → hub-daemon → cli / shell / executors`.  
No meeting types in `runtime-kernel`.

| Concern | Home |
|---------|------|
| IDs `ptc_*` / `msg_*`, journal constants, denials, `HandlerEventFilter.participant`, `FlowStep.meeting`, persona file, transcript DTO | `packages/contracts` — `entities/meeting.ts`, `entities/persona.ts`, `journal/event-types.ts`, `entities/handler.ts`, `flow/manifest.ts` |
| Convene / said / close / `to` xor / roster CAS | `packages/hub-core/src/meetings/` (`convene.ts`, `said.ts`, `close.ts`, `errors.ts`) |
| Transcript fold | `hub-core/src/meetings/transcript.ts` (+ projections if needed) |
| Snapshot port | `hub-persistence` `getMeetingBySession` / `upsertMeetingSnapshot` |
| Persona index | `hub-core/src/index/parse-personas.ts`, `apply-index.ts`; CLI `space-directory.ts` |
| Delivery modes | `hub-core/src/hooks/dispatch.ts` split (R1) |
| Journal-first emit | `hub-core/src/events/emit.ts`; daemon adapters |
| Live assignment | port in hub-core; I/O in daemon (`control-bus`, `invoke-service`) |
| Meeting step | `step-open.ts`, `step-resolve.ts`, `step-contract-compile.ts` |
| HTTP / MCP | `hub-daemon/src/routes/meetings/`; `GET /v1/sessions/:id/transcript`; `mcp-handlers.ts` + registry + schemas |
| CLI | `packages/cli/src/commands/meeting/` — `mrmr meeting start` |
| Shell | `packages/shell-web` `/sessions/:id`; `shell-client` transcript + close |
| Meeting prompt | new renderer in hub-core; executors / mcp-bridge instructions |
| Artifact expand | `hub-core/src/artifacts` on `said` accept |

**False homes:** `orchestration/attach.ts`, `cross-space/query.ts`, `gates/service.ts`, `projections/notifications.ts` (except optional human-chair Needs-you), `trigger-dispatcher.ts`, `createSession` itself, `ViewCanvasHost` as chat, `wake-prompt.ts` as a transcript dump.

File-by-file: [code-surfaces.md](./code-surfaces.md).

---

## 4. What hub-core must not grow

- Agent entities, directories, prompts, skills, models, harness
- Turn-taking, typing, unread, presence, threads-as-product
- Transcript in assignment prompts; summaries; memory
- `sampling/createMessage` as wake
- `query_ask` as a turn
- Persona-scoped credentials
- Kernel meeting View; compose form; “New meeting” wizard
- Crash resurrection; federation meeting relay
- Interpreting `goal`

---

## 5. Hardened slice order

Replaces the six-slice list in the first README. Doc gates stay in [doc-surfaces.md](./doc-surfaces.md).

| Slice | Name | Must land | Must not pretend |
|-------|------|-----------|------------------|
| **0** | Characterization | `dispatch-event-handler.characterization.test.ts`; keep `brief.requested` create-session tests | Feature work |
| **1** | Catalog | `personas.yaml` parse/index; `GET` same-space personas; `on.event.participant`; apply denials | Convene as a product |
| **2** | Emit + attach (refactor) | R1 + R2; HTTP `event:emit`; hub-only type denylist; `session_id` on meeting emit | Join-once |
| **3** | Room protocol | Convene / said / close / snapshot / `spaces_touched` / receipts / denials | Shell Transcript; `meeting:` step |
| **4** | Transcript + prompt | Session transcript API; session-monotonic `since_seq`; `murrmure.meeting/v1` | Full journal pull |
| **5** | Join-once | Live map + notify that assignment-mode does not drop; `publishToPrincipal` | Crash spawn |
| **6** | Shell lens | Transcript default; Close mutation; canvas does not kill Transcript; no `/meetings` | Compose |
| **7** | Meeting step | `meeting:` facet; open → convene; close → `resolveFlowStep` | `wait:` / `gate:` |
| **8** | Tutorial + promote | [tutorial-plan.md](./tutorial-plan.md); `current/` | Docs as live before code |

If slice 5 slips, slices 6–8 may still ship with **first-wake + queue**, and the tutorial must say that.

Headless `POST /v1/meetings` lands in slice 3 (same convene as the flow path). CLI `mrmr meeting start` is the same command — slice 3 or 7, not a wizard.

---

## 6. Invariants we must not break

- Non-meeting event handlers still `createSession` (feedback, `brief.requested`).
- Dedup stays `source|event_id|handler_id` — each new `said` has a new `event_id`.
- Run idempotency keys stay hub-wide; do not reuse `msg_*` as a flow start key.
- Space is the ACL principal.
- `query_ask` unchanged.
- Unbound steps stay form-less.
- Apply quiescence / `FLOW_CONCURRENCY_LIMIT` still apply to **flow** runs, not to every `said`.
