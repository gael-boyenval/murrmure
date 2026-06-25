# Self-hosted hub

Most teams use **Murrmure Cloud** at [app.murrmure.dev](https://app.murrmure.dev). This page is for **operators** who run the hub on their own network.

End users still use the **browser shell** and **MCP** — they do not clone the monorepo or run curl.

## When to self-host

- Data must stay on your network
- Custom SSO / compliance requirements
- Air-gapped environments

## Operator install

```bash
npm install -g @murrmure/hub
export DATABASE_PATH=/var/lib/murrmure/murrmure.db
export PORT=8787
export MURRMURE_DATA_DIR=/var/lib/murrmure
murrmure-hub serve
```

Put TLS on a reverse proxy (nginx, Caddy). The hub process does not terminate TLS.

**Contributors** run from the monorepo instead:

```bash
pnpm --filter @murrmure/hub-daemon start
pnpm --filter @murrmure/shell-web dev
```

### Single URL (bundled shell, monorepo build)

This block is for monorepo contributors (build shell locally, then mount it in the daemon). Build the shell once, then let the hub serve it on the same port as `/v1/*` and `/api/*`:

```bash
pnpm --filter @murrmure/shell-web build:bundled
# or from repo root:
# pnpm shell:build:bundled
MURRMURE_SHELL_STATIC_DIR=packages/shell-web/dist pnpm --filter @murrmure/hub-daemon start
```

Open `http://127.0.0.1:8787/` for the shell UI and keep using `http://127.0.0.1:8787/v1/health` for health checks.
Bundled shell mode infers hub URL from the current origin, so `/connect` only needs a token.

## First-time setup (browser only)

1. Open the shell (e.g. `http://127.0.0.1:5174` in dev, `http://127.0.0.1:8787` in single-URL mode, or your deployed URL)
2. **`/connect`** — bootstrap token (`tok_01JBOOTSTRAPTOKEN00000001` by default). In non-bundled dev mode, enter hub URL + token.
3. **`/setup`** — click through: spaces, review-loop install, validate, worker grant, invites
4. **Configure** — add spaces, install **feature-spec**, mint grants per team

No curl required for any of the above.

## Point clients at your URL

| Setting | Cloud | Self-hosted |
|---------|-------|-------------|
| Browser | `https://app.murrmure.dev` | `https://murrmure.yourcompany.com` |
| MCP `MURRMURE_HUB_URL` | Cloud API | Your hub URL |
| Shell connect | SSO | **`/connect`** + token |

Mint agent grants in **Configure → Agent grants** — same flow as cloud, different hostname.

## Registration

Typical patterns:

- **Local admin** runs setup wizard, invites users by email
- **OIDC / SAML** wired to your IdP (deployment-specific)

Online signup at `app.murrmure.dev` does not apply to private hubs unless you federate workspaces.

## Single instance

One hub process per data directory (lock file prevents double-start). Scale-out is an advanced ops topic.

## Next

- [Desktop app (MVP)](./desktop)
- [Configuration](./configuration)
- [Browser app](./browser)
- [Troubleshooting](./troubleshooting)
