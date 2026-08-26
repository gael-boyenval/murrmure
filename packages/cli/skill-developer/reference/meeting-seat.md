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
      Know the goal and what was asked of you. If asked to do work, do it this turn.
      On convene, contribute once if another seat exists.
      Stay silent later only when nothing new was asked of you.
    command: cursor agent --force --approve-mcps --trust {{prompt}}
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

`cursor` must be on `PATH`. No Cursor chat needs to be open. Convene starts the
interactive command once in a PTY (`{{prompt}}` is the first-turn argument).
The process stays alive until meeting close. Later `said` writes the next turn
into that PTY; Murrmure does not restart it or use `cursor agent --resume`.

To attach a file: `murrmure_put_artifact({ content, name })` (or `path`), then
`murrmure_emit_event` `mrmr.meeting.said` with `artifacts: [xfr_*]`. If
Transcript contains `xfr_*`, the seat calls `murrmure_get_artifact` and
reads the returned `artifact.local_path` relative to `space_root`. The tool
materializes only ACL-authorized artifacts into this space's `.mrmr/dev/inbox/`;
never pass or guess another space's filesystem path. `blob:write` is required
to put.

## 4. Do not

- Do not use `type: mcp_session` for the seat
- Do not combine persistent `session` with `continuation` or `timeout_ms`
- Do not add a talk flow
- Do not call `murrmure_resolve_step` for the room
- Do not wait for the operator to ask an open chat to poll
