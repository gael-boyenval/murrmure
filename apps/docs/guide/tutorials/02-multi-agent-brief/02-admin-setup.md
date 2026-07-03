# Part 2 — Admin setup

Link three spaces and apply indexed flows.

## 1) Create spaces in Desktop

Create (or use setup wizard):

- `spc_orchestrator`
- `spc_knowledge`
- `spc_dev`

## 2) Link and apply orchestrator

```bash
cd ~/work/orchestrator
mrmr space link --path . --space spc_orchestrator
mrmr space apply --strict
mrmr space status --space spc_orchestrator
```

Knowledge and dev folders need grants and cross-space ACL — not separate custom flows for this tutorial.

## 3) Cross-space grants

Mint grants so orchestrator can query knowledge and dev agents can receive wakes:

```bash
mrmr grant mint --space spc_orchestrator --capabilities flow:run,flow:read,query:ask
mrmr grant mint --space spc_dev --capabilities flow:run,flow:read
```

Configure federation / inbound allowlists per [Multi-agent feature spec](../../multi-agent-feature-spec).

## Next

[Part 3 — Connect agents →](./03-connect-agents)
