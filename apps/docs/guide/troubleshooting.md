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
| Handler not dispatched | Check the `on::key` binding (`on: step.opened::{flow}.{step}`) in `handlers.yaml`; `mrmr space doctor` |
| `contract_key` mismatch | `contract_keys` is prompt-scope only; binding uses `on::key` — align the alias with the StepContractCatalog step id |
| Missing `handlers.yaml` entry | Add handler for dispatched step; re-apply |
| Trigger did not wake agent | Confirm event handler in `handlers.yaml` + apply; check delivery log |
| Cross-space `QUERY_POLICY_DENIED` | Fix inbound allowlist on target space |

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
