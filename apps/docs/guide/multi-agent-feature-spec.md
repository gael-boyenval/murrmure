# Multi-agent feature spec

Three folders on your machine. Three agents in three IDEs. One feature spec that crosses all of them — with **your approval** before dev writes anything.

**Browser for humans. MCP for agents. No curl.**

---

## What you are building

| Folder | Space | Agent | Role |
|--------|-------|-------|------|
| `~/work/orchestrator/` | `spc_orchestrator` | Orchestrator | Owns the spec; drafts and assembles |
| `~/work/knowledge-base/` | `spc_knowledge` | Knowledge | Answers from docs and ADRs |
| `~/work/dev-project/` | `spc_dev` | Dev | Answers from code; writes `specs/…` locally |

Flow:

1. You describe a feature to the **orchestrator** agent.
2. Orchestrator drafts a spec (`open_spec`, sections via MCP).
3. Orchestrator asks **Knowledge** and **Dev** (in parallel, via prompts + events).
4. Orchestrator assembles the spec and pauses for **your approval**.
5. You **Publish** in the spec canvas (or approve a gate).
6. **`spec.published`** wakes the **Dev** agent (when a trigger is registered).
7. **Dev** uses **`query_ask`** / **`get_spec`**, then writes `~/work/dev-project/specs/guest-checkout-v1.md`.

---

## Prerequisites

1. [Murrmure account](./account) or [self-hosted](./self-hosted) hub + shell
2. **Workspace admin** — you run Configure, not curl
3. On each agent machine: `npm install -g @murrmure/cli`
4. Three directories:

   ```
   ~/work/orchestrator/
   ~/work/knowledge-base/
   ~/work/dev-project/
   ```

---

## Part 1 — Admin setup (browser)

Do this **once** as admin in **Configure**.

### 1.1 Create three spaces

**Configure → Create space** (repeat three times):

| Display name | Slug | Install policy |
|--------------|------|----------------|
| Orchestrator | `orchestrator` | `authorized_agents` |
| Knowledge | `knowledge` | `authorized_agents` |
| Dev | `dev` | `authorized_agents` |

Open each space settings page and copy **`spc_…`** ids.

Self-hosted: complete **`/connect`** + **`/setup`** first if you have not already.

### 1.2 Install Feature spec (orchestrator space)

**Configure → Orchestrator → Flows → Install flow**

1. Choose **Feature spec documents**
2. Open the install → **Validate** → **Test** → **Promote** → **`live`**

For direct publish without a review gate, install config should allow **`skip_review`** (default in catalog may require review — use flow config when the configure UI exposes it; until then promote with wizard defaults and use **Publish** on the spec canvas after agent reaches `draft`).

### 1.3 Mint agent grants

**Configure → [space] → Agent grants → Mint grant** for each agent:

| Agent | Space | Template | Label example |
|-------|-------|----------|---------------|
| Orchestrator | Orchestrator | Worker | `Orchestrator Cursor` |
| Knowledge | Knowledge | Worker | `Knowledge Cursor` |
| Dev | Dev | Worker | `Dev Cursor` |

Copy each **one-time token** immediately.

**Cross-space reads (recommended):** allow the Dev space to query the Orchestrator space:

1. On the **Orchestrator** space, set `query_policy.inbound_allowlist` to include the Dev space id (`PATCH /v1/spaces/{orchestrator_id}` — Configure UI for query policy is not shipped yet).
2. Dev agent uses MCP **`query_ask`** with `query_type: "spec_summary@1"` after publish (summary only — no `body_ref`).

Optional: mint read grants on Knowledge/Dev spaces for the orchestrator machine if it needs full section bodies via **`get_spec`**.

::: warning
Do **not** give the orchestrator write access to foreign spaces. Cross-space coordination uses **events**, **`query_ask`**, and optional read grants — not shared write tokens.
:::

### 1.4 Register trigger (Dev space)

**Configure → Dev → Triggers → Register trigger**

1. Template: **Spec published → wake dev agent**
2. **Source space id** — Orchestrator (`spc_orchestrator`)
3. Register on the **Dev** space (target where the dev agent listens)

After you **Publish**, the hub delivers an **`mcp_wake`** with `handle_spec_published` and summary fields. Check **Delivery log** if the dev agent does not wake.

---

## Part 2 — Connect each directory (MCP)

Open each folder in **its own Cursor window**. Create `.cursor/mcp.json`:

### `~/work/orchestrator/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "https://api.murrmure.dev",
        "MURRMURE_HUB_TOKEN": "tok_ORCHESTRATOR_GRANT",
        "MURRMURE_SPACE_ID": "spc_orchestrator"
      }
    }
  }
}
```

Use your hub URL on self-hosted. Add optional second MCP servers with read grants on Knowledge/Dev spaces if the orchestrator needs **`get_spec`** on those spaces.

Dev agent only needs its own `mrmr` server on the Dev space — wakes and cross-space reads use **`query_ask`** when query policy allows.

### `~/work/knowledge-base/` and `~/work/dev-project/`

Same shape — one `mrmr` server each, with that folder's token and `MURRMURE_SPACE_ID`.

Reload MCP in every window.

---

## Part 3 — Connect the browser (human)

1. Sign in (cloud) or **`/connect`** (self-hosted)
2. **Runtime → Orchestrator → Gates** — bookmark for later approvals
3. **Runtime → Orchestrator → Instances** — spec rows link to the spec canvas

Keep a browser tab open during the run.

---

## Part 4 — Run the workflow

### 4.1 You → Orchestrator: describe the feature

In `~/work/orchestrator/`, prompt:

> We need guest checkout — users buy without an account. Open a feature spec titled "Guest checkout v1", draft goals and API sections, and list open questions for knowledge and dev.

The orchestrator agent should:

1. **`open_spec`** — returns `spec_key` (`ins_…`), state `gathering_context`
2. **`patch_spec_section`** — goals, API, open questions as sections
3. **`transition_spec`** with `context_ready` → state **`draft`**

You can verify: **Runtime → Orchestrator → Instances → Open spec**.

### 4.2 Orchestrator → Knowledge

In `~/work/knowledge-base/`, prompt:

> The orchestrator is gathering context for guest checkout. Search `docs/` and ADRs for policy and payment constraints. Summarize answers the orchestrator can merge into the spec.

Knowledge agent uses local codebase tools, then reports back (orchestrator merges via further **`patch_spec_section`** calls in the orchestrator window).

### 4.3 Orchestrator → Dev

In `~/work/dev-project/`, prompt:

> Answer dev questions for guest checkout: where is CartService, does checkout require auth? Report paths and facts for the orchestrator to merge.

Same pattern — orchestrator merges into the spec via MCP.

### 4.4 You: publish in the browser

1. **Runtime → Orchestrator → Instances → Open spec**
2. Read sections
3. Click **Publish** (when state is `draft` and config allows)

Or, if review is required: **Submit for review** → **Runtime → Gates → Approve** → publish path per install config.

Journal emits **`spec.published`** with `body_ref` and `published_by`.

### 4.5 Dev: wake, fetch, write the file

When the trigger is registered, the dev Cursor window receives a **`control.wake_pending`** MCP message with `wake_label: handle_spec_published` after you publish. Prompt:

> You were woken for a published spec. Use **`query_ask`** with `target_space_id` set to the orchestrator space and `query_type: "spec_summary@1"`. If you need the full body, use **`get_spec`** with the `spec_key` from the wake payload. Write `specs/guest-checkout-v1.md` locally and commit.

Without a trigger, prompt manually when you see **`spec.published`** in **Runtime → Audit**, or after the orchestrator notifies you.

Dev agent flow:

1. **`query_ask`** — cross-space summary (no `body_ref`)
2. **`get_spec`** — optional full spec when a read grant on the orchestrator space exists
3. Write the file locally, commit in git

---

## Sequence diagram

```mermaid
sequenceDiagram
  actor User
  participant Orch as Orchestrator agent
  participant Shell as Browser shell
  participant KB as Knowledge agent
  participant Dev as Dev agent

  User->>Orch: Describe feature (prompt)
  Orch->>Orch: open_spec, patch_spec_section, context_ready
  User->>Shell: Open spec canvas, review
  par Answers
    Orch-->>KB: Prompt with questions
    KB->>KB: Search docs locally
    Orch-->>Dev: Prompt with questions
    Dev->>Dev: Search code locally
  end
  Orch->>Orch: patch_spec_section merge
  User->>Shell: Publish
  Shell->>Shell: spec.published event
  Shell->>Dev: mcp_wake (trigger)
  Dev->>Dev: query_ask spec_summary@1
  Dev->>Dev: get_spec, write specs/*.md
```

---

## Observability

| What | Where |
|------|--------|
| Spec draft / publish | **Runtime → Instances → Open spec** |
| Pending gate | **Runtime → Gates** |
| Trigger deliveries | **Configure → Dev → Triggers → Delivery log** |
| Event journal | **Runtime → Audit** (download JSONL) |
| Agent-side tail | MCP handshake wake messages — optional CLI |

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| One token in all three IDEs | Three grants, three `MURRMURE_SPACE_ID` values |
| MCP tools missing | Flow **Promote** to **`live`**; reload MCP |
| Orchestrator writes into dev repo | Dev agent writes locally after publish |
| Skipping human publish | Agent reaches `draft`; you **Publish** in spec canvas |
| Wrong space in MCP config | Match `MURRMURE_SPACE_ID` to grant's space |
| Dev not woken after publish | Register **Spec published → wake dev** trigger; check **Delivery log** |
| `query_ask` returns `QUERY_POLICY_DENIED` | Add dev space id to orchestrator `query_policy.inbound_allowlist` |
| Need full spec cross-space | Mint read grant on orchestrator space for dev agent, then **`get_spec`** |

---

## What is not in the shell yet

- **`query_policy` editor** — set `inbound_allowlist` via `PATCH /v1/spaces/{id}` until Configure exposes it
- **Section editing in spec canvas** — agents edit via MCP; humans publish, approve, and revise
- **Custom trigger builder** — use templates or raw API; no visual filter editor yet

These do not require curl for normal agent work — MCP and Configure templates cover the multi-agent spec path.

---

## Related

- [Browser app](./browser)
- [Connect your agent](./agents-mcp)
- [MCP tools reference](../reference/mcp-tools)
- [Review workflow](./review-workflow)
