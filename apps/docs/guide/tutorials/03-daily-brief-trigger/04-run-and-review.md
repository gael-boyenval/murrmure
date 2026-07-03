# Part 4 — Run and review end-to-end

1. Desktop → **Run** **daily-brief**
2. **ViewCanvasHost** shows custom view — click **Run daily brief**
3. Hook wakes agent; agent submits output via `submit_brief_output`
4. **Review** checkpoint — human **Mark done** in view
5. Run completes

Optional: auto-resolve path skips review checkpoint by branching `on_resolve` directly to `done`.

## Done

You completed Tutorial 3 — event-driven agent wake on v2 indexed flows.

## Next

- [Multi-agent brief](../02-multi-agent-brief/)
- [Configuration](../../configuration) — hooks and triggers
