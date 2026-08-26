# Directive handler (this space)

A space does **not** appear under header **New directive** until it binds
`step.opened::directive.execute`. Do not copy a flow manifest. The hub owns
`flw_mrmr_directive` and indexes it only when this handler is present.

One-shot print mode (`cursor agent -p`). Not a persistent PTY seat.

If the human asks this repo to accept directives, do this **here**, then apply.

## Handler

Append to `.mrmr/space/handlers.yaml`:

```yaml
  - id: directive
    contract_keys: [directive.execute]
    on: step.opened::directive.execute
    type: shell_spawn
    complete: explicit
    prompt: |
      {{input.prompt}}
    command: cursor agent -p --force --approve-mcps --trust --output-format stream-json --stream-partial-output {{prompt}}
    timeout_ms: 3600000
    cwd: "{{space_root}}"
```

`timeout_ms: 3600000` is required. The runtime default is 30s.

Hub interpolates `{{input.prompt}}` and appends `Protocol: murrmure.agent/v1`.
Resolve `completed` or `failed` with `{ message }` via `murrmure_resolve_step`.
The process exits when the agent finishes — no `session.mode: persistent`.

Then `mrmr space apply --strict`.

## Start

Operator chrome: **New directive** → prompt → pick eligible spaces → one
`POST /v1/flows/flw_mrmr_directive/run` per space. Results stay in the dialog
(lifecycle + message + session link). Not a meeting. No Transcript.

Admin MCP (`hub:admin` on the connection; default `local-tools/v1` does not
see these tools):

1. `murrmure_list_directive_eligible` — opted-in spaces
2. `murrmure_start_directive` with `{ prompt, space_ids? }` — omit `space_ids`
   to fan out to every currently eligible space
