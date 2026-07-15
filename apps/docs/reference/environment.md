# Environment variables

Desktop users usually do not set env vars manually (bootstrap is automatic). This page is for CLI operators, MCP agent operators, handler shell spawns, and CI.

## Local MCP connections

Local MCP config uses the stable launcher plus ID arguments:

```text
~/.murrmure/bin/murrmure-mcp --hub <hub-id> --connection <con-id>
```

No environment variable carries a persistent local connection token. The bridge
normally reads it from macOS Keychain. Inside a Hub-spawned handler,
`MURRMURE_ASSIGNMENT_SCOPE` makes the same descriptor use the injected
short-lived assignment token instead; outside assignments,
`MURRMURE_HUB_TOKEN` is accepted only with explicit `--headless-ci` and must be
injected at process runtime by the CI provider.

## CLI / executor env

These vars are used by CLI workflows and runtime subprocesses.

| Variable | Used by | Description |
|----------|---------|-------------|
| `MURRMURE_HUB_URL` | CLI, `mrmr step resolve` | Hub base URL (`http://127.0.0.1:8787` with Desktop) |
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

`--hub-url/--token` flags → explicit headless env → active connection
(`~/.murrmure/connections/active.json`) + OS credential store → operator
credentials → discovery

## `shell_spawn` child env (handlers + legacy actions)

When a handler or legacy action uses `shell_spawn`, hub injects:

| Variable | Description |
|----------|-------------|
| `MURRMURE_ACTION` | Handler or action id |
| `MURRMURE_SPACE_ID` | Space id |
| `MURRMURE_RUN_ID` | Run id |
| `MURRMURE_SESSION_ID` | Session id |
| `MURRMURE_STEP_ID` | Step id |
| `MURRMURE_ASSIGNMENT_SCOPE` | Non-secret `{run_id}:{step_id}:{handler_id}` marker; makes the bundled MCP bridge bypass the persistent connection and use assignment authority |
| `MURRMURE_INVOKE_PARAMS` | JSON resolved handler/action params |
| `MURRMURE_PROMPT` | Resolved prompt template |
| `MURRMURE_INPUT` | JSON `exec_context.input` from run start |
| `MURRMURE_HUB_TOKEN` | Short-lived run/step/handler-scoped token (resolve capability only; expires and revoked on step/run terminal or shutdown; enforced on every `step:resolve` endpoint) |
| `MURRMURE_HUB_URL` | Hub base URL (for `mrmr step resolve`) |
| `MURRMURE_STEP_CONTRACT` | Active step contract JSON (when available) |

Handler `command` / `prompt` templates may also resolve `&#123;&#123;space_root&#125;&#125;`, `&#123;&#123;run_id&#125;&#125;`, `&#123;&#123;input.*&#125;&#125;`, `&#123;&#123;steps.*&#125;&#125;`, and other `&#123;&#123;murrmure.*&#125;&#125;` tokens from the active catalog.

`mrmr step resolve` reads `MURRMURE_RUN_ID`, `MURRMURE_STEP_ID`, `MURRMURE_HUB_URL`, and `MURRMURE_HUB_TOKEN` from the shell environment.

## Security

- Never commit `MURRMURE_HUB_TOKEN` to git.
- Revoke or rotate a compromised connection immediately with `mrmr connection revoke|rotate`.
- Browser session cookies are not API tokens.
- Dispatch-injected `MURRMURE_HUB_TOKEN` is run/step/handler-scoped and expires — do not reuse as a persistent connection. It is revoked when its step resolves, the run ends, or the hub shuts down, and the assignment boundary is enforced on every `step:resolve` endpoint (resolve, upload-intent creation, file transfer, abandon), so it cannot act for another run, step, or space.
