---
name: murrmure-flow
description: >-
  Author, evolve, and operate Murrmure flows (FDK packages). Use when
  scaffolding, editing, pushing, or promoting a flow; wiring MCP tools; minting
  grants; or debugging why agents/humans cannot see review canvas or MCP tools.
  Covers version bumps, validate/build/push, and the full evolution pipeline.
---

# Murrmure — flow development

Teach agents the **Murrmure platform model** and the **mandatory FDK workflow**. Humans use the browser shell; coding agents use **CLI + MCP**.

## Platform model (30 seconds)

| Layer | Role |
|-------|------|
| **Hub daemon** | HTTP API, worker pool, MCP catalog, journal |
| **Flow (FDK)** | Your workflow: contract, server worker, UI iframe, MCP tools |
| **Shell** | Configure + Runtime chrome; loads flow UI in sandboxed iframe |
| **MCP bridge** | `murrmure` with `args: ["mcp"]` proxies grant-filtered tools from `/v1/mcp/catalog` |

Instances are hub rows (`ins_…`). `session_key` === `instance_id`. Canvas opens at Runtime → Instances or `/spaces/{spaceId}/sessions/{instanceId}`.

## Before you change a flow

Copy this checklist and complete every step:

```
Flow change checklist:
- [ ] Bump semver in flow.manifest.json AND contract/contract.json (same version)
- [ ] Edit server / UI / mcp-tools.json as needed
- [ ] mrmr flow validate . --json
- [ ] mrmr flow build . --json
- [ ] mrmr flow push --space <space> --json
- [ ] mrmr flow validate --space <space> --install <install> --json
- [ ] mrmr flow test --space <space> --install <install> --json
- [ ] mrmr flow promote --space <space> --install <install> --json
- [ ] mrmr flow apply --space <space> --install <install> --json
- [ ] Mint grant includes flow id in capability_acl; reload MCP
```

**Never push code changes without bumping version** — the hub keys installs by `(flow_id, semver)`. Skipping validate/test/promote/apply leaves the old worker live.

## Quick commands

```bash
# Local package
mrmr flow validate .
mrmr flow build .
mrmr flow push --space spc_ui_sandbox --json

# Hub evolution (use install_id from push)
mrmr flow validate --space spc_ui_sandbox --install ins_… --json
mrmr flow test --space spc_ui_sandbox --install ins_… --json
mrmr flow promote --space spc_ui_sandbox --install ins_… --json
mrmr flow apply --space spc_ui_sandbox --install ins_… --json

# Agent skill (this file) in the repo
mrmr skill install
mrmr skill update
```

Env: `MURRMURE_HUB_URL`, `MURRMURE_TOKEN` (or `MURRMURE_HUB_TOKEN`), `MURRMURE_SPACE_ID`.

## Reference docs (read when needed)

| Topic | File |
|-------|------|
| Evolution pipeline, version rules, common agent mistakes | [reference/evolution-pipeline.md](reference/evolution-pipeline.md) |
| FDK layout, contract, server, UI, MCP tool map | [reference/capability-authoring.md](reference/capability-authoring.md) |
| `mrmr flow` / `mrmr skill` CLI | [reference/cli.md](reference/cli.md) |
| MCP config, grants, tool catalog | [reference/mcp.md](reference/mcp.md) |

## Agent rules

1. **Instance create** — use `ctx.contractRefId` from the worker context, not a hardcoded `cref_*` string.
2. **Review sessions** — return `murrmure_url` / `canvas_path` to the human before blocking on wait tools.
3. **Grants** — `capability_acl` must list your `flow_id`; platform scopes alone do not expose domain tools.
4. **Promote ≠ live** — always **apply** after promote for FDK bundles.
5. **Do not edit hub or shell** for domain behavior — change the flow package and re-run the pipeline.
