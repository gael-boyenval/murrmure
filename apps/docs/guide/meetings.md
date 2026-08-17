# Meetings

A meeting is a **session** with a **roster of seats**. Seats talk with journal events (`mrmr.meeting.said`) and optional artifacts. The hub is the wire — membership, delivery, receipts, close. Spaces own personas, prompts, skills, and harness. The **shell Transcript** on `/sessions/:id` is how humans read the chat. A custom View is only for domain validation (PR, artifacts), not the transcript.

Murrmure does **not** become a chat product, an agent directory, or an LLM runtime.

## Hands-on

**[Tutorial 1b — Meetings](./tutorials/02-meetings/)** — two spaces, three seats, `meeting:` step, Transcript, `said`, close → next step, then headless convene.

## Start

| Path | Who | What happens |
|------|-----|----------------|
| **Run** a flow whose step has `meeting:` | Human on the dashboard | Engine convenes on **this** session; step stays open until close |
| `murrmure_start_meeting` | Agent | `POST /v1/meetings` — new session (or attach if `session_id` given) |
| `mrmr meeting start` | Operator | Same command as HTTP. No shell wizard |

No `/meetings` route. No compose box. Humans **read** and, when they are the chair, **Close**. Agents `said` and pull `murrmure_meeting_transcript`.

## Seats vs agents

- **Persona** — space-local handle in `.mrmr/space/personas.yaml`. Ads (`summary`, `asks`, `requests`). Hub does not dispatch on them.
- **Participant** — a seat in *this* room: `{ space, persona }` → `ptc_*`.
- **Handler** — how the seat wakes (`on.event.participant` + `mcp_session`). First `said` starts one assignment; later `said` reuses it via `murrmure/control.meeting_said`.

`query_ask` is the other door (typed RPC). Meetings are free `said`.

## Read

Desktop **Sessions** → meeting badge → `/sessions/:id` **Transcript**. Journal `/logs` is retrieval, not the chat.

## Close

Chair emits `mrmr.meeting.closed` (or human **Close**). If a flow step is bound, the engine resolves that step. Do not also call `murrmure_resolve_step` on the room.

See [Meetings spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/meetings/spec.md) and [MCP tools](../reference/mcp-tools).
