# Murrmure CLI specification

Normative spec for `@murrmure/cli` (`mrmr` / `murrmure`). Implementation plan: [cli-dx-v1.md](../../archives/plans/cli-dx-v1.md).

**Status:** Complete (CLI DX v1 — Task 8). Full command tree implemented with citty help contract and scope preflight.

## Goals

1. Best-in-class CLI DX — `--help` on every command with description, args, flags, examples, and `Requires:` line.
2. Human-readable default output on stdout; `--json` for scripts.
3. Hub config parity — CLI mirrors Configure shell routes.
4. Scope-aware preflight — fail fast before HTTP when token lacks scope (config routes) or wrong space (product routes).
5. Docs/spec/help alignment — no ghost commands.

## Output contract

| Mode | stdout | stderr | Exit |
|------|--------|--------|------|
| human (default) | Formatted result | consola info/warn/error | 0 / 1 / 2 |
| `--json` | JSON only | empty | 0 / 1 / 2 |

**Exit codes:** `0` ok · `1` operational error · `2` usage (citty)

**Error JSON shape:**

```json
{
  "ok": false,
  "code": "SCOPE_MISSING",
  "message": "Administrator access required for this action",
  "hint": { "required_scope": "space:admin", "space_id": "spc_ui_sandbox" }
}
```

**Global flags:** `--json`, `--space <spc_id>`, `--hub-url <url>`, `--token <tok>`

## Scope preflight (§6.1)

CLI commands use **one of two** preflight strategies — match what the hub route actually does:

| Mode | When | Check |
|------|------|-------|
| **`requireScope`** | Config routes — grants, members, flows list, evolution, triggers | Token has required scope for target space |
| **`requireTokenForSpace`** | Product routes — events, gates, waits, audit, transitions, `space show` | Token is valid and authorized for `pathSpaceId` (bootstrap or matching space) |

Never apply `requireScope(..., "space:read")` to runtime product routes — the hub does not.

### Bootstrap / empty hub (§6.3)

- Bootstrap token (`tokenSpaceId === "bootstrap"`): skip scope name check; use `tokenScopes`.
- Fresh hub (`whoami.spaces: []`): use `tokenScopes` for first `space create`.

## Command index

Legend: **stub** = Task 1 placeholder; **impl** = implemented.

| Command | Status | Preflight |
|---------|--------|-----------|
| `login` | impl | none |
| `logout` | impl | none |
| `whoami` | impl | any valid token |
| `doctor` | impl | any valid token |
| `health` | impl | none |
| `space init` | impl | requireScope · space:admin |
| `space list` | impl | requireScope · space:enter |
| `space show` | impl | requireTokenForSpace |
| `space create` | impl | requireScope · space:admin |
| `space update` | impl | requireScope · space:admin |
| `space archive` | impl | requireScope · space:admin |
| `space grant *` | impl | requireScope · space:admin |
| `space member *` | impl | requireScope · space:admin |
| `space trigger *` | impl | requireScope · varies |
| `hub federation` | impl | requireScope · space:admin |
| `hub grants-export` | impl | requireScope · space:admin |
| `runtime events` | impl | requireTokenForSpace |
| `runtime gates` | impl | requireTokenForSpace |
| `runtime transition` | impl | requireTokenForSpace |
| `runtime wait` | impl | requireTokenForSpace |
| `runtime audit export` | impl | requireTokenForSpace |
| `flow init` | impl | none |
| `flow validate` | impl | none (local); requireScope · flow:install with `--space --install` |
| `flow build` | impl | none |
| `flow push` | impl | requireScope · flow:install |
| `flow status` | impl | none |
| `flow list` | impl | requireScope · space:read |
| `flow doctor` | impl (deprecated alias) | any valid token → delegates to `mrmr doctor` |
| `flow test` | impl | requireScope · flow:install |
| `flow promote` | impl | requireScope · flow:install |
| `flow apply` | impl | requireScope · flow:install |
| `flow rollback` | impl | requireScope · flow:install |
| `flow dev` | impl | none (`--sim`); requireScope · flow:install (`--space`) |
| `skill install` | impl | none |
| `skill update` | impl | none |
| `skill version` | impl | none |

**Separate binary:** `murrmure-mcp` / `mrmr-mcp` — MCP stdio server (unchanged).

## Auth resolution order

CLI flags (`--hub-url`, `--token`) → env (`MURRMURE_HUB_URL`, `MURRMURE_HUB_TOKEN`, `MURRMURE_TOKEN`, `MURRMURE_DEPLOY_TOKEN`, legacy `STUDIO_API_URL` / `STUDIO_API_TOKEN`) → `~/.murrmure/credentials` → `~/.murrmure/hubs/shared.json`

## Auth commands (§5.2)

### `mrmr login [--open] [--hub-url <url>]`

1. Prompt hub URL (default `http://127.0.0.1:8787` or `--hub-url`)
2. Optional `--open`: browser to `{hubUrl}/configure`
3. Clack password prompt for token (`tok_…`)
4. Validate via `GET /v1/auth/whoami` before save
5. Write `~/.murrmure/credentials` (mode `0600`)

**Human output:** `✓ Logged in as act_… (N spaces)`  
**JSON:** `{ "ok": true, "actor_id", "spaces", … }`

### `mrmr logout [--yes]`

Delete credentials file; confirm unless `--yes`. Does not clear env vars.

### `mrmr whoami`

**HTTP:** `GET /v1/auth/whoami`  
**Human:** header (`actor_id`, `token_id`, `kind`, `expires_at`) + table (`SPACE`, `SCOPES`)  
**JSON:** pass-through API response

### `getAuthContext`

- Cache whoami (TTL 60s)
- Expose `tokenScopes`, `tokenSpaceId` for scope preflight (§6.3)
- Bootstrap inference: multiple spaces with identical scopes → `bootstrap`; empty spaces on fresh hub → `bootstrap`

### `mrmr doctor`

**HTTP:** `GET /v1/health`, `GET /v1/auth/whoami`  
**Checks:** resolved auth source, hub reachability, token validity, per-space scopes, capability summary (push flows / mint grants / register triggers), dev-kit version skew in cwd `package.json`  
**Human:** profile table + issues list  
**JSON:** `{ ok, issues, profile }` where `profile` includes `auth_source`, `hub_url`, `hub_reachable`, `token_valid`, `bootstrap_token`, `spaces[]`, optional `dev_kit`

**Deprecated alias:** `mrmr flow doctor` — prints stderr hint and delegates to the same implementation.

### `mrmr health`

**HTTP:** `GET /v1/health` (no auth)  
**Human:** `Hub ok · version 0.1.0 · uptime 42s · N flows`  
**JSON:** hub payload `{ status, version, uptime_s, flows }`

## Runtime commands (§5.9)

Product P0 routes — hub uses `requireToken(space)` only (no `space:read` / `state:transition` scope gate at HTTP layer). CLI preflight: **`requireTokenForSpace` only**.

| Command | HTTP | Typical scopes (advisory) |
|---------|------|---------------------------|
| `runtime events [from_seq]` | GET `/v1/spaces/:id/events?from_seq=` | `event:read` |
| `runtime gates` | GET `/v1/spaces/:id/gates` | `space:read` |
| `runtime transition <ins> <event> <rev>` | POST `/v1/spaces/:id/instances/:ins/transitions` | `state:transition` |
| `runtime wait <wait_id> [--timeout]` | GET `/v1/spaces/:id/waits/:wait_id` (poll) | `state:transition` |
| `runtime audit export [since]` | GET `/v1/spaces/:id/audit/export?since=` | `space:read` |

**Help:** `Requires: valid token for <space>` plus `Typical scopes: …` in description (advisory only).

**Exceptions:**

- `runtime audit export` — always raw JSONL on stdout (pipe-friendly; ignores `--json`)
- **Breaking:** flat `mrmr events`, `mrmr gates`, etc. removed — use `mrmr runtime … --space <id>`

**Review workflows:** No `mrmr review` command — use MCP (`murrmure-mcp`) or review-loop HTTP API.

## Flow commands (§5.10)

Business logic lives in `packages/cli/src/{init,build,push,validate,dev}.ts` — citty layer wraps only routing, scope preflight, and output.

| Command | Requires (help line) | Notes |
|---------|---------------------|-------|
| `init <id>` | none | Scaffold; human summary with next steps |
| `validate [path]` | none locally | Hub mode: `--space` + `--install` → evolution validate |
| `build [path]` | none | Local bundle stage |
| `push [path]` | flow:install | JSON preserves `install_id`, `next_steps`, … |
| `status [path]` | none | Reads `.flow-push-state.json` |
| `list` | space:read | `GET /v1/spaces/{id}/flows` |
| `doctor` | any valid token | **Deprecated** — stderr hint; delegates to `mrmr doctor` |
| `test\|promote\|apply\|rollback` | flow:install | `--install` required |
| `dev [path]` | none / flow:install | `--sim` local; `--space` hub watch loop |

**Breaking:** default stdout is human; `--json` preserves pre-migration shapes.

## Space commands (§5.4)

| Command | HTTP | Preflight |
|---------|------|-----------|
| `init` | wizard | requireScope · space:admin (bootstrap OK on empty hub) |
| `list` | GET `/v1/spaces` | requireScope · space:enter (no `--space` required) |
| `show <space_id>` | GET `/v1/spaces/:id` | requireTokenForSpace only |
| `create` | POST `/v1/spaces` | requireScope · space:admin |
| `update <space_id>` | PATCH `/v1/spaces/:id` | requireScope · space:admin |
| `archive <space_id>` | POST `/v1/spaces/:id/archive` | requireScope · space:admin |

**`space create` flags:** `--slug`, `--name`, `--install-policy` (default `human_only`), `--preview-policy` (default `same_origin_only`), `--description`, `--parent`.

**`space update`:** `--name`, `--install-policy`, `--preview-policy`, `--query-policy` (JSON or `@file.json`).

**Human output:** `list` → table (`SPACE_ID`, `NAME`, `SLUG`, `STATUS`); `create` → assigned `space_id` on stdout.

**`space init`:** Clack wizard mirroring browser `/setup` — connect (reuse login), create default spaces, print flow/evolution commands, optional worker grant mint, invite hint, verify links. Each step skippable; Ctrl+C safe.

**Bootstrap / empty hub:** `whoami.spaces: []` with bootstrap token must pass preflight for `space create` (§6.3). Use `runGlobalScopePreflight` for `list` and `create` (no target space id).

## Space grant commands (§5.5)

**Preflight:** `requireScope` · `space:admin` on target space. Mint uses a clearer denial when token has narrower scopes (e.g. `flow:install` only).

| Command | HTTP | Notes |
|---------|------|-------|
| `space grant list` | GET `/v1/spaces/:id/grants` | JSON or pretty-printed hub body |
| `space grant mint` | POST `/v1/spaces/:id/grants` | Body uses **`flow_acl`** (not `capability_acl`); `--label` required; optional `--harness`, `--template`, `--scopes`, `--flow-acl`, `--expires-days` |
| `space grant revoke <grant_id>` | POST `…/grants/:id/revoke` | |
| `space grant rotate <grant_id>` | POST `…/grants/:id/rotate` | Returns new one-time token |

**Mint human output:** prints `grant_id`, label, token on stdout, stderr warning *"Save this token — it will not be shown again."* Never auto-saves token to disk.

**Scope denial (human, mint):**

```
✗ Missing scope: space:admin
Your token can flow:install on spc_ui_sandbox but cannot mint grants.
Run: mrmr whoami
```

## Space member commands (§5.6)

**Preflight:** `requireScope` · `space:admin`

| Command | HTTP |
|---------|------|
| `space member list` | GET `/v1/spaces/:id/members` |
| `space member invite --email --role` | POST `/v1/spaces/:id/members` |
| `space member role <member_id> --role` | PATCH `/v1/spaces/:id/members/:id` |
| `space member remove <member_id>` | DELETE `/v1/spaces/:id/members/:id` |

Roles: `admin`, `editor`, `viewer`.

## Space trigger commands (§5.7)

**Preflight:** `requireScope` on target space — scopes vary by subcommand.

| Command | HTTP | Requires |
|---------|------|----------|
| `space trigger list` | GET `/v1/spaces/:id/triggers` | `space:read` |
| `space trigger register` | POST `/v1/spaces/:id/triggers` | `trigger:register` |
| `space trigger register --template …` | POST `/v1/spaces/:id/triggers/from-template` | `trigger:register` |
| `space trigger templates` | GET `/v1/spaces/:id/triggers/templates` | `space:read` |
| `space trigger event-catalog` | GET `/v1/spaces/:id/triggers/event-catalog` | `space:read` |
| `space trigger test-fire <trigger_id>` | POST `…/triggers/:id/test-fire` | `trigger:register` |
| `space trigger disable <trigger_id>` | POST `…/triggers/:id/disable` | `trigger:register` |
| `space trigger deliveries` | GET `/v1/spaces/:id/triggers/deliveries` | `space:read` |
| `space trigger replay <trigger_id>` | POST `…/triggers/:id/replay` | `space:admin` |

**Register flags:** `--name`; custom body via `--filter` and `--action` (JSON or `@file.json`); template mode via `--template`, `--source-space`, optional `--target-space`, `--wake-label`.

**Replay / test-fire:** optional `--body` (JSON or `@file.json`).

**Deliveries:** `--limit N` (default 50).

**Output:** JSON or pretty-printed hub body; same contract as grant/member commands.

## Hub commands (§5.8)

**Preflight:** `requireScope` · `space:admin` (global — token must have admin on at least one space, or bootstrap).

| Command | HTTP | Notes |
|---------|------|-------|
| `hub federation` | GET `/v1/ops/federation/status` | JSON status |
| `hub grants-export` | GET `/v1/ops/grants/export` | Raw JSON to stdout; `--out <path>` writes file instead |

**Grants export:** pipe-friendly stdout (ignores `--json` when streaming to stdout); `--out` with `--json` returns `{ ok: true, path }`.

## Skill commands (§5.11)

| Command | Requires | Action |
|---------|----------|--------|
| `install` | none | Copy to `.cursor/skills/murrmure-flow/` |
| `update` | none | Overwrite skill tree |
| `version` | none | Print bundled VERSION |

## References

- Hub scope enforcement: `packages/studio-hub-daemon/src/routes/config/scopes.ts`
- Plan: [cli-dx-v1.md](../../archives/plans/cli-dx-v1.md)
- User guide: [apps/docs/guide/cli.md](../../../apps/docs/guide/cli.md)
