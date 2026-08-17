# Part 5 — Wake a seat

**Concept:** When someone `said` to a seat, the hub notifies **that** seat’s handler. `personas.yaml` does not wake anyone. `type: mcp_session` keeps one assignment for the room (`complete: explicit`). Later `said` reuses that live assignment via `murrmure/control.meeting_said` (`notify_live`) — not a new session and not `pending-wake.json`.

## Before you start

Part 4 closed run is done. Both agent chats still open; `murrmure_space_status` still matches the [workspace card](./01-two-spaces#fill-the-workspace-card).

## Step 1 — Grants (new MCP surface)

1a connections are `local-tools/v1` (`space:read`, `flow:read`, `flow:run`, `step:resolve`). Talking needs more.

In **each** folder (paste that space’s `spc_…`):

```bash
mrmr connection grant --space spc_… \
  --capabilities=space:read,flow:read,flow:run,step:resolve,event:emit,journal:read
```

Reload both tools. Chat A should see `murrmure_emit_event` and `murrmure_meeting_transcript`. Chat B the same.

Do **not** grant raw god-mode. Do **not** use `query_ask` for this story.

## Step 2 — Fail apply on purpose (unscoped handler)

In `meeting-research` only, replace empty handlers with:

```yaml
version: 1
handlers:
  - id: meeting-researcher
    on:
      event:
        type: mrmr.meeting.said
        # participant omitted on purpose
    type: mcp_session
    complete: explicit
    prompt: |
      You are the researcher seat in this meeting.
      Pull the transcript if you need prior turns. Do not dump the journal.
```

`mrmr space apply --strict` → **`PERSONA_HANDLER_UNSCOPED`**.

Then add `participant: researcher` under `event:`. Re-apply — success.

The **fixed** file:

<!-- tutorial-meetings-fence:part-5-research-handlers -->
```yaml
version: 1
handlers:
  - id: meeting-researcher
    on:
      event:
        type: mrmr.meeting.said
        participant: researcher
    type: mcp_session
    complete: explicit
    prompt: |
      You are the researcher seat in this meeting.
      Pull the transcript if you need prior turns. Do not dump the journal.
```

## Step 3 — App handlers (two voices)

Replace empty handlers in `meeting-app`:

<!-- tutorial-meetings-fence:part-5-app-handlers -->
```yaml
version: 1
handlers:
  - id: meeting-designer
    on:
      event:
        type: mrmr.meeting.said
        participant: designer
    type: mcp_session
    complete: explicit
    prompt: |
      You are the designer seat in this meeting.
      Pull the transcript if you need prior turns. Do not dump the journal.

  - id: meeting-qa
    on:
      event:
        type: mrmr.meeting.said
        participant: qa
    type: mcp_session
    complete: explicit
    prompt: |
      You are the QA seat in this meeting.
      Pull the transcript if you need prior turns. Do not dump the journal.
```

```bash
cd ~/work/meeting-app && mrmr space apply --strict
```

Platform types `mrmr.meeting.said` / `mrmr.meeting.closed` do **not** need `events.yaml`.

`contract_keys` stays empty (event handler). This is not 1a `dev_build`.

## Step 4 — What the assignment will contain

When a seat is first notified, the protocol block is **`Protocol: murrmure.meeting/v1`** (not the step envelope that orders `murrmure_resolve_step`). It has:

- `session_id`, `participant_id`, triggering `message_id`, `since_seq` (0 on first join)

It **MUST NOT** contain prior message bodies. If the reader’s agent prompt is a wall of chat, the product is wrong — do not “fix” it by pasting more into `prompt:`.

**Join-once:** the first `said` to a seat starts one long-lived `mcp_session` assignment. A later `said` to that same live seat publishes `murrmure/control.meeting_said` (`notify_live`) on **that** assignment — same `ses_*`, no second spawn, not `pending-wake.json`.

## Step 5 — Run, then speak as designer (you drive chat A)

Desktop: **Run** `api-shape` again. Transcript open, 3 seats, 0 messages.

In **chat A** (app), fill live ids from Transcript / `murrmure_meeting_transcript`:

1. `murrmure_meeting_transcript` for this `ses_…`
2. `murrmure_emit_event` with `event_type: mrmr.meeting.said`, top-level `session_id`, and `payload`: `as_participant_id` = designer’s `ptc_*`, `to: { participant_ids: [researcher ptc_*] }`, `text: Need the last latency study.`
3. Do **not** `murrmure_resolve_step` on `decide`
4. Do **not** close

You should see in Desktop:

- One message: designer → researcher
- Receipt: researcher **delivered** (or **failed** + reason — then troubleshooting)
- Researcher seat **working** if chat B is live
- QA idle / not working
- Still **no compose box**

## Step 6 — Researcher replies (chat B)

Wake in chat B should already have trigger + `since_seq`. Task:

1. `murrmure_meeting_transcript` with that `since_seq` (not 0 if the tool returned a cursor)
2. `murrmure_emit_event` `mrmr.meeting.said` as researcher → `{ participant_ids: [designer ptc] }` (qa **not** in the list)
3. Text: a one-line recommendation. **No artifact yet** (Part 6)
4. Do not close

You should see: second message, one receipt (designer). QA still not woken. Same `ses_…` as Step 5.

## Step 7 — Human Close again

Chair is still human. Close. Run succeeds. Same as Part 4, but the transcript has two messages. Historical read works.

## Why not `shell_spawn`

A new `cursor agent -p` per `said` is an empty brain. If `mcp_session` is `EXECUTOR_UNAVAILABLE`, fix the live chat — do not rewrite the handler to 1a’s spawn command.

## This is not `query_ask`

Typed ask/answer with a schema is the other protocol. An ask here is just `said` with a `to`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `PERSONA_HANDLER_UNSCOPED` | Missing `participant` | Step 2 |
| `NO_HANDLER` / no wake | Wrong persona id / not applied | Match `designer` / `qa` / `researcher` |
| `EXECUTOR_UNAVAILABLE` | Chat B not live | Status in that folder; reload MCP |
| Second `ses_…` on reply | Attach bug (product) or agent omitted `session_id` | Emit **must** carry meeting `session_id` |
| Agent calls `resolve_step` on `decide` | 1a habit | Close is `closed` / human Close |
| QA woke | `to` was `all` or included qa | Use researcher’s `ptc_*` only |
| `TOOL_NOT_AUTHORIZED` | Grant not reloaded | Step 1 |
| `PARTICIPANT_AMBIGUOUS` | App token omitted `as_participant_id` | App has two seats — always pass designer’s `ptc_*` |
| Transcript in the spawn prompt | Product / prompt author error | Thin block only; pull |
| New assignment on second `said` | Host gone, or notify dropped | Live seat must stay on `mcp_session`; later turns are `murrmure/control.meeting_said` |

## Checkpoint

- [ ] Grants include `event:emit` and `journal:read` on both connections
- [ ] Unscoped research handler failed apply; scoped one succeeded
- [ ] Designer `said` → researcher delivered; QA idle
- [ ] Researcher replied to designer only; same `ses_…`
- [ ] Human Close; transcript has two messages

## Next

[Part 6 — Close the room so the flow can continue →](./06-talk-and-advance)
