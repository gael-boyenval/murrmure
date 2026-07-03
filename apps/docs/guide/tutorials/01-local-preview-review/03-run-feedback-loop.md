# Part 3 — Run the feedback loop

Run the indexed flow in Desktop and complete the human/agent loop until validated.

## Pattern A — Flow-owned loop (default)

The engine advances via `checkpoint.on_resolve` — no agent wait loop required for the happy path.

1. Desktop → space home → **Run** on **preview-review**
2. **Intake** opens in **ViewCanvasHost** — enter reviewer email + localhost preview URL → submit
3. **Build** step runs `run_preview_agent` (agent may also invoke this between rounds)
4. **Review** opens in **ViewCanvasHost** — preview iframe + comments
5. Human chooses **Validated** or **Request changes**
   - **Request changes** → engine jumps to **build** → back to review
   - **Validated** → **done** → run completes

Resolve wire (view submit → hub):

```json
{ "disposition": "continue", "output": { "outcome": "validated", "comments": [] } }
```

Request changes:

```json
{ "disposition": "continue", "output": { "outcome": "changes_required", "comments": ["Fix header"] } }
```

## Pattern B — Agent-owned loop (§B)

Same views and manifest; the agent drives round-trips with MCP waits:

1. Human completes intake (checkpoint resolves → build runs)
2. Agent invokes build action with feedback from prior round
3. Agent calls **`murrmure_wait_for_gate`** (or `murrmure_wait_for_run`) while human reviews in **ViewCanvasHost**
4. On `changes_required`, agent reads `output.comments` from resolve payload and repeats from step 2
5. On `validated`, run reaches terminal **done**

Use Pattern B when the agent owns iteration timing; Pattern A when the flow graph alone coordinates rounds.

## Verify completion

- Run status: **completed**
- Session journal shows checkpoint resolves and invoke steps
- No contributor-only commands required — only `mrmr space apply` indexed the flow

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Checkpoint shows shell form instead of view | Rebuild view `dist/`; re-run `mrmr space apply --strict` |
| Build step missing feedback | Confirm review-step comment output is wired in manifest invoke params |
| Agent cannot invoke build | Grant missing `flow:run`; run `mrmr grant mint` again |

See [Troubleshooting](../../troubleshooting) and [Review workflow](../../review-workflow).

## Done

You completed Tutorial 1 — localhost preview review on v2 indexed flows with **ViewCanvasHost** checkpoints.

## Next tutorials

- [Tutorial 2 — Multi-agent brief](../02-multi-agent-brief/)
- [Flows tutorial (full authoring reference)](../../flows-tutorial)
