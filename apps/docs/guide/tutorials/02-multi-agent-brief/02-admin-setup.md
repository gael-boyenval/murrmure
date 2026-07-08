# Part 2 — Admin setup

Create three hub spaces, link each folder, apply the orchestrator index, and mint cross-space grants.

## 1) Create spaces in Desktop

In **Murrmure Desktop**, create three spaces (or use `mrmr space link --create` three times):

| Space id (example) | Folder |
|--------------------|--------|
| `spc_orchestrator` | `~/work/orchestrator/` |
| `spc_knowledge` | `~/work/knowledge-base/` |
| `spc_dev` | `~/work/dev-project/` |

Knowledge and dev folders only need `mrmr space init` + link — no custom flow required for this tutorial. Init them the same way as Part 1:

```bash
mkdir -p ~/work/knowledge-base && cd ~/work/knowledge-base && mrmr space init
mkdir -p ~/work/dev-project && cd ~/work/dev-project && mrmr space init
```

## 2) Link and apply orchestrator

```bash
cd ~/work/orchestrator
mrmr space link --path . --space spc_orchestrator
mrmr space apply --strict
mrmr space status --space spc_orchestrator
```

Confirm indexed flow **`team-brief`** and hooks appear in status output.

Link the other folders:

```bash
cd ~/work/knowledge-base && mrmr space link --path . --space spc_knowledge && mrmr space apply
cd ~/work/dev-project && mrmr space link --path . --space spc_dev && mrmr space apply
```

## 3) Cross-space grants

Each agent needs a token scoped to its space **and** the capabilities to participate in federation.

```bash
# Orchestrator — runs flow, queries knowledge
mrmr grant mint --space spc_orchestrator \
  --capabilities flow:run,flow:read,query:ask \
  --label orchestrator-agent

# Knowledge — answers queries (no flow:run required for passive Q&A)
mrmr grant mint --space spc_knowledge \
  --capabilities space:read,query:respond \
  --label knowledge-agent

# Dev — receives wakes, runs actions, queries orchestrator
mrmr grant mint --space spc_dev \
  --capabilities flow:run,flow:read,action:invoke,query:ask \
  --label dev-agent
```

Configure federation / inbound allowlists so dev can receive wakes from orchestrator events — see [Multi-agent feature spec](../../multi-agent-feature-spec).

## 4) Verify index before agents

```bash
mrmr space status --space spc_orchestrator
```

You should see:

- Flow `team-brief`
- Hook `brief_published_wake`
- Actions `team_brief_open`, `mcp_wake`

## Next

[Part 3 — Connect agents →](./03-connect-agents)
