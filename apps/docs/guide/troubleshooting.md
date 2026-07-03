# Troubleshooting

Fix issues in **Murrmure Desktop** and **MCP** first — not with curl.

For deferred product surface, see **[Known gaps](./known-gaps)** first.

## Denial code → fix

| Code / symptom | Fix |
|----------------|-----|
| Invalid token / 403 | `mrmr grant revoke` + `mrmr grant mint`; check `MURRMURE_SPACE_ID` |
| `TOOL_NOT_AUTHORIZED` | `mrmr space apply`; grant needs `flow:run` / correct capabilities |
| Indexed flow missing | `mrmr space status --space spc_…`; re-link path; `mrmr space apply --strict` |
| Checkpoint shows shell form not view | Rebuild view `dist/`; strict apply |
| `wait_for_gate` times out | Human must resolve checkpoint in **ViewCanvasHost** |
| Trigger did not wake agent | Confirm `hooks.yaml` + apply; check delivery log |
| Cross-space `QUERY_POLICY_DENIED` | Fix inbound allowlist on target space |

## MCP tools not showing in Cursor

1. Reload Cursor after pasting MCP config
2. Confirm `murrmure` or `npx @murrmure/cli` is on PATH
3. Env: **`MURRMURE_HUB_URL`**, **`MURRMURE_HUB_TOKEN`**, **`MURRMURE_SPACE_ID`**
4. Check MCP logs in Cursor settings
5. Run **`mrmr space doctor`** for drift hints

## Desktop: can't see a space

- Token scoped to space (bootstrap works for first-run admin)
- **`mrmr space list`** / **`mrmr space member list`**

## CLI: `mrmr login` fails

- Bootstrap token on first login: `mrmr login --hub-url http://127.0.0.1:8787`

## Hub won't start (contributors)

- Port in use — change `PORT` or close other Desktop instance
- Lock held — one hub per `~/.murrmure` data dir

## Agent workflow help

Install the **murrmure** skill:

```bash
mrmr skill install
```

Reload Cursor. Skill reference covers `space apply`, checkpoints, hooks — not worker install.

## Still stuck?

- **`mrmr doctor`** + **`mrmr space doctor`**
- Export audit JSONL; include `space_id` and timestamp when asking for help

## Related

- [Known gaps](./known-gaps)
- [Connect your agent](./agents-mcp)
