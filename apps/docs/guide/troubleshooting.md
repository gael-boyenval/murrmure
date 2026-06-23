# Troubleshooting

Fix issues in the **browser** and **MCP** first — not with curl.

## "Invalid token" or 403 from agent

1. Token expired or revoked → **Configure → Agent grants → Revoke** old, mint new
2. Wrong space → `MURRMURE_SPACE_ID` must match grant's space (`spc_…`)
3. Missing scope → mint **Worker** or **Admin** template, not a custom stripped token
4. **`TOOL_NOT_AUTHORIZED`** → flow not **live**; run **Validate → Test → Promote** in Configure

Self-hosted: re-check **`/connect`** hub URL and token.

Run `mrmr whoami` after `mrmr login` (CLI optional).

## MCP tools not showing in Cursor

1. Reload Cursor after pasting MCP config
2. Confirm `murrmure` or `npx @murrmure/cli` is on PATH (monorepo: `packages/cli/dist/cli.js` with `"args": ["mcp"]`, or `pnpm --filter @murrmure/cli exec murrmure mcp`)
3. Env vars must be **`MURRMURE_HUB_URL`**, **`MURRMURE_HUB_TOKEN`**, **`MURRMURE_SPACE_ID`**
4. Check MCP logs in Cursor settings
5. Flow not **live** → **Configure → Flows → [install] → Promote**
6. Wrong `MURRMURE_SPACE_ID` in env
7. Self-hosted: hub URL must match **`/connect`** value

## `wait_for_review` times out

- Human must click **Finish review** in the browser session
- Session in `awaiting_review` or `changes_made`
- Increase `timeout_ms` in the tool call

## Browser: can't see a space

- Correct workspace (cloud) or token scoped to space (self-hosted)
- Ask admin for member invite — **Configure → Members**
- Use **Configure** dashboard to list spaces you can enter

## Spec canvas empty or 403

- **Feature spec** flow must be **live** in that space
- Open from **Runtime → Instances → Open spec**
- Agent creates specs via **`open_spec`** — not manually in UI

## Cross-space `query_ask` fails

- Target space must list caller space on **`query_policy.inbound_allowlist`** (`PATCH /v1/spaces/{id}`)
- Use `query_type: "spec_summary@1"` for published specs in a feature-spec space
- **`QUERY_POLICY_DENIED`** — fix allowlist; **`get_spec`** needs a read grant on the source space for full bodies

## Trigger did not wake agent

- Register trigger on **target** space (where agent listens), with correct **source space id**
- Dev agent must call **`POST /v1/mcp/session/handshake`** (Cursor reload after MCP config)
- Check **Configure → Triggers → Delivery log** for `success` vs dedup/failure

## CLI: `mrmr login` fails

- Corporate proxy may block OAuth — paste grant token from **Configure**
- Self-hosted: set `MURRMURE_HUB_URL` to hub URL before login

## Self-hosted: hub won't start

- **Port in use** — change `PORT`
- **Lock held** — one `murrmure-hub serve` per `MURRMURE_DATA_DIR`
- **Database permissions** — `DATABASE_PATH` must be writable

## Self-hosted: shell won't load data

1. **`/connect`** — save hub URL + bootstrap/admin token
2. Hub daemon running on that URL
3. CORS / same-origin: shell and hub URLs must match your deployment layout

## Agent skips version bump or evolution steps

Install the [Agent skill](./agent-skill) at your repo root:

```bash
mrmr skill install
```

Reload Cursor so the agent loads `murrmure-flow` skill. It mandates semver bumps and validate → build → push → hub validate/test/promote/apply before claiming a flow is live.

## Still stuck?

- **Runtime → Audit → Download JSONL** for the space
- Contact support (cloud) or platform admin (self-hosted) with `space_id` and timestamp

## Wrong docs?

If someone pointed you at `git clone` and `pnpm install`, that is the **contributor** path. Users sign in or **`/connect`**, then [Quick start](./quick-start).

Integrators who need raw HTTP: [HTTP API](../reference/http-api) — not for day-to-day users.
