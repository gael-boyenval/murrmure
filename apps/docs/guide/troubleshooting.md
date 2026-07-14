# Troubleshooting

Fix issues in **Murrmure Desktop** and **MCP** first — not with curl.

For deferred product surface, see **[Known gaps](./known-gaps)** first.

## Denial code → fix

| Code / symptom | Fix |
|----------------|-----|
| Revoked connection / 401 / 403 | `mrmr connection rotate con_… --space spc_…`, reinstall contexts, reload |
| `TOOL_NOT_AUTHORIZED` | `mrmr space apply`; connection needs `tutorial-builder/v1` or explicit advanced capabilities |
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
| `TOKEN_STEP_SCOPE_MISMATCH` (403) on `mrmr step resolve` | The dispatch token is not scoped to this step (or has expired/been revoked). Re-dispatch the step; the token is run/step-scoped and revoked when the step/run ends or the hub shuts down. |
| `ACTION_TIMED_OUT` | The command exceeded `timeout_ms`. Raise `timeout_ms` for slow scripts, or fix a hanging child — the runtime terminates the whole process group (SIGTERM → 5s → SIGKILL). |
| `SHELL_EXIT_NONZERO` | The script exited nonzero. Read `stderr` in the run journal; `/bin/sh -e -c` stops at the first failing command. |

## MCP tools not showing in Cursor

1. Reload the selected integration context after `mrmr connection create`
2. Confirm `~/.murrmure/bin/murrmure-mcp` exists and is executable
3. Relaunch Desktop to refresh stale bundle discovery after a move or upgrade
4. Unlock macOS Keychain if credential lookup is blocked
5. Run **`mrmr space doctor`** to distinguish launcher, discovery, credential, revocation/association, and Hub failures

Do not add `MURRMURE_HUB_TOKEN` to local MCP configuration. Local mode fails
closed and reads the credential by Hub + connection ID from Keychain. Runtime
environment injection is only for explicit headless CI mode.

## Desktop: can't see a space

- Token scoped to space (bootstrap works for first-run admin)
- **`mrmr space list`** / **`mrmr space member list`**

## CLI: `mrmr login` fails

- Bootstrap token on first login: `mrmr login --hub-url http://127.0.0.1:8787`

## Hub won't start (contributors)

- Port in use — change `PORT` or close other Desktop instance
- Lock held — one hub per `~/.murrmure` data dir

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
