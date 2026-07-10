# Troubleshooting

Fix issues in **Murrmure Desktop** and **MCP** first — not with curl.

For deferred product surface, see **[Known gaps](./known-gaps)** first.

## Denial code → fix

| Code / symptom | Fix |
|----------------|-----|
| Invalid token / 403 | `mrmr grant revoke` + `mrmr grant mint` + `mrmr grant use --space ...` |
| `TOOL_NOT_AUTHORIZED` | `mrmr space apply`; grant needs `flow:run` / `step:resolve` / correct capabilities |
| Indexed flow missing | `mrmr space status --space spc_…`; re-link path; `mrmr space apply --strict` |
| Checkpoint shows shell form not view | Rebuild view `dist/`; strict apply |
| `murrmure_wait_for_run` times out | Human must resolve checkpoint in **ViewCanvasHost** |
| Handler not dispatched | Check `contract_keys` in `handlers.yaml`; `mrmr space doctor` |
| `contract_key` mismatch | Align handler keys with StepContractCatalog step ids |
| Missing `handlers.yaml` entry | Add handler for dispatched step; re-apply |
| Trigger did not wake agent | Confirm event handler in `handlers.yaml` + apply; check delivery log |
| Cross-space `QUERY_POLICY_DENIED` | Fix inbound allowlist on target space |

## MCP tools not showing in Cursor

1. Reload Cursor after pasting MCP config
2. Confirm `murrmure-mcp` is on PATH (`npm i -g @murrmure/mcp-bridge`)
3. Env: **`MURRMURE_HUB_TOKEN`** exported in the same shell used to launch your IDE
4. Check MCP logs in Cursor settings
5. Run **`mrmr space doctor`** for handler coverage and drift hints

## Desktop: can't see a space

- Token scoped to space (bootstrap works for first-run admin)
- **`mrmr space list`** / **`mrmr space member list`**

## CLI: `mrmr login` fails

- Bootstrap token on first login: `mrmr login --hub-url http://127.0.0.1:8787`

## Hub won't start (contributors)

- Port in use — change `PORT` or close other Desktop instance
- Lock held — one hub per `~/.murrmure` data dir

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
