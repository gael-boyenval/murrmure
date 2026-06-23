# Environment variables

For **agent operators** and **CI**. Browser users do not set these.

## Cloud (default)

| Variable | Required | Description |
|----------|----------|-------------|
| `STUDIO_HUB_URL` | Yes | `https://api.studio.dev` (or your org API URL) |
| `STUDIO_HUB_TOKEN` | Yes | Grant token from dashboard (`tok_…`) |
| `STUDIO_SPACE_ID` | Yes (MCP) | Default space — tools do not take `space_id` as an argument |

Grant **`capability_acl`** (JSON array on mint, e.g. `["review-loop","feature-spec"]`) is stored on the token and filters which domain MCP tools appear. Set via Configuration → Agent grants or the `POST …/grants` API body.

Set via MCP config JSON or shell `export`. Prefer **`studio login`** for local CLI use.

## CLI login cache

After `studio login`, credentials are stored in the OS keychain (or `~/.studio/credentials` on Linux). Override with env vars for CI.

## Self-hosted hub (operators only)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/studio.db` | SQLite path on hub machine |
| `PORT` | `8787` | Hub listen port |
| `STUDIO_DATA_DIR` | `~/.studio` | Lock + discovery on hub host |

End users still use `STUDIO_HUB_URL` pointing at your proxy, not these.

## Harness

Optional claim on agent grants: `cursor-local`, `ci`, `cloud-worker`. Tokens minted for one harness should not be reused in another.

## Security

- Never commit `STUDIO_HUB_TOKEN` to git
- Revoke leaked tokens immediately in Configuration
- Browser session cookies are not valid API tokens
