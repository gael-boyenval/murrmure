# Configuration

The **Configuration** surface is where team admins set up Murrmure. Use the **browser** (Configure shell) or the **`mrmr space`** CLI — same hub APIs, your choice.

Toggle **Runtime | Configure** in the top bar. Requires a token with **`space:admin`** (or bootstrap on self-hosted).

## First-run setup wizard

| Surface | Route / command |
|---------|-----------------|
| Browser | **`/setup`** |
| CLI | **`mrmr space init`** |

| Step | What happens |
|------|----------------|
| Connect | Save hub URL + token |
| Create spaces | `ui-sandbox` + `ui-production` |
| Install workflow | Review loop → live |
| Validate & test | Evolution checks |
| Agent access | Worker grant + MCP snippet |
| Invite team | Sample invites |
| Verify | Open runtime |

Browser wizard sets `murrmure_setup_complete`. CLI steps are skippable; partial progress is kept (credentials and created spaces persist).

### CLI equivalents

| Configure UI | CLI |
|--------------|-----|
| `/setup` wizard | `mrmr space init` |
| Create space | `mrmr space create --slug … --name …` |
| Space list / detail | `mrmr space list` · `mrmr space show <spc_id>` |
| Update space / query policy | `mrmr space update <spc_id> …` |
| Archive space | `mrmr space archive <spc_id>` |
| Agent grants | `mrmr space grant …` (rolling out) |
| Members | `mrmr space member …` (rolling out) |
| Triggers | `mrmr space trigger …` |

See [CLI guide](./cli.md#mrmr-space).

## Spaces

**Configure → Create space** → **`/configure/spaces/new`**

| Field | Notes |
|-------|-------|
| Name | Display name |
| Slug | Drives space id (`ui-sandbox` → `spc_ui_sandbox`) |
| Install policy | `human_only` \| `authorized_agents` \| `allow_list` |

**Configure → [space]** shows install/preview policy (read-only in v0).

## Flows

**Configure → [space] → Flows**

### User-authored flows (FDK)

New workflows are built **outside** the platform repo with `@murrmure/cli`:

1. **New flow** — onboarding steps (`/configure/spaces/:id/flows/new`)
2. Builder runs `init` → `validate` → `build` → `push` from their machine
3. Install appears as **draft** with `source_path`, `bundle_digest`, `built_at`
4. **Validate → Test → Promote → Apply live** (same evolution pipeline as below)

Full walkthrough: **[Flows tutorial](./flows-tutorial)**.

### Reference examples (FDK)

Install reference flows from `examples/flows/` via FDK push or local-path bundle:

| Example | Purpose |
|---------|---------|
| **review-loop** | Review sessions (worker bundle) |
| **feature-spec** | Structured specs + `spec.published` triggers |

Use the [flows tutorial](./flows-tutorial) for custom workflows.

### Install → live

1. **Push from CDK** — `mrmr flow push --space …` creates **`draft`**
2. **Configure → Flows → [install]** — **Validate** → **Test** → **Promote**
3. **Apply live (CLI)** — `mrmr flow apply --space … --install ins_…` mounts the worker and publishes MCP tools

::: tip Full walkthrough
See **[Flow evolution pipeline](./flow-evolution)** — state meanings, what each button does, contract diff, gates, and verification commands (including **`app-live-review`**).
:::

Breaking semver promotes may create **`promoted_pending`** — approve under **Runtime → Gates** before apply.

Install config fields come from your bundle's `contract/config.schema.json` (FDK) or package defaults (reference catalog).

Contributors and builders: [Flows tutorial](./flows-tutorial).

## Agent grants

**Configure → [space] → Agent grants → Mint grant** — or use the CLI:

```bash
# List grants
mrmr space grant list --space spc_ui_sandbox

# Mint a worker grant (flow_acl limits MCP tools)
mrmr space grant mint --space spc_ui_sandbox \
  --label "Dev Cursor — ui-sandbox worker" \
  --harness cursor-local \
  --flow-acl review-loop \
  --expires-days 90

# Revoke or rotate
mrmr space grant revoke --space spc_ui_sandbox grt_…
mrmr space grant rotate --space spc_ui_sandbox grt_…
```

Requires **`space:admin`** on the target space. Deploy tokens (`flow:install` only) cannot mint grants.

| Field | Notes |
|-------|-------|
| Label | Who this token is for |
| Harness | `cursor-local`, `ci`, … |
| Template | **Worker** (agents) or **Admin** (setup) |
| `flow_acl` | Package ids the grant may use (e.g. `review-loop`) — wire field is **`flow_acl`**, not `capability_acl` |

Copy the **one-time token** into MCP config (`MURRMURE_HUB_TOKEN`). The CLI prints it once with a warning; the setup wizard also prints a full MCP JSON snippet.

**Worker** scopes include `state:transition`, `event:emit`, `blob:write`, `space:read`. Domain tools (review, feature-spec) appear when the matching flow is **live** in that space.

Revoke from the grants list or `mrmr space grant revoke` if a token leaks.

## Members

**Configure → [space] → Members** — or use the CLI:

```bash
mrmr space member list --space spc_ui_sandbox
mrmr space member invite --space spc_ui_sandbox --email dev@example.com --role editor
mrmr space member role --space spc_ui_sandbox mem_… --role admin
mrmr space member remove --space spc_ui_sandbox mem_…
```

Roles: **admin**, **editor**, **viewer**. Requires **`space:admin`**.

## Triggers

**Configure → [space] → Triggers** — register event → wake rules; view delivery log.

### CLI

Requires **`space:read`** (list, deliveries, templates, event catalog), **`trigger:register`** (register, disable, test-fire), or **`space:admin`** (replay).

```bash
# List triggers and delivery log
mrmr space trigger list --space spc_dev
mrmr space trigger deliveries --space spc_dev --limit 20

# Register from bundled template
mrmr space trigger register --space spc_dev \
  --template spec-published-wake-dev \
  --source-space spc_orchestrator

# Register custom filter/action (JSON or @file.json)
mrmr space trigger register --space spc_dev \
  --name backend-ready-wake-frontend \
  --filter @filter.json \
  --action @action.json

# Debug and admin
mrmr space trigger test-fire --space spc_dev trg_…
mrmr space trigger disable --space spc_dev trg_…
mrmr space trigger replay --space spc_dev trg_… --body '{"source_event_id":"evt_001"}'

# Discover templates and event types
mrmr space trigger templates --space spc_dev
mrmr space trigger event-catalog --space spc_dev
```

### From template (browser)

**Configure → [space] → Triggers → Register trigger**

1. Choose a template (e.g. **Spec published → wake dev agent**)
2. Set **source space id** — where `spec.published` (or `work.ready`) originates
3. Register on the **target** space — where the dev/frontend agent listens
4. Confirm deliveries under **Delivery log**

Bundled templates: `spec-published-wake-dev`, `work-ready-wake-frontend`. Wake payloads include summary fields only — not full spec bodies or `body_ref`. Woken agents use **`query_ask`** (`spec_summary@1`) or **`get_spec`** when they have a read grant on the source space.

### Cross-space query policy

To allow another space to **`query_ask`** into this space, set `query_policy.inbound_allowlist` on the **target** space (API: `PATCH /v1/spaces/{id}` with `{ query_policy: { inbound_allowlist: ["spc_…"] } }`). Configure UI for query policy is not shipped yet.

## Hub settings

**Configure → Hub settings** — health, federation relay, hub-wide grant export.

```bash
mrmr hub federation
mrmr hub grants-export --out grants-audit.json
# or pipe: mrmr hub grants-export > grants-audit.json
```

Requires **`space:admin`** (bootstrap token on self-hosted).

## Self-hosted operators

```bash
pnpm --filter @murrmure/hub-daemon start
pnpm --filter @murrmure/shell-web dev
```

Open the shell → **`/connect`** → bootstrap token → **`/setup`**.

End users and agents never run these commands — only whoever hosts the hub.

## Next

- [Browser app](./browser) — runtime routes
- [Connect your agent](./agents-mcp)
- [Self-hosted hub](./self-hosted)
