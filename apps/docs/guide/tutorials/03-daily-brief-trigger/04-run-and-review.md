# Part 4 — Run and review

Run one full request from button click to resolution.

## 1. Start from the canvas

Open **Runtime → [daily brief space]** and load the `daily-brief` flow run.

Click **Run daily brief** in the trigger view.

## 2. Observe the sequence

After click, confirm this order:

1. **trigger** step resolves via view submit (`continue` branch).
2. Hub appends journal event `brief.requested`.
3. Handler `brief-requested-wake` dispatches `shell_spawn`.
4. Journal shows handler terminal state (`handler:brief-requested-wake`).
5. Agent handles `handle_brief_requested`.
6. Agent resolves **agent** step with gathered output.
7. **review** presentation opens the same view.
8. Human clicks **Mark done** → **done** handler runs → run completes.

If step 4 fails, fix handler config and MCP connectivity before retrying.

## 3. Human review path

When **review** is active:

- Canvas shows submitted markdown/json from agent step output.
- Human clicks **Mark done** (`approved` branch).
- Flow advances to **done**; handler records final artifact.

## 4. Pending vs resolved checks

| Layer | Pending signal | Resolved signal |
|-------|----------------|-----------------|
| Handler delivery | Journal shows handler in flight | Terminal handler journal entry |
| Agent wait/wake | Wake not processed or wait blocking | Agent resolved **agent** step |
| Human review | **review** step active, Mark done enabled | **review** resolved → **done** opens |

## 5. Verify final state

| Where | Expected |
|-------|----------|
| Run status | `completed` |
| Journal | `brief.requested` → agent resolve → review resolve |
| Handler log | `brief-requested-wake` delivered |

## Daily usage recap

1. Click **Run daily brief**.
2. Agent wakes and resolves **agent** step with formatted output.
3. Review in canvas.
4. Mark done.

## Related

- [Tutorial index](./index)
- [Handlers bridge spec](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/bridges/handlers.md)
- [Connect your agent (MCP)](../../agents-mcp)
