# Environment variables

Desktop users usually do not set env vars manually (bootstrap is automatic). This page is for CLI operators, MCP agent operators, and CI.

## MCP agent env (token only)

Thin MCP config uses `command: "murrmure-mcp"` and one env reference:

| Variable | Required | Description |
|----------|----------|-------------|
| `MURRMURE_HUB_TOKEN` | Yes | Grant token from `mrmr grant mint` (`tok_...`) |

Notes:

- MCP config does **not** require `MURRMURE_SPACE_ID`. Space identity comes from token claims.
- `MURRMURE_HUB_URL` is **not** required in MCP config. Bridge discovers hub endpoint from `~/.murrmure/hubs/shared.json`.
- `mrmr grant use --space spc_...` sets a local active pointer for CLI auth resolution.

## CLI / executor env

These vars are used by CLI workflows and runtime subprocesses.

| Variable | Used by | Description |
|----------|---------|-------------|
| `MURRMURE_HUB_URL` | CLI | Hub base URL (`http://127.0.0.1:8787` with Desktop) |
| `MURRMURE_HUB_TOKEN` | CLI | Bearer token override |
| `MURRMURE_SPACE_ID` | CLI | Default space for commands that support implicit `--space` |
| `MURRMURE_TOKEN` | CLI (legacy alias) | Legacy alias for `MURRMURE_HUB_TOKEN` |
| `MURRMURE_DEPLOY_TOKEN` | CLI (legacy alias) | Legacy deploy alias |

## CLI login cache

After `mrmr login`, credentials are stored in `~/.murrmure/credentials` (mode `0600`).

```json
{
  "version": 1,
  "hubUrl": "http://127.0.0.1:8787",
  "token": "tok_...",
  "defaultSpaceId": "spc_ui_sandbox",
  "savedAt": "2026-06-24T12:00:00.000Z"
}
```

Auth resolution order:

`--hub-url/--token` flags → env vars → active grant pointer (`~/.murrmure/grants/active`) → credentials → `~/.murrmure/hubs/shared.json`

## `shell_spawn` child env

When an action uses executor `shell_spawn`, hub injects:

| Variable | Description |
|----------|-------------|
| `MURRMURE_ACTION` | Action name |
| `MURRMURE_SPACE_ID` | Space id |
| `MURRMURE_RUN_ID` | Run id |
| `MURRMURE_SESSION_ID` | Session id |
| `MURRMURE_STEP_ID` | Step id |
| `MURRMURE_INVOKE_PARAMS` | JSON resolved invoke params |
| `MURRMURE_PROMPT` | Resolved prompt text |
| `MURRMURE_INPUT` | JSON `exec_context.input` from run start |

## Security

- Never commit `MURRMURE_HUB_TOKEN` to git.
- Revoke leaked tokens immediately with `mrmr grant revoke`.
- Browser session cookies are not API tokens.
