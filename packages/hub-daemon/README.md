# Murrmure hub daemon

Local HTTP server for Murrmure v2 (spaces, flows, journal, shell static hosting).

## Out-of-shell email (phase 15)

Default in development: **log-only** (noop adapter). Configure one of:

### Webhook relay

```bash
export MURRMURE_EMAIL_WEBHOOK_URL=https://hooks.example.com/murrmure-email
```

POST body: `{ to_actor_id, subject, body_text, html_link? }`

### SMTP (logged intent in MVP)

```bash
export MURRMURE_SMTP_HOST=smtp.example.com
export MURRMURE_SMTP_PORT=587
export MURRMURE_SMTP_USER=...
export MURRMURE_SMTP_PASS=...
export MURRMURE_SMTP_FROM=murrmure@example.com
```

Rate limit: max **one email per gate per 15 minutes**.

### Self-test

```bash
curl -X POST http://127.0.0.1:8787/v1/notifications/test \
  -H "Authorization: Bearer $TOKEN"
```

Requires `hub:admin` on the token.
