# Part 2 — Admin setup (all Configure clicks)

Complete this once as workspace admin before running agents.

## 1. Create three spaces

Repeat this flow three times:

1. Open `Configure`.
2. Click `Create space`.
3. Enter display name + slug.
4. Set install policy to `authorized_agents`.
5. Click `Create`.

Use:

| Display name | Slug |
|--------------|------|
| Orchestrator | `orchestrator` |
| Knowledge | `knowledge` |
| Dev | `dev` |

Then, for each space:

1. Open space settings.
2. Copy the space id (`spc_...`).
3. Save ids in your notes:
   - `spc_orchestrator`
   - `spc_knowledge`
   - `spc_dev`

## 2. Install only `team-brief` in orchestrator space

From Part 1 you already pushed the capability bundle to `spc_orchestrator`.

Now click through:

1. `Configure -> Orchestrator -> Capabilities`
2. Open `team-brief` install row
3. Click `Validate`
4. Click `Test`
5. Click `Promote`
6. Click `Apply live`
7. Confirm state chip is `live`

Do not install bundled `feature-spec` for this tutorial.
Do not install anything in Knowledge or Dev spaces.

## 3. Mint three grants (one per agent)

For each space:

1. `Configure -> [Space] -> Agent grants`
2. Click `Mint grant`
3. Select template `Worker`
4. Enter label
5. Save and copy one-time token

Recommended labels:

| Space | Label |
|------|-------|
| Orchestrator | `Orchestrator Cursor` |
| Knowledge | `Knowledge Cursor` |
| Dev | `Dev Cursor` |

Grant guidance:

- Orchestrator grant: capability ACL includes `team-brief`.
- Knowledge + Dev grants: no capability ACL required for this tutorial.
- Keep tokens separate (never reuse one token in all windows).

## 4. Allow `query_ask` from dev to orchestrator

Dev reads published summary with `query_ask` (`brief_summary@1`).

Set orchestrator inbound query policy to allow dev:

```http
PATCH /v1/spaces/{spc_orchestrator}
```

Body:

```json
{
  "query_policy": {
    "inbound_allowlist": [
      {
        "source_space_id": "spc_dev",
        "allowed_query_types": ["brief_summary@1"]
      }
    ]
  }
}
```

If your Configure build already exposes query policy UI, use that UI instead of HTTP patch.

## 5. Register trigger in dev space (`spec-published-wake-dev` style)

Click path:

1. `Configure -> Dev -> Triggers`
2. Click `Register trigger`
3. Pick `Custom` (or start from spec-published template and edit fields)
4. Fill fields:

| Field | Value |
|------|-------|
| Source space id | `spc_orchestrator` |
| Event type | `brief.published` |
| Action type | `mcp_wake` |
| Target space id | `spc_dev` |
| Wake label | `handle_brief_published` |
| Payload map | `brief_key -> $.payload.brief_key`, `title -> $.payload.title`, `version -> $.payload.version`, `summary -> $.payload.summary`, `source_space_id -> $.space_id` |
| Dedup keys | `$.payload.brief_key`, `$.payload.version` |
| Dedup window | `86400` seconds |

5. Click `Save trigger`.

## 6. Read trigger delivery states

Open `Configure -> Dev -> Triggers -> Delivery log` after each publish.

| Delivery state | Meaning |
|---------------|---------|
| `pending` | Trigger accepted; wake dispatch still in progress |
| `failed` | Wake could not reach target agent/harness/policy |
| `resolved` (or `delivered`) | `mcp_wake` reached target session successfully |

## Next

[Part 3 — Connect agents →](./03-connect-agents)
