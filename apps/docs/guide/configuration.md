# Configuration

The **Configuration** surface is where team admins set up Murrmure. Everything here is done in the **browser** — no curl, no API scripts.

Toggle **Runtime | Configure** in the top bar. Requires a token with **`space:admin`** (or bootstrap on self-hosted).

## First-run setup wizard

Route: **`/setup`**

| Step | What happens |
|------|----------------|
| Connect | Save hub URL + token |
| Create spaces | `ui-sandbox` + `ui-production` |
| Install workflow | Review loop → live |
| Validate & test | Evolution checks |
| Agent access | Worker grant + MCP snippet |
| Invite team | Sample invites |
| Verify | Open runtime |

Sets `murrmure_setup_complete` in the browser.

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

**Configure → [space] → Agent grants → Mint grant**

| Field | Notes |
|-------|-------|
| Label | Who this token is for |
| Harness | `cursor-local`, `ci`, … |
| Template | **Worker** (agents) or **Admin** (setup) |

Copy the **one-time token** into MCP config (`MURRMURE_HUB_TOKEN`). The setup wizard also prints a full MCP JSON snippet.

**Worker** scopes include `state:transition`, `event:emit`, `blob:write`, `space:read`. Domain tools (review, feature-spec) appear when the matching flow is **live** in that space.

Revoke from the grants list if a token leaks.

## Members

**Configure → [space] → Members** — invite by email (admin / editor / viewer).

## Triggers

**Configure → [space] → Triggers** — register event → wake rules; view delivery log.

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
