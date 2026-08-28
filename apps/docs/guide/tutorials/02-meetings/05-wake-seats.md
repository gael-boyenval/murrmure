# Part 5 — Wake a seat

**Concept:** **Convene starts** one interactive `cursor agent` process per seat.
That process and its MCP connection stay alive until meeting close. Later `said`
messages create turns in the same process—no spawn-per-message. Close or crash
starts a replacement with `--resume` of a minted chat id, so Resume is the same
Cursor chat. A seat contributes once on convene and stays silent later unless the
chair or the goal asked that seat. `personas.yaml` does not wake anyone. `type: shell_spawn` +
`session.mode: persistent` + `continuation` is the seat.

## Before you start

Part 4 closed run is done. Each invited repo has the Murrmure server in **that** folder’s `.cursor/mcp.json`. You do not need those chats sitting open.

## Step 1 — Grants (spawned agent must talk)

1a connections are `local-tools/v1` (`space:read`, `flow:read`, `flow:run`, `step:resolve`). Talking needs more.

In **each** folder (paste that space’s `spc_…`):

```bash
mrmr connection grant --space spc_… \
  --capabilities=space:read,flow:read,flow:run,step:resolve,event:emit,journal:read,blob:write,blob:read
```

The spawned `cursor agent` uses that connection. Default grants cannot `said`.

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
    type: shell_spawn
    complete: explicit
    prompt: |
      You are the researcher seat in this meeting.
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
    type: shell_spawn
    complete: explicit
    prompt: |
      You are the researcher seat in this meeting.
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
    type: shell_spawn
    complete: explicit
    prompt: |
      You are the designer seat in this meeting.
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

  - id: meeting-qa
    on:
      event:
        type: mrmr.meeting.said
        participant: qa
    type: shell_spawn
    complete: explicit
    prompt: |
      You are the QA seat in this meeting.
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

```bash
cd ~/work/meeting-app && mrmr space apply --strict
```

Platform types `mrmr.meeting.said` / `mrmr.meeting.closed` do **not** need `events.yaml`.

`contract_keys` stays empty (event handler). This is not 1a `dev_build`.

## Step 4 — What the spawned agent will contain

The protocol block is **`Protocol: murrmure.meeting/v1`** (not the step envelope that orders `murrmure_resolve_step`). It has:

- `session_id`, `participant_id`, `trigger` (`convened` or `said`), `since_seq` (0 on first join)

It **MUST NOT** contain prior message bodies. If the spawn prompt is a wall of chat, the product is wrong — do not “fix” it by pasting more into `prompt:`.

**Same room, same process:** convene starts `cursor agent` on the `ses_*` in a
runtime-owned PTY. The first prompt is a command argument so the CLI starts a
real turn. Later `said` writes the next turn into that PTY after the process
goes idle. This is not `pending-wake.json` and not an operator chat.

## Step 5 — Run, then watch the spawn

Desktop: **Run** `api-shape` again. Transcript open, 3 seats, 0 messages. Convene should spawn each seat that has a handler.

To address **one** seat (designer → researcher), emit from any granted client:

1. `murrmure_meeting_transcript` for this `ses_…`
2. `murrmure_emit_event` with `event_type: mrmr.meeting.said`, top-level `session_id`, and `payload`: `as_participant_id` = designer’s `ptc_*`, `to: { participant_ids: [researcher ptc_*] }`, `text: Need the last latency study.`
3. Do **not** `murrmure_resolve_step` on `decide`
4. Do **not** close

You should see in Desktop:

- One message: designer → researcher
- Receipt: researcher **delivered** (or **failed** + reason — then troubleshooting)
- The original researcher process creating its next turn (not an operator chat)
- QA idle / not working if `to` omitted qa
- Human-chair composer remains available

## Step 6 — Researcher replies (continued seat)

The researcher spawn already has trigger + `since_seq`. That agent:

1. `murrmure_meeting_transcript` with that `since_seq` (not 0 if the tool returned a cursor)
2. `murrmure_emit_event` `mrmr.meeting.said` as researcher → `{ participant_ids: [designer ptc] }` (qa **not** in the list)
3. Text: a one-line recommendation. **No artifact yet** (Part 6)
4. Do not close

You should see: second message, one receipt (designer). QA still not woken. Same
`ses_…` as Step 5. Designer `said` creates a turn in the designer seat's
already-running process.

## Step 7 — Human Close again

Chair is still human. Close. Run succeeds. Same as Part 4, but the transcript has two messages. Historical read works.

## Why `shell_spawn`

An event that only writes `pending-wake.json` or calls `createMessage` on an
unrelated open chat is not a wake. The operator should not have to ask a chat
to answer. One PTY process owns the seat lifecycle until meeting close.

## This is not `query_ask`

Typed ask/answer with a schema is the other protocol. An ask here is just `said` with a `to`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `PERSONA_HANDLER_UNSCOPED` | Missing `participant` | Step 2 |
| `NO_HANDLER` / no wake | Wrong persona id / not applied | Match `designer` / `qa` / `researcher` |
| Nothing spawned | Handler still `mcp_session`, or `cursor` not on `PATH` | Use the Step 3 YAML; apply; check Desktop hub logs |
| `EXECUTOR_UNAVAILABLE` | Spawn failed | Command / cwd / `cursor` on PATH |
| Every message starts another process | Missing persistent `session` | Copy the `session` block; remove `timeout_ms`. Keep `continuation` for Resume. |
| `PERSISTENT_SESSION_EXITED` | Cursor process crashed/exited before close | Read PTY output and exit reason; the next targeted message starts a replacement with `--resume` of the stored chat id |
| Second `ses_…` on reply | Attach bug (product) or agent omitted `session_id` | Emit **must** carry meeting `session_id` |
| Agent calls `resolve_step` on `decide` | 1a habit | Close is `closed` / human Close |
| QA woke | `to` was `all` or included qa | Use researcher’s `ptc_*` only |
| `TOOL_NOT_AUTHORIZED` | Grant not on the spawned connection | Step 1 |
| `PARTICIPANT_AMBIGUOUS` | App token omitted `as_participant_id` | App has two seats — always pass designer’s `ptc_*` |
| Transcript in the spawn prompt | Product / prompt author error | Thin block only; pull |

## Checkpoint

- [ ] Grants include `event:emit` and `journal:read` on both connections
- [ ] Unscoped research handler failed apply; scoped one succeeded
- [ ] Convene starts researcher once; later designer `said` reuses it; QA idle
- [ ] Researcher replied to designer only; same `ses_…`
- [ ] Human Close; transcript has two messages

## Next

[Part 6 — Close the room so the flow can continue →](./06-talk-and-advance)
