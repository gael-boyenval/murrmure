# Evolution pipeline

Normative workflow for getting capability changes into a space. **Editing files alone does nothing at runtime** until push + evolution + apply complete.

## State machine

```
draft → validated → tested → live (or promoted_pending → live after gate)
```

| State | Runtime MCP + routes? |
|-------|-------------------------|
| `draft` | No |
| `validated` | No |
| `tested` | No |
| `promoted_pending` | No (approve gate first) |
| `live` | **Yes** (after apply) |

## Version bumps (required on every change)

Bump **both** files to the **same** semver:

- `capability.manifest.json` → `"version"`
- `contract/contract.json` → `"version"`

Also update `mcp_tools_by_version` keys when tool sets change.

| Change type | Semver | Example |
|-------------|--------|---------|
| Bug fix, same contract | PATCH | `0.1.0` → `0.1.1` |
| New tool, backward compatible | MINOR | `0.1.1` → `0.2.0` |
| Breaking contract / states | MAJOR | `0.2.0` → `1.0.0` |

Push without a version bump updates the wrong install row or fails digest checks. **This is the most common agent mistake.**

## Full pipeline (CLI)

```bash
export STUDIO_HUB_URL=http://127.0.0.1:8787
export STUDIO_TOKEN=tok_…
SPACE=spc_ui_sandbox

# 1 — local
studio capability validate . --json
studio capability build . --json

# 2 — register bundle (creates/updates draft install)
studio capability push --space $SPACE --json
# → save install_id

INSTALL=ins_…

# 3 — hub evolution
studio capability validate --space $SPACE --install $INSTALL --json
studio capability test --space $SPACE --install $INSTALL --json
studio capability promote --space $SPACE --install $INSTALL --json
studio capability apply --space $SPACE --install $INSTALL --json
```

`push` output includes `next_steps: ["validate", "test", "promote", "apply"]` — run all of them.

## Verify live

```bash
curl -s -H "Authorization: Bearer $STUDIO_TOKEN" \
  "$STUDIO_HUB_URL/v1/spaces/$SPACE/capabilities/live" | jq .

curl -s -H "Authorization: Bearer $STUDIO_TOKEN" \
  "$STUDIO_HUB_URL/v1/mcp/catalog?space_id=$SPACE" | jq '.tools[].name'
```

Reload MCP in the agent client after apply.

## Browser equivalent

**Configure → [space] → Capabilities → [install]** — Validate, Test, Promote. **Apply** is CLI-only today.

## Breaking promotes

Major semver → `promoted_pending` + gate. Approve under **Runtime → Gates**, then `studio capability apply`.

## After code-only edits (agent recovery)

If an agent changed server/UI but skipped version + pipeline:

1. Bump semver in manifest + contract.
2. Re-run the full checklist from SKILL.md.
3. Rotate or mint a new grant if `capability_acl` was wrong.
4. Reload MCP.

## contract_ref_id

Hub assigns `cref_{package_id}_{contract_major}` at ingest. Worker must create instances with:

```typescript
contract_ref_id: ctx.contractRefId
```

Mismatch → instance appears in Runtime without an **Open canvas** link.
