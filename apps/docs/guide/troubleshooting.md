# Troubleshooting

Fix issues in **Murrmure Desktop** and **MCP** first — not with curl.

For deferred product surface, see **[Known gaps](./known-gaps)** first.

## Denial code → fix

| Code / symptom | Fix |
|----------------|-----|
| Revoked connection / 401 / 403 | `mrmr connection rotate con_… --space spc_…`, reinstall contexts, reload |
| `TOOL_NOT_AUTHORIZED` | `mrmr space apply`; connection needs `local-tools/v1` or explicit advanced capabilities |
| Indexed flow missing | `mrmr space status --space spc_…`; re-link path; `mrmr space apply --strict` |
| Checkpoint shows no view (observability-only) | Rebuild view `dist/`; strict-apply so the `view_resolver` binds the step |
| `murrmure_wait_for_run` times out | Human must resolve checkpoint in **ViewCanvasHost** |
| `CONTRACT_VALIDATION_FAILED` on submit | Read each `{ source, path, rule }`; payload fields and selected-branch file slots are validated independently |
| `ARTIFACT_QUOTA_EXCEEDED` | Reduce file/count/total size; fixed ceilings are 25 MiB/file, 50 MiB/resolution, 250 MiB/run, 2 GiB/space |
| Upload cancelled or expired | The step remains open; reselect files and submit again. Uncommitted uploads expire after one idle hour |
| Handler not dispatched | Check the `on::key` binding (`on: step.opened::{flow}.{step}`) in `handlers.yaml`; `mrmr space doctor` |
| `contract_key` mismatch | `contract_keys` is prompt-scope only; binding uses `on::key` — align the alias with the StepContractCatalog step id |
| Missing `handlers.yaml` entry | Add handler for dispatched step; re-apply |
| Trigger did not wake agent | Confirm event handler in `handlers.yaml` + apply; check delivery log |
| Cross-space `QUERY_POLICY_DENIED` | Fix inbound allowlist on target space |
| `FLOW_CONCURRENCY_LIMIT` (409) | The flow already has `max_concurrent_runs` non-terminal runs in this space. Wait for an active run to terminate (or cancel it), then retry — the retry performs a fresh admission check. The denial lists the active blocking run IDs. |
| `SPACE_HAS_ACTIVE_RUNS` (409) on `mrmr space apply` | An apply cannot swap a space's configuration while a non-terminal run depends on it. Wait for all runs to terminate (or cancel them), then re-apply; the prior index is preserved. No partial replacement is visible. |
| `RUN_POLICY_UNKNOWN_FLOW` / `RUN_POLICY_AMBIGUOUS_FLOW` / `RUN_POLICY_DUPLICATE` (apply) | A `run_policies.flow` alias does not match exactly one applied flow name. Fix the alias in `handlers.yaml` to match the applied flow's `name`, then re-apply. |
| `HANDLER_BINDING_VALUE_MISSING` (before spawn) | A placeholder in `command` has no binding or is null. Bind the value (or fix the token) and re-apply; a missing artifact slot means the producer step did not submit it. |
| `HANDLER_PLACEHOLDER_QUOTED` / `HANDLER_PLACEHOLDER_EMBEDDED` / `HANDLER_UNKNOWN_PLACEHOLDER` (before spawn) | A placeholder must be one complete unquoted argument. Remove author quotes (`'{{x}}'`), split embedded forms (`--flag={{x}}` → `--flag {{x}}`), and confirm the token key exists. |
| `ARTIFACT_DIGEST_MISMATCH` / `ARTIFACT_PATH_TRAVERSAL` / `ARTIFACT_SOURCE_NOT_FOUND` / `ARTIFACT_SOURCE_NOT_FILE` / `ARTIFACT_COPY_FAILED` (before spawn) | The producer artifact changed after submission, the source is missing/not a regular file/is a symlink, or the source escapes the run scratch tree. Re-submit the artifact on the producer step; the consumer copy is digest-verified and symlink-hardened. |
| `TOKEN_STEP_SCOPE_MISMATCH` / `TOKEN_RUN_SCOPE_MISMATCH` (403) on `mrmr step resolve` or an upload intent | The dispatch token is not scoped to this run/step (or has expired/been revoked). The assignment boundary is enforced on every `step:resolve` endpoint — resolve, upload-intent creation, file transfer, and abandon — so a handler token cannot act for another run, step, or space. Re-dispatch the step; the token is run/step/handler-scoped and revoked when the step/run ends or the hub shuts down. |
| `scope_enforcement_failure` (403) on an upload intent | A handler token minted for one space was used against a run in another space. Re-dispatch the step in its own space; grant tokens carry only the space boundary. |
| `ACTION_TIMED_OUT` | The command exceeded `timeout_ms`. Raise `timeout_ms` for slow scripts, or fix a hanging child — the runtime terminates the whole process group once (SIGTERM → 5s → SIGKILL) and shutdown awaits that escalation so no descendant outlives the hub. |
| `SHELL_EXIT_NONZERO` | The script exited nonzero. Read `stderr` in the run journal; `/bin/sh -e -c` stops at the first failing command. |
| Every meeting message starts another Cursor process | Re-apply the seat with `session: { mode: persistent, transport: pty }`; remove `timeout_ms`. Convene should create one process for the room. `continuation` is for the next process after close/crash, not per-message. |
| Resume opens a blank Cursor chat | Seat has no stored token / no `mint_command`. Re-apply the stock recipe (`continuation.mint_command: cursor agent create-chat`), then convene or resume once so the id is minted. |
| `PERSISTENT_SESSION_EXITED` / later receipt fails after Cursor exits | Read the recorded exit code/signal and PTY output. Unexpected exit revokes the live seat; the next targeted message may start one replacement assignment. |
| Meeting goes quiet after `desktop:dev:hmr` / hub watch restart | Hub boot now respawns open-room seats with the stored continuation token. Reload the Transcript if the pane looks stale; SSE reconnect also refetches. |
| `HUB_RESTART_ORPHANED` / run stuck `working` after hub restart | One-shot handlers (directives, flow steps) are marked failed so **Retry** works. Gates (`input-required`) and a flow run bound to an open meeting stay. Do not expect the killed `cursor agent -p` process to continue. |
| Meeting will not close / persistent Cursor remains | Update the Hub. Close sends Ctrl-D, waits `shutdown_grace_ms`, then escalates through process-group SIGTERM/SIGKILL. |
| `desktop:dev:hmr` prints repeated Hub proxy `ECONNREFUSED` | Read the first daemon error above. The supervisor allows a 5s watch restart, then stops shell/Desktop so proxy noise cannot continue indefinitely. Fix the daemon error and restart the dev stack. |
| Hub exits before listen: `env file missing` | `MURRMURE_ENV_FILE` is set but the path does not exist. Unset it to use the default `<workspace-root>/.env.local` (missing default is skipped), or create the file and `chmod 600`. |
| Hub exits before listen: `env file must be owner-only` | `chmod 600` the private env file. Group or world bits are rejected. |
| Hub exits before listen: `env file must not be a symlink` | Point at a regular file. Symlinks are rejected. |
| Hub exits before listen: `env file malformed at path:line` | Fix the KEY=VALUE line (optional `export`, `#` comments, quotes). The diagnostic has path, line, and reason — never the line text or values. |
| Fans/CPU pegged after closing `desktop:dev:hmr` / hub watch | Leftover `bun …/memory/src/mcp/index.ts` children. Hub now reaps them on stop and before re-spawn; the HMR orchestrator also `pkill`s that pattern on start and shutdown. If an old build leaked, `pkill -f 'memory/src/mcp/index.ts'`. |

## MCP tools not showing in Cursor

Cursor shows **0 tools** when it rejects `tools/list` — every tool
`inputSchema` must have `type: "object"`. A bare `oneOf` (used by
`murrmure_emit_event` when several events are emittable) is dropped and the
whole catalog disappears. Reload the Murrmure server after a hub update.

Then:

1. Reload the selected integration context after `mrmr connection create`
2. Confirm `~/.murrmure/bin/murrmure-mcp` exists and is executable
3. Relaunch Desktop to refresh stale bundle discovery after a move or upgrade
4. Unlock macOS Keychain if credential lookup is blocked
5. Run **`mrmr space doctor`** to distinguish launcher, discovery, credential, revocation/association, schema, and Hub failures

Do not add `MURRMURE_HUB_TOKEN` to local MCP configuration. Local mode fails
closed and reads the credential by Hub + connection ID from Keychain. Runtime
environment injection is only for explicit headless CI mode.

## Plane MCP (spawned seats)

| Symptom | Fix |
|---------|-----|
| Plane tools 401 / unauthorized | Hub process has no `PLANE_PAT`. Put the token in the GBD-29 hub-private `.env.local` (`chmod 600`), restart the hub, spawn a **new** seat. Confirm `.cursor/mcp.json` uses `Bearer ${env:PLANE_PAT}` — not a pasted secret. |
| Tools missing workspace / wrong workspace | Header `x-workspace-slug` must be `gbworks` on the PAT endpoint. |
| Headless seat cannot finish Plane login | Interactive OAuth URL (`https://mcp.plane.so/http/mcp`) does not work for spawned agents. Use `https://mcp.plane.so/http/api-key/mcp` in **project** `.cursor/mcp.json`. |
| Plane server present but tools never approved | Seat command must include `--approve-mcps`. Reload MCP or start a new `cursor agent` after changing `mcp.json`. |
| Token looks leaked | `rg -n 'PLANE_PAT='` must not show a real value in the repo. Revoke the PAT in Plane, rotate `.env.local`, restart the hub. |

See [Plane MCP for spawned seats](./agents-mcp.md#plane-mcp-for-spawned-seats).

## Desktop: can't see a space

- Token scoped to space (bootstrap works for first-run admin)
- **`mrmr space list`** / **`mrmr space member list`**

## CLI: `mrmr login` fails

- Bootstrap token on first login: `mrmr login --hub-url http://127.0.0.1:8787`

## Hub won't start (contributors)

- Port in use — change `PORT` or close other Desktop instance
- Lock held — one hub per `~/.murrmure` data dir
- Private env file — missing override, group/world permissions, symlink, or a bad `KEY=VALUE` line fail before listen (see table). A missing default `.env.local` is skipped. Restart the hub after editing the file.

## Earlier development state appears after the clean-state cutover

There is intentionally no upgrade reader or seed migration. Quit Desktop and
move the old local state aside once:

```bash
mv ~/.murrmure ~/.murrmure.pre-tutorial-v3-$(date +%Y%m%d-%H%M%S)
```

Relaunch Desktop. The new data directory starts with zero spaces, persisted
contracts, and flows. The backup remains available for manual inspection.

## Agent workflow help

Install the split runtime skills:

```bash
mrmr skill install --variant all
```

Worker-only spaces can install only `murrmure-agent` with `mrmr skill install --variant agent`.

## Still stuck?

- **`mrmr doctor`** + **`mrmr space doctor`**
- Export audit JSONL; include `space_id` and timestamp when asking for help

## Related

- [Known gaps](./known-gaps)
- [Space handlers](./space-handlers)
- [Connect your agent](./agents-mcp)
