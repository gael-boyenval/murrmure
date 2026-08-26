# @murrmure/executors

## Unreleased

### Changed

- Handler prompt templates bind one level of nested invoke params
  (`{{input.prompt}}` from `params.input.prompt`).
- Spawned meeting seats get `Protocol: murrmure.meeting/v1` in the prompt
  (session_id, participant_id, trigger, since_seq). No step-resolve contract.
- Meeting `shell_spawn` dispatch detaches after process start. This lets the
  hub register the live seat before the agent emits its first `said`, avoiding
  recursive duplicate spawns and slow convene responses.
- Meeting handlers may define a harness-owned continuation command, stdout
  token field, and optional `mint_command`. The executor persists the opaque
  token per `ses_*` / `ptc_*` / handler. Persistent seats mint (or reuse) that
  token and start the PTY with `continuation.command` (`--resume`); later
  `said` still writes into the live process.
- Persistent `shell_spawn` sessions run one interactive PTY process for the
  assignment. First turn is the `{{prompt}}` argument. Later turns are written
  to the PTY after idle and submitted with Enter. Close is Ctrl-D →
  process-group TERM/KILL. The controller exposes `snapshot` / `subscribe`
  for a watch-only operator pane.
- Meeting shells export their exact session and roster participant to the child
  bridge, and do not masquerade as step-scoped assignment MCP processes.

## 0.1.1

### Patch Changes

- @murrmure/hub-core@0.1.2
