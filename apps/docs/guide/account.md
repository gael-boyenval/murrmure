# Create an account

Studio is a **hosted service** for most teams. Sign up online — no local server, no curl.

## Sign up

1. Go to **[app.studio.dev/signup](https://app.studio.dev/signup)**.
2. Register with email or your org's SSO (Google, GitHub, SAML — depending on your plan).
3. Confirm your email if prompted.
4. Create or join a **workspace** (your team's boundary for billing, members, and spaces).

## First login

You land in the **Studio shell**:

- **Runtime** — instances, gates, audit, review/spec canvas
- **Configure** — spaces, capabilities, agent grants, members, triggers

Toggle **Runtime | Configure** in the top bar.

## Invitations

If a teammate invited you, open the link in the email. You join their workspace with the role they assigned.

## API tokens (for agents only)

Agents do not use your login password. Admins mint grants in the browser:

1. **Configure → [space] → Agent grants → Mint grant**
2. Choose **Worker** (agents) or **Admin** (setup)
3. Copy the **one-time token** into MCP config (`STUDIO_HUB_TOKEN`)

The setup wizard (**`/setup`**, self-hosted) also prints an MCP snippet on step 5.

| Credential | Use |
|------------|-----|
| `tok_…` grant token | MCP / optional CLI |
| Browser session | Human UI only — never paste into MCP |

Revoke leaked tokens from **Configure → Agent grants**.

## Workspace URL

Cloud teams use:

```
https://app.studio.dev/w/<workspace-slug>
```

Review and spec links live under **`/spaces/…`**.

## Self-hosted teams

Your admin gives you a shell URL (e.g. `https://studio.acme.com`). First visit:

1. **`/connect`** — hub URL + token from admin
2. **`/setup`** or **Configure** — same flows as cloud, different hostname

See [Self-hosted hub](./self-hosted) if you deploy the hub.

## Next

- [Quick start](./quick-start)
- [Browser app](./browser)
- [Install npm packages](./installation) — agent operators only
