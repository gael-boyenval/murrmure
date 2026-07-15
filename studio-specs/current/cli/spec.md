# Murrmure CLI specification

Normative spec for `@murrmure/cli` (`mrmr` / `murrmure`). Implementation plan: [cli-dx-v1.md](../../archives/plans/cli-dx-v1.md).

**Status:** Complete (CLI DX v1 — Task 8). Full command tree implemented with citty help contract and scope preflight.

## Goals

1. Best-in-class CLI DX — `--help` on every command with description, args, flags, examples, and `Requires:` line.
2. Human-readable default output on stdout; `--json` for scripts.
3. Hub config parity — CLI mirrors hub HTTP routes (no Configure UI).
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
| `setup` | impl | requireScope · space:admin |
| `health` | impl | none |
| `space init` | impl | none (local scaffold) |
| `space setup` | impl | requireScope · space:admin |
| `space link` | impl | requireScope · space:write |
| `space apply` | impl | requireScope · space:write |
| `space status` | impl | requireScope · space:read |
| `space list` | impl | requireScope · space:enter |
| `space show` | impl | requireTokenForSpace |
| `space create` | impl | requireScope · space:admin |
| `space update` | impl | requireScope · space:admin |
| `space archive` | impl | requireScope · space:admin |
| `connection create/list/rotate/revoke` | impl | requireScope · space:admin |
| `connection activate` | impl | local credential-store lookup only |
| `space member *` | impl | requireScope · space:admin |
| `space trigger *` | impl | requireScope · varies |
| `hub federation` | impl | requireScope · space:admin |
| `hub grants-export` | impl | requireScope · space:admin |
| `federation status` | impl | alias → `hub federation` |
| `federation peer add` | impl | requireScope · space:admin |
| `me set-landing` | impl | requireScope · space:enter |
| `worker poll` | impl | grant · executor:poll (hub enforces) |
| `space view init` | impl | none (local scaffold) |
| `space flow init` | impl | none (local scaffold; requires `.mrmr/`) |
| `view dev` | impl | none (local dev loop) |
| `view init` | deprecated | stderr redirect → `space view init`; exit 1 |
| `flow init` | deprecated in `.mrmr/` | stderr redirect → `space flow init`; exit 1 |
| `runtime events` | impl | requireTokenForSpace |
| `runtime gates` | impl | requireTokenForSpace |
| `runtime transition` | **removed** | Calls 404 instance route — use MCP mount tools or session/run APIs |
| `runtime wait` | impl | requireTokenForSpace |
| `runtime audit export` | impl | requireTokenForSpace |
| `flow validate` | impl | none (local); requireScope · flow:install with `--space --install` |
| `flow build` | impl | none |
| `flow push` | **404** | Hub returns 404 (phase 16) — use `space apply` |
| `flow run` | impl | requireScope · flow:run |
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
| `step resolve` | impl | env bindings (see below) |

**Separate binary:** `murrmure-mcp` from `@murrmure/mcp-bridge` — MCP stdio bridge using a connection-ID-only local descriptor.

**Install / command resolution:**

| Context | `command` value |
|---------|-----------------|
| Murrmure Desktop running | Stable user launcher `~/.murrmure/bin/murrmure-mcp`; discovery resolves the current bundle at invocation |
| Explicit headless CI | `"murrmure-mcp"` on PATH plus `--headless-ci`; runtime secret injection from the CI provider |

`connection create` emits a neutral descriptor with Hub ID, connection ID,
stable command, `tutorial-builder/v1`, skill bundle/version, and verification
requirements. Local MCP config has `command` plus `args: [--hub, …,
--connection, …]` and no token/env block. The bridge resolves Keychain at
startup and fails closed. Legacy `mrmr mcp` and env-token local config are
removed.

## Auth resolution order

CLI flags (`--hub-url`, `--token`) → explicit headless runtime env →
ID-only active connection + OS credential store → `~/.murrmure/credentials` →
`~/.murrmure/hubs/shared.json`. Local MCP mode never consumes env token
fallback.

## Auth commands (§5.2)

### `mrmr login [--open] [--hub-url <url>]`

1. Prompt hub URL (default `http://127.0.0.1:8787` or `--hub-url`)
2. Optional `--open`: open Desktop at `{hubUrl}/spaces/new` (not `/configure`)
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
| `runtime transition <ins> <event> <rev>` | **404** — instances API removed | — |
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
| `push [path]` | **404 on hub** | Legacy evolution install removed — use `space apply` |
| `run <flow_id>` | flow:run | `POST /v1/flows/{id}/run` |
| `status [path]` | none | Reads `.flow-push-state.json` |
| `list` | space:read | `GET /v1/spaces/{id}/flows` |
| `doctor` | any valid token | **Deprecated** — stderr hint; delegates to `mrmr doctor` |
| `test\|promote\|apply\|rollback` | flow:install | `--install` required |
| `dev [path]` | none / flow:install | `--sim` local; `--space` hub watch loop |

**Breaking:** default stdout is human; `--json` preserves pre-migration shapes.

## Space commands (§5.4)

| Command | HTTP | Preflight |
|---------|------|-----------|
| `init [--path]` | local scaffold | none |
| `setup` | wizard | requireScope · space:admin |
| `onboard [--path]` | wizard | requireScope · space:write |
| `link [--path] [--space]` | POST `/v1/spaces/:id/link` | requireScope · space:write |
| `apply [--path] [--strict]` | POST `/v1/spaces/:id/apply` | requireScope · space:write |
| `status [--path]` | GET `/v1/spaces/:id/index/status` | requireScope · space:read |
| `list` | GET `/v1/spaces` | requireScope · space:enter |
| `show <space_id>` | GET `/v1/spaces/:id` | requireTokenForSpace only |
| `create` | POST `/v1/spaces` | requireScope · space:admin |
| `update <space_id>` | PATCH `/v1/spaces/:id` | requireScope · space:admin |
| `archive <space_id>` | POST `/v1/spaces/:id/archive` | requireScope · space:admin |

**`space init`:** Offline-only scaffold of `.mrmr/space/space.yaml`,
`.mrmr/space/handlers.yaml`, and `.mrmr/dev/.gitignore`. The name defaults from
the target folder and the slug is normalized unless `--name` / `--slug` are
passed. **Default:** empty handlers only (no example flow, no
`.mrmr/README.md`). **`--with-examples`** adds
`flows/example/flow.manifest.yaml` and `.mrmr/README.md`. It never contacts the
Hub or creates a token, grant, connection, or credential.

**`space link`:** Registers `{ host, path, primary }` binding with hub; persists **`link.space_id`** and machine-local **`link.host`** in `.mrmr/space/space.yaml` (not `.murrmure/link.json`). Use `--create` to create hub space from `space.yaml` slug.

**`space apply`:** Strict-parses each flow manifest (`triggers`-only; the removed `start`, `requires_view`, `role`, `presentation`, `deriveRole`, wait shapes, wrapper branches, and `invoke:`/`checkpoint:`/`gate:` kinds are rejected with specific codes — no dual parser), compiles a `StepContractCatalog` per flow, lints handler coverage, and POSTs the bundle to the hub index. Warnings print to stdout by default; **`--strict`** exits 1 on lint warnings. Hub response includes `warnings: [{ flow_id, step_id, code, message }]`. Idempotent when digests unchanged. See [step-contract bridge](../bridges/step-contract.md) for the full lint code table and [flow-engine bridge](../bridges/flow-engine.md).

**Apply lint (clean cutover):** Hard-rejected at parse (HTTP 400, no `--strict` needed): `LEGACY_START_KEY`, `LEGACY_REQUIRES_VIEW`, `LEGACY_STEP_KIND`, `REMOVED_FIELD`, `INLINE_SCRIPT_STEP`, `EMPTY_BRANCHES`. `--strict` warnings (print by default, exit 1 under `--strict`): `CUSTOM_BRANCH_REQUIRES_ROUTE`, `ROUTE_TARGET_NOT_FOUND`, `RESUME_TARGET_NOT_ANCESTOR`, `DEAD_STEP`, `HANDLER_KEY_CONFLICT`, `HANDLER_ORPHAN_KEY`, `UNKNOWN_MURRMURE_TOKEN`. Unbound steps (`resolver: null`) are valid and produce no warning.

**`space flow init <id> [--template hello-gate|hello-invoke]`:** Scaffolds indexed flow stack under `.mrmr/` — manifest (`triggers` + resolver-agnostic step contracts with flat `branches`/`route`), handlers, scripts, and view packages (`hello-gate` embeds intake + review views from phase 02 template). Requires existing `.mrmr/` root. Each scaffolded file includes a one-line role comment. `hello-gate` matches [06-reference-workflow-preview-review.md](../../plans/product/plan/06-reference-workflow-preview-review.md). Legacy `mrmr flow init` inside a `.mrmr/` repo redirects with exit 1.

**`space setup`:** Same Task 01 sequence as top-level setup: confirm one
folder-derived display name and editable slug, create one opaque Hub space,
then execute init/link/apply. It creates no local-tool credential.

## Setup wizards (§5.3)

| Command | Human (Clack) | Agent (`--json`) |
|---------|---------------|------------------|
| `mrmr setup` | confirm name/slug → create one space → init → link → apply → optional skill | `--json` = step plan; `--json --yes` = non-interactive run (folder defaults, no examples) |
| `mrmr space setup` | same named-space setup sequence | same flags |

Setup uses existing Hub authorization. After apply it asks **Connect tools on
this computer?**; decline creates nothing, while acceptance creates and
auto-activates one connection, presents a vendor-neutral multi-select, installs
the same connection into every selected context, and persists an explicit
reload/verify resume step. Generic fallback writes no target configuration.

**Handoff:** wizard outro points to Desktop → Run → **ViewCanvasHost** at checkpoint steps.

**Doctor hints:** link missing → `mrmr space link`; `flows: 0` → `mrmr space flow init hello --template hello-gate`.

## Connection commands (§5.5)

**Preflight:** `requireScope` · `space:admin` on target space. Mint uses a clearer denial when token has narrower scopes (e.g. `flow:install` only).

| Command | HTTP | Notes |
|---------|------|-------|
| `connection create` | POST `/v1/spaces/:id/grants` | Public result is `con_…`; auto-stores in Keychain, activates, and installs adapters |
| `connection list` | GET `/v1/spaces/:id/grants` | Active/revoked connection history; no token |
| `connection activate <con_id>` | local only | Validates Keychain entry and writes an ID-only active pointer |
| `connection revoke <con_id>` | POST `…/grants/:id/revoke` | Removes local credential; audit history remains |
| `connection rotate <con_id>` | POST `…/grants/:id/rotate` | Stores replacement credential and removes old one |

The default named/versioned profile is `tutorial-builder/v1` and contains
exactly `space:read`, `flow:read`, `flow:run`, and `step:resolve`. Setup
connections are space-wide. Advanced `--flow-acl` accepts only already-applied
canonical flow IDs; unknown/future/stale aliases fail.

Local credentials exist only in the OS credential store keyed by Hub +
connection ID. Activation state, descriptors, generated instructions, logs,
arguments, project files, and normal environment guidance contain IDs only.
`grant mint`, `grant use`, `agent connect`, `agent activate`, and
`space onboard` are absent without aliases.

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

## Me commands

| Command | HTTP | Preflight |
|---------|------|-----------|
| `me set-landing --space` | PATCH `/v1/me` `{ landing_space_id }` | requireScope · space:enter |

## View commands

| Command | Preflight | Notes |
|---------|-----------|-------|
| `space view init <id>` | none | Scaffold Vite+React tree under `.mrmr/views/{id}/` |
| `view dev <id>` | none | Start author's `scripts.dev`; fixture tabs (Desktop dev route phase 05/06) |
| `view init <id>` | none | **Deprecated** — stderr redirect to `space view init`; exit 1 |
| `view build [id]` | none | Optional convenience — `npm run build` in view dir (planned) |

### `space view init` output tree

```text
.mrmr/views/{id}/
  view.manifest.yaml
  package.json             # scripts.dev + scripts.build
  vite.config.ts
  index.html
  src/main.tsx             # createViewMount({ App })
  src/App.tsx
  schemas/params.json
  dev/fixtures/
    intake.json
    gate-round-1.json
    gate-round-2.json
```

After scaffold: `npm install` in view dir, then `mrmr view dev {id}` or `npm run build` + `mrmr space apply`.

## Worker commands

| Command | HTTP | Preflight |
|---------|------|-----------|
| `worker poll --executor` | GET `/v1/executor/tasks`, POST complete | hub enforces executor:poll + binding |

## Federation commands

| Command | HTTP | Preflight |
|---------|------|-----------|
| `federation status` | GET `/v1/ops/federation/status` | requireScope · space:admin |
| `federation peer add --id --url` | POST `/v1/ops/federation/peers` | requireScope · space:admin |

## Step commands

### `mrmr step resolve --branch <branch>`

Resolves the current run step from a **shell handler** context. Used when handler `complete: cli` or when the handler command finishes and must call resolve explicitly.

**Requires env (injected on `shell_spawn` dispatch):**

| Variable | Purpose |
|----------|---------|
| `MURRMURE_RUN_ID` | Target run |
| `MURRMURE_STEP_ID` | Target step |
| `MURRMURE_HUB_TOKEN` | Short-lived, run-scoped resolve grant |
| `MURRMURE_HUB_URL` | Hub base URL |

**HTTP:** `POST /v1/runs/{run_id}/steps/{step_id}/resolve`

**Flags:** `--branch` (required); payload via `--payload-json`, `--payload-stdin`, or `--payload-file`; repeatable `--artifact-out slot=relative/path`.

**Preflight:** none at CLI layer — hub enforces `step:resolve` on token.

**Human output:** `✓ Resolved step '{step_id}' on branch '{branch}'`  
**JSON:** hub resolve response body

## Skill commands (§5.11)

| Command | Requires | Action |
|---------|----------|--------|
| `install [--variant agent\|developer\|all]` | none | Copy bundled skill(s) to `.cursor/skills/` |
| `update [--variant …]` | none | Overwrite skill tree(s) |
| `version [--variant …]` | none | Print bundled VERSION |

**Variants:**

| Variant | Install path | When |
|---------|--------------|------|
| `agent` (default) | `.cursor/skills/murrmure-agent/` | Runtime agent spaces — MCP + step resolve |
| `developer` | `.cursor/skills/murrmure-developer/` | Authoring spaces with local flows/views |
| `all` | both paths above | Auto-selected when cwd has `.mrmr/flows/` or `.mrmr/views/` manifests |

Legacy monolith `.cursor/skills/murrmure/` and `.cursor/skills/murrmure-flow/` are removed on install.

## References

- Hub scope enforcement: `packages/hub-daemon/src/routes/config/scopes.ts`
- Plan: [cli-dx-v1.md](../../archives/plans/cli-dx-v1.md)
- User guide: [apps/docs/guide/cli.md](../../../apps/docs/guide/cli.md)
