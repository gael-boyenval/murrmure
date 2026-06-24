# CLI DX v1 — citty, full help, hub config parity, scope preflight

**Status:** executed (2026-06-24) — archived after Task 8  
**Package:** `@murrmure/cli` (publishable — changeset when user-visible behavior ships)  
**Aligns with:** [agent.md](../../agent.md) phase 2 → 3  
**Normative output (created during execution):** `studio-specs/current/cli/spec.md`

---

## 0. Reader context (for agents without chat history)

This plan was produced after a product conversation. Key outcomes:

| Topic | Decision |
|-------|----------|
| CLI framework | **citty** (UnJS) — rejected Commander (“old”), rejected oclif (overkill for ~40 commands) |
| Output | **consola** + human default stdout; **`--json`** for scripts |
| Interactive | **@clack/prompts** for `login` and `space init` |
| Breaking changes | **Explicitly approved** — default output is no longer JSON |
| Scope | **ALL** CLI commands: auth, space (hub config parity), runtime, flow, skill, health, hub ops |
| `mrmr review` | **Removed** — review is **flow/MCP territory** (`review-loop` → `/api/sessions/*`, MCP `create_review_session`). Was documented in `apps/docs/guide/cli.md` but **never implemented** |
| Admin commands | **Show in `--help` for everyone**; **preflight scope** at runtime with clear error (do not hide commands per token) |
| Hub config parity | Configure UI capabilities should have CLI equivalents (`space`, grants, members, triggers, hub ops) |
| Docs debt | `configuration.md` says “browser only” — **must change** to “browser or CLI” |
| Accidental dep | `commander@^13` was added to `package.json` during an aborted spike — **remove**; use citty only |
| `consola@^3.4.2` | Already in `package.json` — keep |

**Execution model ([agent.md](../../agent.md)):** Orchestrator delegates ~90% to dev subagents; after each slice run 3 parallel review subagents (scope/contract, failure/trust, experience/craft); synthesize fixes; repeat until green. Each slice includes code + tests + `apps/docs` + `studio-specs/current` in one pass.

---

## 1. Problem statement

### 1.1 Current CLI (`packages/cli` @ 0.1.1)

**Entry:** `packages/cli/src/cli.ts` — manual argv routing:

```
process.argv[2] = scope → flow | skill | mcp | <flat hub command>
```

**No real `--help`:** Root prints `usage: mrmr flow|skill|mcp|<hub-command> ...`. Unknown commands dump JSON error lists.

**Output:** Almost everything uses `console.log(JSON.stringify(...))` even without `--json`. The `out()` helper pretty-prints only when `--json` is passed; otherwise compact JSON on stdout.

**Duplicate parsers:** `parseArgs()` copied in `cli.ts` and `skill/cli.ts`.

**Auth (`packages/cli/src/auth.ts`):**

- Resolves: env vars → `~/.murrmure/hubs/shared.json`
- **Does NOT** implement `~/.murrmure/credentials` (documented in `apps/docs/reference/environment.md`)
- **Does NOT** implement `login` / `whoami` / `logout` commands

**Hub commands (`packages/cli/src/hub-commands.ts`):**

- Flat top-level: `health`, `events`, `gates`, `transition`, `wait`, `audit export`
- Uses **only** env vars (`MURRMURE_HUB_URL`, `MURRMURE_HUB_TOKEN`) — ignores `resolveHubAuth()` / credential file
- No scope preflight; no help

**Flow commands:** Implemented in `cli.ts` switch; business logic in `packages/cli/src/{init,build,push,validate,dev,...}.ts` — **keep these modules**; only replace routing/output layer.

**Skill commands:** `packages/cli/src/skill/cli.ts` — install/update/version.

**MCP:** Separate bin `dist/mcp.js` via `packages/cli/src/mcp/main.ts` — unchanged protocol; root help must link to it.

**Bins (`package.json`):** `murrmure`, `mrmr`, `murrmure-mcp`, `mrmr-mcp`.

**Build:** `tsup` → `dist/cli.js` with `#!/usr/bin/env node` banner.

### 1.2 Documentation vs implementation gaps

| Documented | Implemented? | Notes |
|------------|--------------|-------|
| `mrmr login` | **No** | `apps/docs/guide/cli.md`, `installation.md`, `environment.md` |
| `mrmr whoami` | **No** | Same; `doctor()` calls `/v1/auth/whoami` internally only |
| `mrmr logout` | **No** | Implied by login docs |
| `mrmr health` | **Yes** (flat) | No help |
| `mrmr events`, `gates`, `transition`, `wait` | **Yes** (flat) | Moving to `mrmr runtime …` |
| `mrmr audit export` | **Yes** (flat) | Moving to `mrmr runtime audit export` |
| `mrmr review create/wait` | **No** | **Delete from docs** — use MCP or HTTP |
| `mrmr flow *` (12 cmds) | **Yes** | No help |
| `mrmr skill *` | **Yes** | No help |
| `mrmr space *` | **No** | Entire Configure surface missing |
| `mrmr hub *` | **No** | Ops routes exist on hub |
| Configure UI actions | **Partial** | Only via `flow push` + evolution cmds |

### 1.3 Hub authority for scopes

Scope enforcement lives in hub daemon: `packages/studio-hub-daemon/src/routes/config/scopes.ts`

```typescript
// space:admin implies all other scopes for that space
export function hasScope(ctx, scope: string): boolean {
  if (ctx.space_id === "bootstrap") return true;
  return ctx.scopes.includes(scope) || ctx.scopes.includes("space:admin");
}
```

CLI preflight must mirror hub enforcement **as implemented in daemon routes**, not stale prose in specs. Hub still returns `403 SCOPE_ENFORCEMENT_FAILURE` if CLI skips preflight or gets it wrong — hub is always the final authority.

Reference HTTP client (types + routes): `packages/studio-hub-client/src/config.ts` — CLI may duplicate thin `fetch` wrappers (do not publish hub-client as npm dep unless already workspace-linked; today CLI does not depend on hub-client).

### 1.4 Source of truth hierarchy (read this before implementing scopes)

When specs disagree, resolve in this order:

| Priority | Source | Use for |
|----------|--------|---------|
| 1 | **Hub daemon routes** — `packages/studio-hub-daemon/src/routes.ts`, `routes/config/index.ts`, `routes/config/scopes.ts` | Actual HTTP paths, `requireScope` vs `requireToken` only |
| 2 | **Hub core handlers** — `packages/studio-hub-core/src/handlers/hub.ts` (`handleAuthWhoami`, …) | whoami shape, bootstrap behavior |
| 3 | **This plan** — `studio-specs/plans/cli-dx-v1.md` | CLI command tree, output contract, preflight rules |
| 4 | **`studio-specs/current/cli/spec.md`** | Normative CLI spec (created during execution) |
| 5 | **`apps/docs/reference/http-api.md`** | User-facing API overview |
| 6 | **`studio-specs/current/config/spec.md`** | Configure shell — **contains known drift** (see below) |

**Known spec drift (fix in Task 8):**

| Stale in `config/spec.md` | Correct in hub code |
|---------------------------|---------------------|
| `capability:*` scopes | `flow:install`, `flow:configure` |
| `capability_acl` on grant mint body | **`flow_acl`** |
| `POST /v1/spaces/{id}/capabilities/*` paths | `POST /v1/spaces/{id}/flows/*` (wire may still use capability handlers internally) |

Executors: if `config/spec.md` conflicts with hub routes, **follow hub routes** and file a spec sync in Task 8.

### 1.5 Review amendments (2026-06-24)

A high-thinking review subagent audited this plan against hub code. These fixes are **incorporated below** — do not revert:

1. **Bootstrap / empty hub:** `whoami` returns `spaces: []` on a fresh hub; preflight must not require a matching space row. Use **token-level scopes** + bootstrap bypass (§6).
2. **Runtime routes:** Product routes (`events`, `gates`, `wait`, `audit`, `transition`) use `requireToken(space)` only — **no** `space:read` / `state:transition` scope checks. CLI preflight must match (§6.4, §6.7).
3. **`hub grants-export`:** Requires `space:admin`, not a separate “hub operator” token (see `routes/config/index.ts`).
4. **`space show`:** Token-belongs-to-space only (no `space:read` preflight).
5. **T11 resolved:** Top-level **`mrmr doctor` only**; `mrmr flow doctor` → deprecated alias (§7.1).
6. **T6:** Keep legacy env aliases (`MURRMURE_DEPLOY_TOKEN`, `STUDIO_API_*`).

---

## 2. Goals

1. **Best-in-class CLI DX** — `--help` on every command/subcommand with description, args, flags, examples, and `Requires: <scope>`.
2. **Modern stack** — citty + consola + @clack/prompts.
3. **Hub config parity** — CLI mirrors Configure shell (`studio-specs/current/config/spec.md` routes).
4. **Scope-aware preflight** — fail fast with human-readable errors before HTTP when token lacks scope.
5. **100% docs/spec/help alignment** — no ghost commands; normative `studio-specs/current/cli/spec.md`.

---

## 3. Resolved technical decisions

| # | Topic | Decision |
|---|-------|----------|
| T1 | Framework | citty `defineCommand` + `runMain`; lazy subcommand imports for startup |
| T2 | Default output | Human text/tables on **stdout**; diagnostics on **stderr** via consola |
| T3 | `--json` | Single JSON value on stdout; errors `{ ok: false, code, message, hint? }`; exit 1 |
| T4 | Global flags | `--json`, `--space`, `--hub-url`, `--token` on authenticated commands |
| T5 | Space default | `--space` > `MURRMURE_SPACE_ID` > credential file `defaultSpaceId` |
| T6 | Auth resolution order | CLI flags (`--hub-url`, `--token`) → env (`MURRMURE_HUB_URL`, `MURRMURE_HUB_TOKEN`, `MURRMURE_TOKEN`, `MURRMURE_DEPLOY_TOKEN`, legacy `STUDIO_API_URL` / `STUDIO_API_TOKEN`) → `~/.murrmure/credentials` → `~/.murrmure/hubs/shared.json` |
| T7 | `login` | Clack paste token; optional `--open` opens browser to hub Configure grants page (no OAuth v1) |
| T8 | `space init` | Interactive wizard mirroring `/setup` where API allows (see §5.4 `space init` table) |
| T9 | `space create` | Non-interactive; flags for CI |
| T10 | Runtime grouping | `mrmr runtime events` not `mrmr events` — **breaking**, no deprecation shim |
| T11 | Doctor | **Top-level `mrmr doctor` only** (Task 8). `mrmr flow doctor` → thin deprecated alias that delegates to `mrmr doctor` and prints one-line stderr hint |
| T12 | Grant mint ACL field | Wire field is **`flow_acl`** (hub tests + shell); not `capability_acl` from older spec prose |
| T13 | Business logic | Do **not** rewrite `initFlow`, `buildFlowRoot`, `pushFlow`, etc. — wrap with citty + new output layer |
| T14 | Tests | Boundary tests + help contract tests; existing vitest suites must pass (use `--json` in assertions) |

---

## 4. Target command tree

```
mrmr [--version] [--help]
     [--json] [--space <spc_id>] [--hub-url <url>] [--token <tok>]

  login [--open] [--hub-url <url>]
  logout [--yes]
  whoami
  doctor                          # hub + auth + scope profile (Task 8)
  health

  space
    init                          # interactive setup wizard
    list
    show <space_id>
    create --slug --name [--install-policy] [--preview-policy] [--description]
    update <space_id> [--name] [--install-policy] [--preview-policy]
          [--query-policy <json|@file>]
    archive <space_id>
    grant
      list [--space]
      mint [--space] --label <s> [--harness] [--scopes] [--flow-acl] [--expires-days]
      revoke [--space] <grant_id>
      rotate [--space] <grant_id>
    member
      list [--space]
      invite [--space] --email --role <admin|editor|viewer>
      role [--space] <member_id> --role <admin|editor|viewer>
      remove [--space] <member_id>
    trigger
      list [--space]
      register [--space] [--name] [--filter @file] [--action @file] | flags
      disable [--space] <trigger_id>
      deliveries [--space] [--limit N]
      replay [--space] <trigger_id> [--body @file]
      templates [--space]
      event-catalog [--space]
      test-fire [--space] <trigger_id> [--body @file]

  hub
    federation
    grants-export [--out <path>]

  runtime
    events [--space] [from_seq]
    gates [--space]
    transition [--space] <instance_id> <event> <expected_revision>
    wait [--space] <wait_id> [--timeout <seconds>]
    audit export [--space] [since]

  flow
    init <id> [--dir] [--from-example] [--with-skill] [--install]
    validate [path] [--space --install]    # local OR hub evolution validate
    build [path]
    push [path] [--space]
    status [path]
    list [--space]
    doctor                                   # deprecated alias → mrmr doctor (§7.1)
    test|promote|apply|rollback [--space] [--install]
    dev [path] [--space] [--auto-apply] | [--sim] [--port] [--fixture]

  skill
    install|update|version [--dir]

# Separate binary (document in root help):
murrmure-mcp / mrmr-mcp   → MCP stdio server
```

---

## 5. Functional specifications (per command)

### 5.1 Global behavior

**Version:** Read from `packages/cli/VERSION` or `package.json` version; expose via citty meta + `mrmr --version`.

**Help footer (every leaf command):** Append line — use the **preflight mode** for that command (§6.1):

```
Requires: <scope> on <space>          # config routes (requireScope)
Requires: valid token for <space>     # product/runtime routes (requireTokenForSpace)
Requires: none | any valid token      # auth-free commands
```

Optional second line for runtime commands: `Typical scopes: …` (advisory only).

**Space ID resolution:** For commands needing a space:

1. Positional `<space_id>` if command defines one
2. Global `--space`
3. `MURRMURE_SPACE_ID`
4. `defaultSpaceId` from credentials
5. If still missing → error `MISSING_SPACE` with hint to pass `--space` or `export MURRMURE_SPACE_ID`

**Hub URL default:** `http://127.0.0.1:8787` when unset (match hub-commands.ts today).

### 5.2 Auth commands

#### `mrmr login [--open] [--hub-url <url>]`

**Purpose:** Persist hub URL + bearer token for local CLI use (documented in `environment.md`).

**Flow:**

1. Prompt hub URL (default `http://127.0.0.1:8787` or `--hub-url`)
2. If `--open`: `open` / `xdg-open` `{hubUrl}/configure` (or grants path) with message “copy token from Agent grants”
3. Clack password-style prompt for token (`tok_…`)
4. Optional: call `GET /v1/auth/whoami` to validate before save
5. Write `~/.murrmure/credentials` (mode `0600`)

**Credential file schema:**

```json
{
  "version": 1,
  "hubUrl": "http://127.0.0.1:8787",
  "token": "tok_…",
  "defaultSpaceId": "spc_ui_sandbox",
  "savedAt": "2026-06-24T12:00:00.000Z"
}
```

**Human output:** `✓ Logged in as act_… (3 spaces)`  
**JSON:** `{ "ok": true, "actor_id": "…", "spaces": [...] }`

**Requires:** none (pre-auth)

#### `mrmr logout [--yes]`

Delete `~/.murrmure/credentials`. Confirm unless `--yes`. Does not clear env vars.

#### `mrmr whoami`

**HTTP:** `GET /v1/auth/whoami`  
**Requires:** any valid token

**Human output:** Table — columns `SPACE`, `SCOPES` (comma-separated). Header: `actor_id`, `token_id`, `kind`, `expires_at`.

**JSON:** Pass through API response shape from `studio-specs/current/config/spec.md`.

### 5.3 `mrmr health`

**HTTP:** `GET /v1/health` (no auth)  
**Human:** `Hub ok · version 0.1.0 · uptime 42s · N flows`  
**JSON:** hub payload `{ status, version, uptime_s, flows }`

### 5.4 `mrmr space` — CRUD

#### `space list`

**HTTP:** `GET /v1/spaces`  
**Requires:** `space:enter`  
**Human:** table `SPACE_ID`, `NAME`, `SLUG`, `STATUS`  
**JSON:** `{ spaces: [...] }`

#### `space show <space_id>`

**HTTP:** `GET /v1/spaces/:space_id` (product route in `packages/studio-hub-daemon/src/routes.ts`)  
**Requires:** **token valid for space** (`requireToken` only — hub does **not** check `space:read` on this route)  
**Help text:** `Requires: valid token for <space>` (not `space:read`)

#### `space create`

**HTTP:** `POST /v1/spaces`  
**Requires:** `space:admin` (bootstrap token on empty hub)

**Body fields** (from config spec):

| Field | CLI flag | Default |
|-------|----------|---------|
| `slug` | `--slug` | required |
| `name` | `--name` | required |
| `install_policy` | `--install-policy` | `human_only` |
| `preview_policy` | `--preview-policy` | `same_origin_only` |
| `description` | `--description` | optional |
| `parent_space_id` | `--parent` | optional |

**Human:** print assigned `space_id` (e.g. `spc_ui_sandbox`)

#### `space update <space_id>`

**HTTP:** `PATCH /v1/spaces/:space_id`  
**Requires:** `space:admin`

Support `--query-policy '{"inbound_allowlist":["spc_…"]}'` or `@file.json` for cross-space query policy (no Configure UI yet).

#### `space archive <space_id>`

**HTTP:** `POST /v1/spaces/:space_id/archive`  
**Requires:** `space:admin`  
Surface denial if active instances exist.

#### `space init` (interactive wizard)

**Purpose:** CLI equivalent of browser `/setup` (`studio-specs/current/config/spec.md` § First-run wizard).

| Step | Action | CLI behavior |
|------|--------|--------------|
| 1 Connect | Hub URL + token | Reuse login flow |
| 2 Create spaces | `ui-sandbox`, `ui-production` | Offer defaults; call `space create` twice |
| 3 Link workflow | CDK push | Print instructions: `mrmr flow init …` + `push` (cannot auto-install without built bundle) |
| 4 Validate & test | Evolution | Print `mrmr flow validate/test` commands |
| 5 Agent access | Mint grant | Optional clack confirm → `space grant mint` with worker scope template |
| 6 Invite team | Members | Optional skip |
| 7 Verify | Links | Print hub URL + `mrmr doctor` |

**Requires:** `space:admin` on bootstrap or existing admin token  
**Must be skippable** at each step (Ctrl+C safe; partial progress saved).

### 5.5 `mrmr space grant`

**HTTP base:** `/v1/spaces/:space_id/grants`

| Subcommand | Method | Requires |
|------------|--------|----------|
| `list` | GET | `space:admin` |
| `mint` | POST | `space:admin` |
| `revoke` | POST `…/revoke` | `space:admin` |
| `rotate` | POST `…/rotate` | `space:admin` |

**`grant mint` body** (use `flow_acl`):

```json
{
  "label": "Dev Cursor — ui-sandbox worker",
  "harness": "cursor-local",
  "scopes": ["space:read", "event:read", "state:transition", "event:emit", "blob:read", "blob:write"],
  "flow_acl": ["review-loop"],
  "expires_in_days": 90
}
```

**Critical UX:** Response includes **one-time** `token` — print prominently in human mode with warning to save; never log to file by default. JSON mode includes token (scripts must handle securely).

**Scope denial example (human):**

```
✗ Missing scope: space:admin
  Your token can flow:install on spc_ui_sandbox but cannot mint grants.
  Run: mrmr whoami
```

### 5.6 `mrmr space member`

| Subcommand | HTTP | Requires |
|------------|------|----------|
| `list` | GET `/members` | `space:admin` |
| `invite` | POST `/members` | `space:admin` |
| `role` | PATCH `/members/:id` | `space:admin` |
| `remove` | DELETE `/members/:id` | `space:admin` |

### 5.7 `mrmr space trigger`

Map 1:1 to `packages/studio-hub-client/src/config.ts` `triggers` methods:

| Subcommand | HTTP | Requires |
|------------|------|----------|
| `list` | GET `/triggers` | `space:read` |
| `register` | POST `/triggers` | `trigger:register` |
| `register` (template) | POST `/triggers/from-template` | `trigger:register` |
| `templates` | GET `/triggers/templates` | `space:read` |
| `event-catalog` | GET `/triggers/event-catalog` | `space:read` |
| `test-fire` | POST `/triggers/:id/test-fire` | `trigger:register` |
| `disable` | POST `/triggers/:id/disable` | `trigger:register` |
| `deliveries` | GET `/triggers/deliveries` | `space:read` |
| `replay` | POST `/triggers/:id/replay` | `space:admin` |

Complex `filter` / `action` JSON: accept `--filter @path.json` and `--action @path.json`.

### 5.8 `mrmr hub`

| Command | HTTP | Requires |
|---------|------|----------|
| `federation` | GET `/v1/ops/federation/status` | `space:admin` |
| `grants-export` | GET `/v1/ops/grants/export` | `space:admin` (hub message: "Hub operator access required" — same scope check as federation) |

`grants-export`: stream blob to stdout or `--out file`.

### 5.9 `mrmr runtime` (migrated from `hub-commands.ts`)

**Important:** These are **product P0 routes** (`packages/studio-hub-daemon/src/routes.ts`). They call `requireToken(req, space_id)` — token must belong to the target space (or bootstrap token). They do **not** call `requireScope` for `space:read` or `state:transition`. Scope enforcement for transitions may happen deeper in the kernel on specific events, but the HTTP gate is token-for-space only.

| Command | HTTP | CLI preflight | Help footer (advisory) |
|---------|------|---------------|------------------------|
| `events [from_seq]` | GET `/v1/spaces/:id/events?from_seq=` | **token-for-space** | Typical grant: `event:read` |
| `gates` | GET `/v1/spaces/:id/gates` | **token-for-space** | Typical grant: `space:read` |
| `transition <ins> <event> <rev>` | POST `/v1/spaces/:id/instances/:ins/transitions` | **token-for-space** | Typical grant: `state:transition` |
| `wait <wait_id>` | GET `/v1/spaces/:id/waits/:wait_id` poll | **token-for-space** | Typical grant: `state:transition` |
| `audit export [since]` | GET `/v1/spaces/:id/audit/export?since=` | **token-for-space** | **Raw JSONL to stdout** always (pipe-friendly) |

**Preflight implementation:** Use `requireTokenForSpace` (§6.4), **not** scope-matrix `space:read` / `state:transition`. Do not block tokens that the hub would accept.

**Help UX:** `Requires: valid token for <space>` plus optional second line: `Typical scopes: event:read, state:transition, …` (documentation only).

**Migration note for CHANGELOG:**

```
mrmr events spc_x 0     →  mrmr runtime events --space spc_x 0
mrmr audit export spc_x →  mrmr runtime audit export --space spc_x
```

### 5.10 `mrmr flow` (existing behavior — new routing only)

Preserve logic in existing modules. Document each command in help.

| Command | Scope | Local vs hub |
|---------|-------|--------------|
| `init` | none | local filesystem |
| `validate [path]` | none locally; `flow:install` if `--space --install` | both |
| `build` | none | local |
| `push` | `flow:install` | hub `POST …/flows/install` |
| `status` | none | reads `~/.murrmure/flows/…/.flow-push-state.json` |
| `list` | `space:read` | hub |
| `doctor` | *(deprecated)* | alias → `mrmr doctor` (§7.1) |
| `test/promote/apply/rollback` | `flow:install` | hub evolution routes |
| `dev --space` | `flow:install` | hub watch loop |
| `dev --sim` | none | local sim server |

**`--json` shapes:** Preserve existing `{ ok, code?, message?, … }` objects used by skill, tutorials, and CI. Human formatters are new.

**Key `push` JSON fields** (must not break):

```json
{
  "ok": true,
  "install_id": "ins_…",
  "bundle_digest": "sha256:…",
  "next_steps": ["validate", "test", "promote", "apply"]
}
```

### 5.11 `mrmr skill`

Unchanged behavior from `packages/cli/src/skill/cli.ts`:

| Command | Scope | Action |
|---------|-------|--------|
| `install` | none | Copy to `.cursor/skills/murrmure-flow/` |
| `update` | none | Overwrite skill tree |
| `version` | none | Print bundled VERSION |

### 5.12 Explicitly NOT building

| Ghost command | Replacement |
|---------------|-------------|
| `mrmr review create` | MCP `create_review_session` or `POST /api/sessions` (review-loop live) |
| `mrmr review wait` | MCP `wait_for_review` or `POST /api/sessions/{key}/review-cycle` |

Remove all references from `apps/docs/guide/cli.md`.

---

## 6. Scope preflight implementation

### 6.1 Two preflight modes

CLI commands use **one of two** preflight strategies — match what the hub route actually does:

| Mode | When | Check |
|------|------|-------|
| **`requireScope`** | Config routes (`routes/config/index.ts`) — grants, members, flows list, evolution, triggers | Token has required scope for target space (§6.2) |
| **`requireTokenForSpace`** | Product routes (`routes.ts`) — events, gates, waits, audit, transitions, `space show` | Token is valid and authorized for `pathSpaceId` (bootstrap or matching space) |

Never apply `requireScope(..., "space:read")` to runtime product routes — the hub does not.

### 6.2 Algorithm (`requireScope` — config routes)

```
1. resolveAuth() → HubAuth | error
2. resolveSpaceId(commandArgs) → spaceId | error
3. ctx = getAuthContext(auth)   // whoami + token metadata, TTL 60s cache
4. scopes = resolveScopesForSpace(ctx, spaceId)   // §6.3 — NOT "find row in whoami.spaces" only
5. If hasScope(scopes, requiredScope) → proceed
6. Else printScopeError(requiredScope, scopes, spaceId) → exit 1
7. hubFetch(...)
8. On 403: parse denial envelope; map to human message
```

### 6.3 Resolving scopes for a space (bootstrap-safe)

**Do not** assume `whoami.spaces` always contains the target space.

`handleAuthWhoami` (`hub.ts`) behavior:

- **Bootstrap token** (`token.space_id === "bootstrap"` in persistence, not exposed in whoami JSON): whoami lists **all spaces** each with `token.scopes`.
- **Single-space token**: whoami returns one entry with that space + `token.scopes`.
- **Fresh hub (zero spaces)**: whoami returns `spaces: []` — token is still valid.

**`resolveScopesForSpace(ctx, spaceId)` rules:**

| Condition | Scopes to use |
|-----------|---------------|
| `ctx.tokenSpaceId === "bootstrap"` | `ctx.tokenScopes` (bootstrap bypass — matches hub `hasScope`) |
| whoami has matching `space_id` | that entry's `scopes` |
| whoami `spaces` empty **and** token validated | `ctx.tokenScopes` (first `space create` on empty hub) |
| else | fail `SCOPE_UNKNOWN_SPACE` — token cannot act on requested space |

**Store on auth context** (from whoami + optional `GET /v1/auth/whoami` header context or infer from first whoami):

- `tokenScopes: string[]` — union or canonical scopes from whoami when single-space
- `tokenSpaceId: string | "bootstrap"` — infer: if whoami.spaces.length > 1 with identical scopes → bootstrap; if empty → bootstrap or orphan (allow create); if 1 → that space

Executors: add unit tests for **empty whoami.spaces + space create** — must not block.

### 6.4 Algorithm (`requireTokenForSpace` — product / runtime routes)

```
1. resolveAuth() → HubAuth | error
2. resolveSpaceId(commandArgs) → spaceId
3. ctx = getAuthContext(auth)
4. If ctx.tokenSpaceId === "bootstrap" → proceed
5. If bare(ctx.tokenSpaceId) === bare(spaceId) → proceed
6. If whoami.spaces has matching space_id → proceed (token listed for space)
7. Else print error TOKEN_WRONG_SPACE → exit 1
8. hubFetch(...)   // no scope name check
```

Matches `requireToken` in `packages/studio-hub-daemon/src/auth.ts` lines 36–42.

### 6.5 `hasScope` (must match hub)

```typescript
function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required) || scopes.includes("space:admin");
}
```

Bootstrap: when `tokenSpaceId === "bootstrap"`, hub `hasScope` returns true for any scope — CLI preflight should **skip scope name check** (always proceed after auth).

### 6.6 Scope matrix — config routes only (`requireScope`)

| Scope | Commands |
|-------|----------|
| *(none)* | `health`, `login`, `logout`, `flow init`, `flow build`, `flow validate` (local), `flow status`, `flow dev --sim`, `skill *` |
| any valid token | `whoami`, `mrmr doctor` |
| `space:enter` | `space list` |
| `space:read` | `space trigger list`, `deliveries`, `templates`, `event-catalog`, `flow list` |
| `space:admin` | `space init`, `create`, `update`, `archive`, `grant *`, `member *`, `hub federation`, `hub grants-export`, `space trigger replay` |
| `flow:install` | `flow push`, `flow validate --install`, `test`, `promote`, `apply`, `rollback`, `flow dev` (hub mode) |
| `flow:configure` | reserved |
| `trigger:register` | `space trigger register`, `disable`, `test-fire` |

### 6.7 Scope matrix — product routes (`requireTokenForSpace` only)

| Commands | Help `Requires:` line |
|----------|----------------------|
| `space show` | `valid token for <space>` |
| `runtime events`, `gates`, `transition`, `wait`, `audit export` | `valid token for <space>` (+ advisory typical scopes in description) |

---

## 7. Output contract (normative)

| Mode | stdout | stderr | Exit |
|------|--------|--------|------|
| human (default) | Formatted result | consola info/warn/error | 0 / 1 / 2 |
| `--json` | JSON only | empty | 0 / 1 / 2 |

**Exit codes:** `0` ok · `1` operational error (auth, scope, hub denial, validation) · `2` usage (citty)

**Error JSON shape:**

```json
{
  "ok": false,
  "code": "SCOPE_MISSING",
  "message": "Administrator access required for this action",
  "hint": { "required_scope": "space:admin", "space_id": "spc_ui_sandbox" }
}
```

**Human error example:**

```
✗ Administrator access required (space:admin)
  Tip: mrmr whoami · mint a new grant in Configure → Agent grants
```

**Exceptions:**

- `runtime audit export` — always raw JSONL on stdout (binary-safe piping)
- `hub grants-export` — raw export bytes to stdout or `--out`

### 7.1 `mrmr doctor` (Task 8)

**Canonical command:** `mrmr doctor` only.

**`mrmr flow doctor`:** Deprecated thin alias — calls same implementation, prints to stderr: `Note: use mrmr doctor (flow doctor is deprecated)`.

Report:

- Resolved auth source (env / credentials / shared.json)
- Hub URL reachability (`/v1/health`)
- Token validity (`/v1/auth/whoami`)
- Per-space: scopes list
- Capability summary: “can push flows”, “can mint grants”, “can register triggers”
- Dev-kit version skew (existing doctor logic)
- Issues array in JSON mode

---

## 8. Implementation layout

```
packages/cli/src/
  main.ts                    # runMain(rootCommand); replace cli.ts entry in tsup
  commands/
    root.ts                  # citty root + global flags
    auth.ts
    health.ts
    doctor.ts
    space/
      index.ts               # space subcommand router
      crud.ts
      grant.ts
      member.ts
      trigger.ts
      init-wizard.ts
    hub.ts
    runtime.ts
    flow/
      index.ts               # lazy imports per command
    skill.ts
  lib/
    output.ts                # printOk, printErr, isJsonMode, formatters
    flags.ts                 # parse global flags from citty context
    auth-store.ts            # credentials file R/W
    auth.ts                  # resolveHubAuth (extend, don't duplicate)
    scope.ts                 # requireScope, requireTokenForSpace, whoami cache, resolveScopesForSpace (§6)
    hub-request.ts           # hubFetch + JSON parse + denial mapping
    space-id.ts              # resolveSpaceId helper
```

**Delete after migration:**

- Manual routing in `cli.ts` (replace with `main.ts` or rename)
- `hub-commands.ts`
- `commander` dependency
- Duplicate `parseArgs` in skill (use shared citty command)

**tsup.config.ts:** Point entry `cli: "src/main.ts"` (or keep `cli.ts` importing main).

**Keep unchanged (unless bugfix):** `init.ts`, `build.ts`, `push.ts`, `validate.ts`, `dev.ts`, `dev-sim/`, `mcp/`, `skill/install.ts`, `templates/`, `skill/`.

---

## 9. Documentation artifacts (must stay in sync)

| File | Action |
|------|--------|
| `studio-specs/current/cli/spec.md` | **Create** — normative command tree (Task 1 start, complete Task 8) |
| `studio-specs/current/build-capability/02-sdk.md` | Update CLI table + output contract |
| `studio-specs/current/build-capability/08-auth-profiles-local-cloud-ci.md` | Add credentials file + login |
| `studio-specs/current/config/spec.md` | Footnote: CLI parity via `mrmr space` |
| `studio-specs/current/index.md` | Link cli/spec.md |
| `apps/docs/guide/cli.md` | Full rewrite to match tree; remove review |
| `apps/docs/guide/configuration.md` | Remove “browser only”; add CLI table |
| `apps/docs/guide/installation.md` | login/whoami accurate |
| `apps/docs/reference/environment.md` | credentials schema |
| `apps/docs/reference/http-api.md` | Link to cli spec |
| `apps/docs/reference/flow-dev-kit.md` | `--json` note |
| `packages/cli/skill/reference/cli.md` | Full tree |
| `packages/cli/CHANGELOG.md` | Breaking changes |

---

## 10. Testing requirements

### 10.1 Help contract (every task adds coverage)

`packages/cli/test/help-contract.test.ts`:

- Invoke `renderUsage()` from citty for each command node
- Assert non-empty description
- Assert contains `Requires:`

`packages/cli/test/help.test.ts` — spawn `node dist/cli.js <args> --help` integration.

### 10.2 Scope preflight

Unit tests in `packages/cli/test/scope.test.ts` — mock whoami responses; assert exit code 1 + message.

### 10.3 Existing suites

`validate.test.ts`, `build-assets.test.ts`, `dev-sim.test.ts`, `cdk-conformance.test.ts`, `digest.test.ts` — must remain green.

### 10.4 Hub integration

Where possible reuse `packages/studio-hub-daemon/test/http/*.test.ts` patterns. CLI tests may spin mock `fetch` rather than full daemon unless `test:acceptance` covers smoke.

### 10.5 Per-task gate

```bash
pnpm typecheck && pnpm build && pnpm test
# + when hub routes touched:
pnpm test:acceptance
```

---

## 11. Tasks (vertical slices)

Each task is a **vertical slice**: code + tests + docs + `studio-specs/current` in one pass. Orchestrator delegates to dev subagent; then 3 review subagents; fix loop.

**Task format for implementers:**

| Field | Purpose |
|-------|---------|
| **Goal** | Why this slice exists — the outcome we're unlocking |
| **User story** | Who benefits and what they can do when this ships |
| **Work** | Concrete deliverables (files, commands, tests) |
| **Done when** | Slice-specific acceptance — task is complete only when these pass |

---

### Task 1 — Foundation

**Goal:** Replace the hand-rolled argv parser with a real CLI framework and shared libraries so every later task plugs into one consistent help, output, and auth layer — instead of copying `parseArgs()` a third time.

**User story:** As a **developer installing `@murrmure/cli`**, I want `mrmr --help` to show a clear command tree and `mrmr --version` to work, so I can discover what the tool does before reading the docs.

**Work**

- Add `citty`, `@clack/prompts`; remove `commander`
- **Citty spike (first PR step):** prove nested subcommands + global `--json` + `renderUsage` in a minimal `main.ts` before wiring all groups — de-risk framework choice
- Implement `lib/output.ts`, `lib/scope.ts` (both `requireScope` and `requireTokenForSpace` stubs per §6), `lib/flags.ts`, `lib/auth-store.ts`, `lib/hub-request.ts`
- Root citty command + stub subcommands (usage only — commands print "not implemented" or no-op where needed)
- Create `studio-specs/current/cli/spec.md` (skeleton: goals, output contract, **two preflight modes** §6.1, command index with stubs marked)
- Tests: `help.test.ts` — root `--help` lists all planned top-level groups; `scope.test.ts` — `hasScope`, bootstrap empty-spaces case (§6.3), `requireTokenForSpace` vs `requireScope` selection
- Docs: `apps/docs/guide/cli.md` — intro rewrite (human default, `--json`, planned tree)

**Done when**

- `pnpm typecheck && pnpm build && pnpm test` green
- `node dist/cli.js --help` shows space, hub, runtime, flow, skill groups
- `scope.test.ts` includes **empty whoami.spaces + bootstrap scopes** case (must pass preflight for `space:create`)
- `studio-specs/current/cli/spec.md` exists with §6.1 two-mode preflight documented

**Changeset:** none (no user-visible commands yet)

---

### Task 2 — Auth (`login`, `logout`, `whoami`)

**Goal:** Close the gap between docs and code — `login` and `whoami` are documented today but **do not exist**. Operators should not export env vars manually on every new shell.

**User story:** As a **flow builder on my laptop**, I want to run `mrmr login` once and `mrmr whoami` to see which spaces and scopes my token has, so I know I can push flows before running `mrmr flow push` and I don't have to re-export `MURRMURE_HUB_TOKEN` every session.

**Work**

- Implement auth commands per §5.2
- Extend `resolveHubAuth` per §3 T6 (flags → env incl. legacy → credentials → shared.json)
- Credential file `~/.murrmure/credentials` with mode `0600`
- **`getAuthContext`:** cache whoami; expose `tokenScopes`, `tokenSpaceId` for §6.3 scope resolution
- Tests: credential round-trip; whoami mock; login validates token before save
- Docs: `environment.md`, `installation.md`, `cli.md` auth section, `skill/reference/cli.md`
- Update `studio-specs/current/cli/spec.md` — auth section

**Done when**

- `mrmr login` + `mrmr whoami` work against a running hub (or mocked fetch)
- `mrmr logout` clears credentials
- Docs no longer describe login as unimplemented
- Scope data from whoami is available to `lib/scope.ts` via `getAuthContext` (bootstrap + empty-spaces cases tested)

**Changeset:** minor

---

### Task 3 — Migrate `flow` + `skill`

**Goal:** The commands builders use daily (`flow init`, `validate`, `push`, …) get proper `--help` and readable output — without rewriting the build/push/validate logic that already works.

**User story:** As a **flow author**, I want `mrmr flow push --space spc_x` to tell me clearly what happened (install id, next steps) and `mrmr flow validate --help` to list every flag, so I can work in the terminal without piping everything through `jq` — while my CI scripts keep using `--json` unchanged.

**Work**

- Citty commands wrapping existing modules (`init.ts`, `build.ts`, `push.ts`, …) — **do not duplicate business logic**
- Human formatters: validate errors, push success + `next_steps`, init scaffold summary
- Full `--help` per §5.10, §5.11 — every leaf includes `Requires:` line (config routes use scope; no runtime yet)
- **`mrmr flow doctor`:** stub as deprecated alias only if citty tree needs it — full impl deferred to Task 8
- Breaking: default stdout is human; `--json` preserves existing shapes
- Tests: help for all 12 flow + 3 skill leaves; existing `validate.test.ts`, `build-assets.test.ts`, etc. pass (assert with `--json`)
- Docs: `flow-dev-kit.md`, `02-sdk.md`, skill reference, CHANGELOG note on breaking output
- Update `studio-specs/current/cli/spec.md` — flow + skill sections

**Done when**

- Every `mrmr flow <cmd> --help` and `mrmr skill <cmd> --help` is non-empty with `Requires:`
- `mrmr flow push --json` output shape matches pre-migration (install_id, next_steps, …)
- Human `mrmr flow validate .` prints readable errors when manifest is invalid
- All existing CLI vitest suites green

**Changeset:** minor (breaking default output)

---

### Task 4 — `runtime` + `health`

**Goal:** Give operators and CI scripts a proper home for hub runtime commands (events, gates, transitions) with help and unified auth — and remove **ghost documentation** (`mrmr review`) that was never built.

**User story:** As a **platform operator automating a space**, I want `mrmr runtime events --space spc_x` to tail the journal and `mrmr runtime transition …` to apply a state change from a script, with `--help` explaining args and required scopes — so I don't need to craft raw curl calls or guess env var names.

**Work**

- Migrate `hub-commands.ts` → `commands/runtime.ts` + `commands/health.ts`
- Fix auth bug: hub commands today ignore `resolveHubAuth()` / credential file — use unified auth
- Preflight: **`requireTokenForSpace` only** per §6.4 / §6.7 — do **not** use `requireScope(space:read)` on runtime commands
- Help: `Requires: valid token for <space>` + advisory typical scopes in description
- **Delete** `mrmr review` section from `apps/docs/guide/cli.md`; replace with one line → MCP
- Tests: help per subcommand; **token-wrong-space** denial; mock fetch; token **without** `space:read` can still call `runtime events` if token-for-space passes
- Docs: `cli.md` runtime section; `studio-specs/current/cli/spec.md` runtime section

**Done when**

- `mrmr health` works without auth
- `mrmr runtime events|gates|transition|wait|audit export` work with credential-based auth
- Old flat `mrmr events` removed (breaking — documented in CHANGELOG draft §13)
- No `mrmr review` references remain in docs

**Changeset:** minor

---

### Task 5 — `space` CRUD + `init`

**Goal:** Hub **Configure** is not the only way to create and manage spaces — admins need CLI parity for bootstrapping, CI, and headless setups.

**User story:** As a **team admin standing up a new hub**, I want `mrmr space init` to walk me through first-run setup (like the browser `/setup` wizard) or `mrmr space create --slug ui-sandbox --name "UI Sandbox"` in CI, so I can provision spaces without opening the shell UI.

**Work**

- Implement §5.4: `list`, `show`, `create`, `update`, `archive`, `init` (clack wizard)
- Wizard steps per §5.4 table; skippable; partial progress OK
- Scope preflight: `space:admin` for mutating commands; **`space create` on empty hub** must work with bootstrap token when whoami returns `spaces: []` (§6.3)
- Tests: create/list with mock fetch; wizard smoke with mocked clack prompts
- Docs: `configuration.md` — **remove "browser only"**; add CLI equivalents table; `cli.md` space section
- Update `studio-specs/current/cli/spec.md` — space CRUD

**Done when**

- `mrmr space list` shows spaces from `GET /v1/spaces`
- `mrmr space create` creates a space on hub (or mock test proves wire format) **including fresh hub / empty whoami.spaces**
- `mrmr space init` runs through connect + create without crashing
- `configuration.md` explicitly says Configure **or CLI**

**Changeset:** minor

---

### Task 6 — `space grant` + `member`

**Goal:** Agent access and team membership are security-sensitive Configure actions — admins need scriptable, auditable CLI commands with safe token handling.

**User story:** As a **space admin**, I want `mrmr space grant mint --space spc_x --label "CI deploy"` to create a grant and show me the one-time token once, and `mrmr space member invite --email …` to add a teammate — so I can automate onboarding without clicking through Configure.

**Work**

- Implement §5.5, §5.6
- Mint: wire `flow_acl`; print token once with warning; never auto-save token to disk
- Scope preflight: `space:admin`; clear error when deploy token (`flow:install` only) tries to mint
- Tests: help; scope denial for non-admin token; mint response mock
- Docs: `configuration.md` grants + members CLI sections
- Update `studio-specs/current/cli/spec.md`

**Done when**

- `mrmr space grant list|mint|revoke|rotate` hit correct HTTP routes
- `mrmr space member list|invite|role|remove` hit correct HTTP routes
- Non-admin token gets human-readable scope error before HTTP (not raw 403 JSON)
- Mint human output warns "save this token — it won't be shown again"

**Changeset:** minor

---

### Task 7 — `space trigger` + `hub`

**Goal:** Complete Configure parity for automation hooks (triggers) and hub-level ops (federation, grant export) — the remaining admin surface from the config spec.

**User story:** As a **DevOps engineer**, I want `mrmr space trigger register` to register a wake rule and `mrmr hub grants-export --out audit.json` to export grants for compliance — so event-driven agent wakes and security audits don't require the browser.

**Work**

- Implement §5.7, §5.8 — map to `packages/studio-hub-client/src/config.ts` trigger + ops methods
- JSON file inputs: `--filter @file`, `--action @file` for complex trigger bodies
- Tests: help; mock register/list; grants-export stdout
- Docs: `configuration.md` triggers; `http-api.md` link to cli spec
- Complete `studio-specs/current/cli/spec.md` command entries (triggers + hub)

**Done when**

- All trigger subcommands from §5.7 have `--help` and correct scope preflight
- `hub federation` and `hub grants-export` work (or mock-tested)
- `studio-specs/current/cli/spec.md` covers full command tree except doctor polish (Task 8)

**Changeset:** minor

---

### Task 8 — Doctor + help gate + final sync

**Goal:** Tie everything together — one diagnostic command that explains *why* something might fail, and an automated gate proving **every** command documents itself before we ship 0.2.0.

**User story:** As a **builder hitting auth errors**, I want `mrmr doctor` to tell me "hub reachable, token valid, you have flow:install but not space:admin — you can't mint grants" — so I fix the right problem in one command instead of trial-and-error across push, login, and whoami.

**Work**

- Top-level `mrmr doctor` per §7.1 (hub health + whoami + scope capability summary + dev-kit skew)
- `mrmr flow doctor` deprecated alias delegating to `mrmr doctor`
- `packages/cli/test/help-contract.test.ts` — walk full citty tree; assert every leaf has description + `Requires:`
- Remove any remaining manual `usage:` strings in codebase
- **Spec drift sync:** update `studio-specs/current/config/spec.md` — `flow_acl`, `flow:*` scopes, `/flows/` paths where wrong; add CLI parity footnote
- Final doc sync: `cli.md`, `skill/reference/cli.md`, `current/index.md` link, `CHANGELOG.md` §13 content
- `studio-specs/current/cli/spec.md` — complete and matches implementation

**Done when**

- `mrmr doctor` prints profile section (human) and `{ ok, issues, profile }` (json)
- `mrmr flow doctor` prints deprecation hint and delegates to same impl
- `help-contract.test.ts` passes for entire command tree
- `config/spec.md` drift fixed (`flow_acl`, `flow:*` scopes) per §1.4
- §14 acceptance checklist items all satisfied
- `pnpm typecheck && pnpm build && pnpm test` green; `test:acceptance` if in scope

**Changeset:** bundle entire feature as **0.2.0 minor** (single release)


---

## 12. Review agent checklist (use after each task)

**Scope & contract**

- [ ] Only planned commands added; no `mrmr review`
- [ ] HTTP paths match **hub daemon routes first** (§1.4); then `config/spec.md` after Task 8 sync
- [ ] `flow_acl` used on grant mint (not stale `capability_acl` in wire)
- [ ] Runtime commands use `requireTokenForSpace` only — not `requireScope(space:read)`
- [ ] Bootstrap / empty `whoami.spaces` does not block `space create`
- [ ] Breaking changes documented
- [ ] Business logic not duplicated from flow modules

**Failure & trust**

- [ ] Correct preflight mode per route type (§6.1): `requireScope` vs `requireTokenForSpace`
- [ ] Scope preflight before config-route mutating calls
- [ ] Mint token shown once; not written to disk by default
- [ ] Credentials file mode `0600`
- [ ] Hub 403 mapped to human errors
- [ ] Missing `--space` fails clearly

**Experience & craft**

- [ ] Every leaf has `--help` with Requires line
- [ ] Human output readable without jq
- [ ] `--json` stable for CI (`flow push`, evolution cmds)
- [ ] `audit export` pipe-friendly
- [ ] consola on stderr only in human mode

---

## 13. User migration (CHANGELOG)

```markdown
## 0.2.0

### Breaking
- Default output is human-readable; use `--json` in scripts.
- Hub commands moved under `mrmr runtime`:
  - `mrmr events` → `mrmr runtime events --space <id>`
  - `mrmr gates` → `mrmr runtime gates --space <id>`
  - etc.
- `mrmr review` was never implemented; removed from docs. Use MCP or review-loop HTTP API.

### Added
- `mrmr login`, `logout`, `whoami`
- `mrmr space` (init, CRUD, grant, member, trigger)
- `mrmr hub` (federation, grants-export)
- `--help` on all commands; scope preflight
```

---

## 14. Acceptance checklist (human gate before publish)

- [ ] `mrmr --help` lists: login, logout, whoami, doctor, health, space, hub, runtime, flow, skill
- [ ] Every leaf: `mrmr <path> --help` non-empty + Requires line
- [ ] `mrmr login` + `mrmr whoami` against local hub (`pnpm --filter @murrmure/hub-daemon dev`)
- [ ] `mrmr space create` on **fresh hub** (bootstrap token, whoami `spaces: []`) succeeds
- [ ] `mrmr space init` happy path on fresh hub
- [ ] Deploy token + `mrmr space grant mint` → clear scope error (`space:admin`)
- [ ] Token without `space:read` but valid for space can run `mrmr runtime events`
- [ ] `mrmr flow push --json` shape unchanged
- [ ] No `mrmr review` in repo docs
- [ ] `studio-specs/current/cli/spec.md` matches implementation
- [ ] `studio-specs/current/config/spec.md` drift fixed (Task 8)
- [ ] `pnpm typecheck && pnpm build && pnpm test` green

---

## 15. Publish

- `@murrmure/cli` only publishable package touched
- `pnpm changeset` when user requests release ([agent.md](../../agent.md) phase 4)
- Target version: **0.2.0** (minor — breaking + features)
- On completion: move this plan to `studio-specs/archives/plans/cli-dx-v1.md`

---

## 16. References

| Resource | Path |
|----------|------|
| Config shell spec | `studio-specs/current/config/spec.md` |
| FDK CLI commands | `studio-specs/current/build-capability/02-sdk.md` |
| Auth profiles | `studio-specs/current/build-capability/08-auth-profiles-local-cloud-ci.md` |
| HTTP API overview | `apps/docs/reference/http-api.md` |
| Hub scope helper | `packages/studio-hub-daemon/src/routes/config/scopes.ts` |
| Hub client routes | `packages/studio-hub-client/src/config.ts` |
| Current CLI entry | `packages/cli/src/cli.ts` |
| Current hub commands | `packages/cli/src/hub-commands.ts` |
| citty docs | https://github.com/unjs/citty |
