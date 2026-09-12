# Meetings

A meeting is a **session** with a **roster of seats**. Seats talk with journal events (`mrmr.meeting.said`) and optional artifacts. The hub is the wire — membership, delivery, receipts, close. Spaces own personas, prompts, skills, and harness. The **shell Transcript** on `/sessions/:id` is how humans read the chat. A custom View is only for domain validation (PR, artifacts), not the transcript.

Murrmure does **not** become a chat product, an agent directory, or an LLM runtime.

## Hands-on

**[Tutorial 1b — Meetings](./tutorials/02-meetings/)** — two spaces, three seats, `meeting:` step, Transcript, `said`, close → next step, then headless convene.

## Start

| Path | Who | What happens |
|------|-----|----------------|
| **Run** a flow whose step has `meeting:` | Human on the dashboard | Engine convenes on **this** session; step stays open until close |
| Header **Meetings** + **+** | Operator | List open/closed rooms. **+** picks spaces + personas. You chair. Opens Transcript. Closed rooms **Resume** the same session |
| `murrmure_list_invitable_spaces` then `murrmure_start_meeting` | Agent | Directory (no space id) then `POST /v1/meetings`. Bootstrap / `hub:admin` see every active space; other callers see their bound space plus matching `space:read` grants |
| `mrmr meeting start` | Operator | Same command as HTTP |

No `/meetings` route. Humans read Transcript; a human chair can message selected
seats or everyone, **Close**, and **Resume** a closed room. Agents `said` and pull
`murrmure_meeting_transcript`.

Header **+** creates a **session**, not a space object and not a run. Find it in the header **Meetings** list (always visible). Convene journals `mrmr.meeting.convened` and wakes each seat. **Resume** journals `mrmr.meeting.resumed` and re-wakes the same `ptc_*` in the same harness chat (`--resume` of the minted id). Transcript stays empty until a seat `said`. There is no talk flow to start a room.

## Seats vs agents

- **Persona** — space-local handle in `.mrmr/space/personas.yaml`. Ads (`summary`, `asks`, `requests`). Hub does not dispatch on them.
- **Participant** — a seat in *this* room: `{ space, persona }` → `ptc_*`.
- **Handler** — how the seat **enters and continues**. Stock seats use
  `session.mode: persistent` plus `continuation`: convene mints a chat id and
  starts one interactive CLI process (`{{prompt}}` is the first-turn argument).
Later `said` writes the next turn into that same PTY. Close/crash/Hub restart starts a
replacement with `--resume` of the stored id. Hub start silently respawns open rooms
(no extra `resumed` event). Human **Resume** is only for a closed room. Do not use
`mcp_session` as the enter path.

`query_ask` is the other door (typed RPC). Meetings are free `said`.

## Put this in every invited space

Ask the agent **in that repo**. Skills `murrmure-agent` / `murrmure-developer`
(v1.3.15 / v1.2.14) tell it to add **`type: shell_spawn`** with a persistent session and a minted chat id. If doctor says the
skill is outdated: `mrmr skill install --variant all` in that folder.

Copy, change `id` / `participant` / the prompt voice, then `mrmr space apply --strict`:

```yaml
# .mrmr/space/handlers.yaml
version: 1
handlers:
  - id: meeting-<persona>
    description: <Persona> seat in a meeting room
    contract_keys: []
    on:
      event:
        type: mrmr.meeting.said
        participant: <persona>   # must match personas.yaml
    type: shell_spawn
    complete: explicit
    prompt: |
      You are the <persona> seat in this Murrmure meeting.
      Pull the transcript with your participant_id. Read `you` and addressed_to_you.
      Convene: one short contribution to the goal if another seat exists. Do not start work or attach files unless the goal names this seat to do that.
      Later: speak or edit only if the chair or the goal asked this seat. Another seat's intro is not a ticket. No artifacts unless asked.
    command: cursor agent --force --approve-mcps --trust {{prompt}}
    continuation:
      command: cursor agent --resume {{continuation_token}} --force --approve-mcps --trust {{prompt}}
      token_field: session_id
      mint_command: cursor agent create-chat
    session:
      mode: persistent
      transport: pty
      shutdown_grace_ms: 5000
    cwd: "{{space_root}}"
```

Also in **that** repo:

1. `.mrmr/space/personas.yaml` with the same persona id.
2. A connection in **that** repo's `.cursor/mcp.json` (`--connection con_…`). One MCP server = one space. Do **not** put `murrmure` in `~/.cursor/mcp.json` — that is a second server with the same name and the wrong space.
3. `event:emit` on that connection (`mrmr connection grant`). Default `local-tools/v1` cannot talk.

You do **not** need a Cursor chat open on that workspace. Convene mints a chat
id and starts the interactive command once. Murrmure owns its PTY until meeting
close; later messages create model turns in that process. **Resume** (or a crash
then a later `said`) starts a replacement with `--resume` of the stored id — the
same Cursor chat, not a blank one. If nothing appears, the handler is missing,
not applied, or `cursor` is not on `PATH`.

Live seats check for control messages every 750 ms. Multiple `said` events for
the same seat between polls—and messages queued while the seat is answering—are
coalesced before the next transcript pull/model turn.
Seats contribute once on convene when another roster seat exists (a one-seat
room stays silent because self-delivery is dropped). They do not start work
or attach files unless the goal names that seat. Later they speak or edit
only if the chair or the goal asked them — another seat's intro is not a
ticket. When they reply they should target the asker,
use `in_reply_to` when useful, and avoid `to: { all: true }` unless every seat
genuinely needs the message.

## Read

Header **Meetings** → `/sessions/:id` **Transcript**. Seats display as
`persona@space` (for example `default@memory`) because persona names are only
space-local. New `said` events refresh Transcript immediately over SSE; an open
room also polls once per second if the stream is reconnecting. Every message
shows local `HH:mm:ss` (full ISO on hover); receipts show Hub delivery latency
and replies show elapsed response time. Message text is Markdown. The header
chevron collapses goal + roster. While the room is open, the human chair can
**Reply** to a turn — that sets `in_reply_to` and targets the sender. Artifact
**Expand** opens a modal; **Reply** threads + cites the `xfr_*`, **Cite**
attaches it without threading. Journal
`/logs` is retrieval, not the chat. **Agent activity** lists every roster
seat and watches that seat’s live PTY in a [wterm](https://wterm.dev)
emulator with the Ghostty VT core (watch-only, 120×40 — same grid as the
seat PTY, so loaders overwrite in place). Close keeps the last output
until the hub restarts.

Transcript carries artifact references (`xfr_*`), not file bytes. The shell
shows a right-hand list of unique attachments; click jumps to the share and
opens a name/size + capped text preview
(`GET /v1/sessions/:id/artifacts/:xfr?preview=1`, same auth as the
transcript). A seat attaches with `murrmure_put_artifact({ content, name })`
(or `path`), then `murrmure_emit_event` `mrmr.meeting.said` with
`artifacts: [xfr_*]`. Hub expands ACL to the roster and the human chair
actor on accept. A recipient calls `murrmure_get_artifact({ transfer_id })`;
the Hub checks ACL and digest, writes a verified copy under
`.mrmr/dev/inbox/{transfer_id}/{name}`, and returns its relative
`local_path`. Meeting-seat grants need `blob:write` for put. Expired
exchange bytes show as removed. The in-shell card is not a PR/diff reviewer.

## Close

Participant chair emits `mrmr.meeting.closed`. A human chair uses the Transcript
composer (`POST /v1/sessions/{id}/meeting/say`) and **Close**. Close asks each
persistent CLI to exit, then terminates any process that exceeds its grace. If a
flow step is bound, the engine resolves that step. Do not also call
`murrmure_resolve_step` on the room.

See [Meetings spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/meetings/spec.md) and [MCP tools](../reference/mcp-tools).
