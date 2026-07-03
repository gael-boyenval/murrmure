# Environment variables

For **agent operators** and **CI**. Desktop users do not set these manually (bootstrap is automatic).

## Local hub (Desktop default)

| Variable | Required | Description |
|----------|----------|-------------|
| `MURRMURE_HUB_URL` | Yes | `http://127.0.0.1:8787` when using Murrmure Desktop |
| `MURRMURE_HUB_TOKEN` | Yes | Grant token from `mrmr grant mint` (`tok_…`) |
| `MURRMURE_SPACE_ID` | Yes (MCP) | Default space — tools do not take `space_id` as an argument |

Grant **`flow_acl`** (JSON array on mint, e.g. `["review-loop","feature-spec"]`) is stored on the token and filters which domain MCP tools appear. Set via **`mrmr grant mint`** or the grants API.

Set via MCP config JSON or shell `export`. Prefer **`mrmr login`** for local CLI use.

## CLI login cache

After `mrmr login`, credentials are stored in `~/.murrmure/credentials` (file mode `0600`). Override with env vars for CI.

### Credentials file schema

Path: `~/.murrmure/credentials`

```json
{
  "version": 1,
  "hubUrl": "http://127.0.0.1:8787",
  "token": "tok_…",
  "defaultSpaceId": "spc_ui_sandbox",
  "savedAt": "2026-06-24T12:00:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `version` | Schema version (currently `1`) |
| `hubUrl` | Hub base URL (no trailing slash) |
| `token` | Bearer grant token (`tok_…`) |
| `defaultSpaceId` | Optional default space for `--space` resolution |
| `savedAt` | ISO timestamp when credentials were saved |

**Auth resolution order:** CLI flags (`--hub-url`, `--token`) → env vars → credentials file → `~/.murrmure/hubs/shared.json`

## Self-hosted hub (operators only)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/murrmure.db` | SQLite path on hub machine |
| `PORT` | `8787` | Hub listen port |
| `MURRMURE_DATA_DIR` | `~/.murrmure` | Lock + discovery on hub host |
| `MURRMURE_SHELL_STATIC_DIR` | unset | Absolute path to built shell `dist/`; hub serves SPA at `/` when set |
| `MURRMURE_LISTEN_HOST` | `127.0.0.1` | HTTP bind hostname/interface used by hub daemon |
| `MURRMURE_BUNDLE_ROOT` | unset | Seed-contract root used by hub startup (`<root>/hub/contracts`) for packaged deployments |
| `MURRMURE_BOOTSTRAP_TOKEN` | `01JBOOTSTRAPTOKEN00000001` | Bootstrap token bare id seeded on hub startup (desktop dev only; external release needs per-install secret) |
| `MURRMURE_EMBEDDED` | `0` | When `1`, signal handlers run graceful shutdown without calling `process.exit(0)` |

End users still use `MURRMURE_HUB_URL` pointing at your proxy, not these.

## Harness

Optional claim on agent grants: `cursor-local`, `ci`, `cloud-worker`. Tokens minted for one harness should not be reused in another.

## Deprecated aliases

The CLI `auth.ts` resolver still accepts these legacy names (prefer the canonical names above):

| Deprecated | Canonical | Notes |
|------------|-----------|-------|
| `MURRMURE_TOKEN` | `MURRMURE_HUB_TOKEN` | CLI/MCP auth — prefer `MURRMURE_HUB_TOKEN` |
| `MURRMURE_DEPLOY_TOKEN` | `MURRMURE_HUB_TOKEN` | Legacy deploy scripts |

## `shell_spawn` child process (actions)

When an action uses executor `shell_spawn`, the hub injects these into the child environment:

| Variable | Shipped | Description |
|----------|---------|-------------|
| `MURRMURE_ACTION` | ✅ | Action name |
| `MURRMURE_SPACE_ID` | ✅ | Space id |
| `MURRMURE_RUN_ID` | ✅ | Run id |
| `MURRMURE_SESSION_ID` | ✅ | Session id |
| `MURRMURE_STEP_ID` | ✅ | Step id |
| `MURRMURE_INVOKE_PARAMS` | ✅ | JSON resolved invoke params |
| `MURRMURE_PROMPT` | ✅ | Resolved prompt text |
| `MURRMURE_INPUT` | ✅ | JSON `exec_context.input` from the flow run |

## Security

- Never commit `MURRMURE_HUB_TOKEN` to git
- Revoke leaked tokens immediately with **`mrmr grant revoke`**
- Browser session cookies are not valid API tokens
