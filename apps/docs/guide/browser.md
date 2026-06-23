# Browser app

Studio runs in the browser — **[app.studio.dev](https://app.studio.dev)** on cloud, or your org's self-hosted shell URL. No desktop app, no repo clone, **no curl** for normal setup or daily work.

## Two modes

Toggle **Runtime | Configure** in the top bar.

| Mode | Who | What you do |
|------|-----|-------------|
| **Configure** | Admins | Spaces, capabilities, agent grants, members, triggers |
| **Runtime** | Everyone with access | Instances, gates, audit, review canvas, spec canvas |

If you only review or approve gates, you stay in **Runtime**. If you set up the team, use **Configure** first.

## Connect (self-hosted)

On first visit you land on **`/connect`**:

1. **Hub URL** — e.g. `http://127.0.0.1:8787` (local) or `https://studio.yourcompany.com`
2. **Token** — bootstrap token during setup, or an admin grant afterward
3. **Save & continue** → **`/setup`** wizard (first run) or **`/configure`**

Cloud users sign in with email or SSO — no token paste on the connect screen.

## First-run setup wizard

Route: **`/setup`**

Seven steps, mostly **Continue** clicks:

1. **Connect** — hub URL + token
2. **Create spaces** — `ui-sandbox` + `ui-production`
3. **Install workflow** — bundled **Review loop**
4. **Validate & test** — evolution checks
5. **Agent access** — mint Worker grant + **copy MCP snippet**
6. **Invite team** — sample member invites
7. **Verify** — opens runtime for sandbox

Marks setup complete and stores your connection in the browser.

## Configure — spaces

| Action | Navigation |
|--------|------------|
| Dashboard | **`/configure`** |
| Create space | **Configure → Create space** → **`/configure/spaces/new`** |
| Space settings | **Configure → [space]** → **`/configure/spaces/:spaceId`** |

When creating a space, set **install policy**:

- `authorized_agents` — agents may install/evolve in this space (sandbox)
- `human_only` — only humans install capabilities (production)

Copy the **space id** (`spc_…`) — agents need it in MCP config as `STUDIO_SPACE_ID`.

## Configure — capabilities

**Configure → [space] → Capabilities**

| Action | Navigation |
|--------|------------|
| List installs | **`/configure/spaces/:spaceId/capabilities`** |
| Install from catalog | **Install capability** → **`…/capabilities/install`** |
| Evolution pipeline | **`…/capabilities/:installId`** — Validate, Test, Promote |

Bundled packages: **Review loop**, **Feature spec**.

Typical path to go live:

1. **Push from CDK** (or install) — creates **`draft`**
2. Open the install → **Validate** → **Test** → **Promote**
3. Run **`studio capability apply --space … --install ins_…`** — mounts worker + MCP (CLI today)
4. When truly **`live`**, MCP tools and `/api/*` routes for that package are active

If promote waits on a production gate, open **Runtime → Gates** and **Approve** before apply.

See **[Capability evolution pipeline](./capability-evolution)** for a full step-by-step (states, contract diff, CLI vs browser, troubleshooting). Example packages: `app-live-review`, `preview-review`.

## Configure — agent grants

**Configure → [space] → Agent grants**

| Action | Navigation |
|--------|------------|
| List / revoke | **`/configure/spaces/:spaceId/grants`** |
| Mint grant | **Mint grant** → **`…/grants/new`** |

Mint wizard:

- **Label** — e.g. `Orchestrator Cursor`
- **Harness** — `cursor-local`, `ci`, etc.
- **Template** — **Worker** (agent) or **Admin** (setup)

Copy the **one-time token** immediately — it is not shown again. Paste into your agent MCP config as `STUDIO_HUB_TOKEN`.

After installing capabilities in a space, mint grants so agents can use those packages' MCP tools (review sessions, feature specs, etc.).

## Configure — members & triggers

- **Members** — **`/configure/spaces/:spaceId/members`** — invite by email + role
- **Triggers** — **`/configure/spaces/:spaceId/triggers`** — list rules, **Delivery log**, **Register trigger**
- **Hub settings** — **`/configure/hub`** — health, federation status, grant export

### Triggers (Configure)

**Configure → [space] → Triggers**

| Action | Navigation |
|--------|------------|
| List triggers | **`/configure/spaces/:spaceId/triggers`** |
| Register from template | **Register trigger** → **`…/triggers/new`** |
| Delivery log | **Delivery log** button on triggers page |

The register form shows an **event catalog** (from live capabilities) and bundled **templates**:

| Template | When | Action |
|----------|------|--------|
| **Spec published → wake dev agent** | `spec.published` in source space | `mcp_wake` on target space with summary fields (no `body_ref`) |
| **Backend work.ready → wake frontend** | `work.ready` with `type: api_change` | `mcp_wake` on target space |

Pick template, set **source space id** (where events originate), register on the **target** space (where the agent should wake). View outcomes in **Delivery log** (`success`, dedup skips, failures).

## Runtime — instances

**`/spaces/:spaceId`**

Lists instances in the space. Each row shows id and state. Links:

- **Review loop** → **`/spaces/:spaceId/sessions/:sessionKey`**
- **Feature spec** → **`/spaces/:spaceId/specs/:specKey`**

Agents create instances via MCP (`create_review_session`, `open_spec`, …). The browser lists and opens them — you do not create instances manually in the UI.

## Review canvas

**`/spaces/:spaceId/sessions/:sessionKey`**

- **Preview** — iframe to the URL the agent set
- **Comments** — threaded feedback
- **Finish review** — ends the round; agent receives structured results via MCP

Share the URL from the address bar with reviewers.

## Spec canvas

**`/spaces/:spaceId/specs/:specKey`**

Requires **Feature spec** capability live in the space.

- **Sections** — read structured content the agent drafted
- **Context refs** — URLs and blob refs attached via MCP (`add_context_ref`)
- **Submit for review** / **Publish** — human actions when state is `draft`
- **Revise (admin)** — when `published`; increments version back to `draft`

Agents draft with MCP (`open_spec`, `patch_spec_section`, `add_context_ref`, `transition_spec`). Humans publish here when install config allows direct publish, or approve via gates when review is required. After publish, **`spec.published`** fires on the space journal (and may wake agents via triggers).

## Gates

**`/spaces/:spaceId/gates`**

When a workflow needs human approval:

1. Open **Gates** from the runtime sidebar
2. Find the pending gate (instance id shown)
3. **Approve**

Used for production capability promotes, review-loop production gates, and spec review paths.

## Audit export

**`/spaces/:spaceId/audit`**

**Download JSONL** — full event journal for the space (compliance, debugging).

## Cloud vs self-hosted routes

| | Cloud (typical) | Self-hosted shell |
|--|-----------------|-------------------|
| Sign-in | SSO / email | **`/connect`** + token |
| Workspace prefix | `/w/<workspace>/…` | Direct `/spaces/…`, `/configure/…` |
| API tokens | Dashboard mint | **Configure → Agent grants** |

Session and spec links follow the same pattern within your hostname — copy from the browser address bar.

## Mobile

Responsive layout. Gate approval and review Finish work on tablet; full configuration is easier on desktop.

## Next

- [Configuration](./configuration) — admin checklist
- [Connect your agent](./agents-mcp) — MCP paste flow
- [Review workflow](./review-workflow)
- [Multi-agent feature spec](./multi-agent-feature-spec)
