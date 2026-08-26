# ADR-016 — Meeting protocol boundaries

**Status:** Accepted and shipped
**Date:** 2026-08-17  
**Owners:** Hub core, handlers, journal  
**Spec:** [plans/2026-08-17-meetings/](../plans/2026-08-17-meetings/README.md) — protocol in [spec.md](../plans/2026-08-17-meetings/spec.md); locked decisions in [pitfalls.md](../plans/2026-08-17-meetings/pitfalls.md)

## Context

Teams want interactive rooms: a product space talks to a research space, shares documents, addresses a specific voice, and closes when a goal is reached. One space may host several voices (QA and designer). Turns are async. Agents must not receive the full transcript pasted into every wake.

Existing tools are the wrong shape: `query_ask` is typed RPC with a timeout; event-handler delivery today always `createSession`; `shell_spawn` starts a new harness per event. Philosophy already allows multiple roles per space and forbids hub-owned agents.

## Decision

1. **A meeting is a session**, not a new kernel aggregate and not a chat runtime. Talk is `mrmr.meeting.*` on that `session_id`.
2. **Address seats, not agents.** A participant is `{ space_id, persona? }` minted as `ptc_*`. Persona is a space-owned handle. Murrmure does not store Agent entities, prompts, skills, or models.
3. **Persona catalog is ads.** `.mrmr/space/personas.yaml` (`summary`, `asks`, `requests`) is indexed for convene-time discovery. Hub never dispatches on those strings. Typed RPC stays `query_ask`.
4. **Space is the ACL principal.** Persona is routing + attribution. Persona-scoped tokens are out of scope.
5. **Receipt is hub delivery**, not an agent ack and not a mandatory reply. `in_reply_to` is optional forever. No meeting timeout on silence.
6. **Transcript is a pull projection.** Assignment prompts follow ADR-013: trigger message + `since_seq`. The hub MUST NOT inline the room.
7. **Attach one persistent seat process.** Meeting events MUST join the existing `session_id`. Default seat is `shell_spawn` on **convene** with `session.mode: persistent`: one runtime-owned PTY per `(session_id, ptc_*)`. First turn is the command argument; later `said` writes the next turn into that PTY after idle. Meeting close owns graceful PTY shutdown. One-shot `continuation` remains a fallback contract, not the stock meeting path. Identity is the roster `ptc_*`, not persona. Poking an unrelated operator chat is forbidden.
8. **Chair talks and closes.** A participant chair emits events. A `{ human: true }` chair may `said` through the dedicated session mutation and may close. Hub does not interpret the goal. After close, `said` is denied until **Resume** reopens the same `ses_*` / `ptc_*`.
9. **The shell owns the human-readable chat.** `/sessions/:id` Transcript is operator chrome (like flowchart), not a space View. A View is only for domain validation (PR, artifacts) and must not be required to see talk. The shell exposes a human-chair composer without impersonating a roster seat.
10. **A meeting may be a flow step** — a `meeting:` contract facet on an otherwise normal step (not a `wait:`/`gate:` kind). Open convenes on this session; close resolves the step. Standalone convene (shell header **Meetings** + **+**, MCP, CLI) still exists. Resume does not un-resolve a bound step.
11. **User-triggered rooms are not space-owned.** Header convene creates a session. Discovery is header **Meetings** (`GET /v1/meetings`, open + closed), not space home. Roster spaces are ACL / delivery, not the room's owner.
12. **`mrmr.meeting.convened` is the doorbell.** Hub journals it and wakes each seat. A `said` handler is the seat (convene rings it; later `said` is talk). **Resume** journals `mrmr.meeting.resumed` and rings the same handlers with `trigger: resumed`. Close already killed the PTY; resume starts a replacement process for that `ptc_*`. No talk flow is required to start a room.

## Consequences

- Handler dispatch for meeting events must stop creating a fresh session.
- `on.event.participant` is required when a space declares personas.
- Crash / dead-host resurrection is explicitly not designed here; queue until reachable.
- Memory / summarization stays out of the hub.

## Enforcement

- Promote [spec.md](../plans/2026-08-17-meetings/spec.md) into `current/` only with the acceptance rows in that spec.
- Reviews: Agent entity, transcript-in-prompt, `query_ask`-as-meeting, or “chat is a space View” are blocking.
