---
name: murrmure
description: >-
  Operate and author Murrmure v2 — space directory, flows, views, hooks, grants,
  MCP, and checkpoints. Use when editing murrmure/, running space apply, minting
  grants, connecting agents, or debugging runs, gates, and custom views.
---

# Murrmure — agent operating system (v2)

**Normative agent source.** Human docs cover install and philosophy only — follow this skill for commands, manifests, and protocol behavior.

## Platform model (30 seconds)

| Layer | Role |
|-------|------|
| **Space directory** | `murrmure/actions.yaml`, `executors.yaml`, `hooks.yaml`, `flows/*/flow.manifest.yaml`, `views/*` |
| **Hub index** | Compiled flow IR + digests after `mrmr space apply` |
| **Session / Run** | Correlation + immutable execution; runs pin `flow_digest` |
| **Checkpoint** | Human step — pending gate, resolve via `{ disposition, output }` |
| **ViewCanvasHost** | Full primary canvas for custom views at checkpoints |
| **MCP** | Grant-filtered tools for agents |

Deep dive: [reference/platform-model.md](reference/platform-model.md).

## Task router

| You need to… | Read |
|--------------|------|
| Scaffold or index a space | [reference/space-directory.md](reference/space-directory.md) |
| Author flows, triggers, steps | [reference/flow-authoring.md](reference/flow-authoring.md) |
| Actions + executors | [reference/actions-executors.md](reference/actions-executors.md) |
| Hooks / scheduled / event triggers | [reference/hooks-triggers.md](reference/hooks-triggers.md) |
| Custom views at checkpoints | [reference/views.md](reference/views.md) |
| Resolve wire + `on_resolve` routing | [reference/gates.md](reference/gates.md) |
| Mint grants / capabilities | [reference/grants.md](reference/grants.md) |
| MCP tools + wait/resolve | [reference/mcp.md](reference/mcp.md) |
| Ephemeral vs durable orchestration | [reference/orchestration-attach.md](reference/orchestration-attach.md) |
| Cross-hub spaces | [reference/federation.md](reference/federation.md) |
| CLI commands | [reference/cli.md](reference/cli.md) |
| Human wizard equivalents | [reference/wizards.md](reference/wizards.md) |
| What's not shipped yet | [reference/known-gaps.md](reference/known-gaps.md) |
| Debug failures | [reference/troubleshooting.md](reference/troubleshooting.md) |

## Non-negotiable rules

1. **Index via apply** — flows in `murrmure/flows/` are not live until `mrmr space apply`.
2. **`triggers:` only at top of manifest** — when a run may start; **no human UI on triggers**. Human UX lives on **checkpoint steps** only.
3. **Checkpoint resolve wire** — `{ disposition: "continue" \| "cancel", output?: {...} }`. Request changes = `continue` + `output.outcome: changes_required`.
4. **Custom views are primary** — ViewCanvasHost fills the main canvas; shell gate forms are admin/fallback only.
5. **Grants** — `flow:run` to execute; `flow:read` for preview; reload MCP after mint or apply.
6. **Orchestration A/B** — durable repo flows → `mrmr space apply`; ephemeral session graph → `murrmure_attach_orchestration`.
7. **Known gaps** — read [reference/known-gaps.md](reference/known-gaps.md) before promising behavior.

## Flow change checklist

```
- [ ] Edit murrmure/flows/{name}/flow.manifest.yaml (triggers + steps)
- [ ] Build view dist/ if checkpoint views changed
- [ ] mrmr space apply --path . --space <space> --json
- [ ] mrmr space status --space <space> --json
- [ ] mrmr flow run flw_<name> --input '{}' --space <space> --json
- [ ] Mint grant with flow:run (+ flow:read for preview-only actors)
- [ ] Reload MCP session if agent needs new tools
```

## Quick commands

```bash
mrmr space init
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply
mrmr space status
mrmr flow run flw_morning_brief --input '{"topic":"news"}' --space spc_ui_sandbox --json
mrmr grant mint --space spc_ui_sandbox --capabilities space:read,flow:run,action:invoke
mrmr skill install
```

MCP env: `MURRMURE_HUB_TOKEN` only (thin `murrmure-mcp` config).  
CLI/env defaults: `MURRMURE_HUB_URL`, `MURRMURE_HUB_TOKEN`, optional `MURRMURE_SPACE_ID`.
