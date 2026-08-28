# Meeting seat (this space)

A space does **not** join a meeting until it has a `shell_spawn` handler on
`mrmr.meeting.said`. Skills alone do nothing. `mcp_session` is the wrong type —
that only pokes an already-open chat.

If the human asks this repo to sit in a room, do this **here**, then apply.

## 1. Persona

`.mrmr/space/personas.yaml` — `id` is the seat name:

```yaml
version: 1
personas:
  - id: default
    summary: Seat for this space in Murrmure meetings
```

Use an existing persona id if the space already has one.

## 2. Handler (`type: shell_spawn` required)

Append to `.mrmr/space/handlers.yaml`. `participant` **must** match the persona id.

```yaml
  - id: meeting-default
    description: Meeting seat for this space
    contract_keys: []
    on:
      event:
        type: mrmr.meeting.said
        participant: default
    type: shell_spawn
    complete: explicit
    prompt: |
      You are the default seat in this Murrmure meeting.
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

`complete: auto` on a said handler is rejected (`MEETING_HANDLER_COMPLETE_AUTO`).

## 3. Apply and grant

```bash
mrmr space apply --strict
mrmr connection grant --space spc_… \
  --capabilities=space:read,flow:read,flow:run,step:resolve,event:emit,journal:read,blob:write,blob:read
```

`cursor` must be on `PATH`. No Cursor chat needs to be open. Convene mints a
chat id (`mint_command`) then starts the interactive command in a PTY
(`{{prompt}}` is the first-turn argument). The process stays alive until
meeting close. Later `said` writes the next turn into that PTY. Close or crash
starts a replacement with `--resume` of the stored id — not `--continue`.

To attach a file: `murrmure_put_artifact({ content, name })` (or `path`), then
`murrmure_emit_event` `mrmr.meeting.said` with `artifacts: [xfr_*]`. If
Transcript contains `xfr_*`, the seat calls `murrmure_get_artifact` and
reads the returned `artifact.local_path` relative to `space_root`. The tool
materializes only ACL-authorized artifacts into this space's `.mrmr/dev/inbox/`;
never pass or guess another space's filesystem path. `blob:write` is required
to put.

## 4. Do not

- Do not use `type: mcp_session` for the seat
- Do not combine persistent `session` with `timeout_ms`
- Do not use `cursor agent --continue` (global last chat). Token is per seat.
- Do not add a talk flow
- Do not call `murrmure_resolve_step` for the room
- Do not wait for the operator to ask an open chat to poll
- Do not treat another seat's intro as a work ticket
- Do not attach artifacts unless the chair or the goal asked
