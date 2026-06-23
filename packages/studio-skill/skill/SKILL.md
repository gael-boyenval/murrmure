---
name: studio-capability
description: >-
  Author, evolve, and operate Agent Studio capabilities (CDK packages). Use when
  scaffolding, editing, pushing, or promoting a capability; wiring MCP tools; minting
  grants; or debugging why agents/humans cannot see review canvas or MCP tools.
  Covers version bumps, validate/build/push, and the full evolution pipeline.
---

# Agent Studio — capability development

Teach agents the **Studio platform model** and the **mandatory CDK workflow**. Humans use the browser shell; coding agents use **CLI + MCP**.

## Platform model (30 seconds)

| Layer | Role |
|-------|------|
| **Hub daemon** | HTTP API, worker pool, MCP catalog, journal |
| **Capability (CDK)** | Your package: contract, server worker, UI iframe, MCP tools |
| **Shell** | Configure + Runtime chrome; loads capability UI in sandboxed iframe |
| **MCP bridge** | `studio-hub-mcp` proxies grant-filtered tools from `/v1/mcp/catalog` |

Instances are hub rows (`ins_…`). `session_key` === `instance_id`. Canvas opens at Runtime → Instances or `/spaces/{spaceId}/sessions/{instanceId}`.

## Before you change a capability

Copy this checklist and complete every step:

```
Capability change checklist:
- [ ] Bump semver in capability.manifest.json AND contract/contract.json (same version)
- [ ] Edit server / UI / mcp-tools.json as needed
- [ ] studio capability validate . --json
- [ ] studio capability build . --json
- [ ] studio capability push --space <space> --json
- [ ] studio capability validate --space <space> --install <install> --json
- [ ] studio capability test --space <space> --install <install> --json
- [ ] studio capability promote --space <space> --install <install> --json
- [ ] studio capability apply --space <space> --install <install> --json
- [ ] Mint grant includes package id in capability_acl; reload MCP
```

**Never push code changes without bumping version** — the hub keys installs by `(package_id, semver)`. Skipping validate/test/promote/apply leaves the old worker live.

## Quick commands

```bash
# Local package
studio capability validate .
studio capability build .
studio capability push --space spc_ui_sandbox --json

# Hub evolution (use install_id from push)
studio capability validate --space spc_ui_sandbox --install ins_… --json
studio capability test --space spc_ui_sandbox --install ins_… --json
studio capability promote --space spc_ui_sandbox --install ins_… --json
studio capability apply --space spc_ui_sandbox --install ins_… --json

# Agent skill (this file) in the repo
studio skill install
studio skill update
```

Env: `STUDIO_HUB_URL`, `STUDIO_TOKEN` (or `STUDIO_HUB_TOKEN`), `STUDIO_SPACE_ID`.

## Reference docs (read when needed)

| Topic | File |
|-------|------|
| Evolution pipeline, version rules, common agent mistakes | [reference/evolution-pipeline.md](reference/evolution-pipeline.md) |
| CDK layout, contract, server, UI, MCP tool map | [reference/capability-authoring.md](reference/capability-authoring.md) |
| `studio capability` / `studio skill` CLI | [reference/cli.md](reference/cli.md) |
| MCP config, grants, tool catalog | [reference/mcp.md](reference/mcp.md) |

## Agent rules

1. **Instance create** — use `ctx.contractRefId` from the worker context, not a hardcoded `cref_*` string.
2. **Review sessions** — return `studio_url` / `canvas_path` to the human before blocking on wait tools.
3. **Grants** — `capability_acl` must list your `package_id`; platform scopes alone do not expose domain tools.
4. **Promote ≠ live** — always **apply** after promote for CDK bundles.
5. **Do not edit hub or shell** for domain behavior — change the capability package and re-run the pipeline.
