# Part 7 — Same room, no flow — then commit

**Concept:** Convene does not require a flowchart. Cleanup is **your repo**, not a hub “archive chat” feature.

## Step 1 — Headless convene

From **chat A** (`flow:run` is enough for `murrmure_start_meeting`). Same roster as the flow, chair designer, goal one line. **No** `flow` / `step`.

```json
{
  "title": "API shape",
  "goal": "Pick an approach for the public list endpoint",
  "participants": [
    { "space_id": "spc_PASTE_APP", "persona": "designer" },
    { "space_id": "spc_PASTE_APP", "persona": "qa" },
    { "space_id": "spc_PASTE_RESEARCH", "persona": "researcher" }
  ],
  "chair": { "space_id": "spc_PASTE_APP", "persona": "designer" }
}
```

You should see:

- New `ses_…`
- Sessions list meeting badge
- Transcript default
- **No** `api-shape` run / no `decide` node
- Same `said` / Close rules

Optional: one short `said` + designer `closed` so this is not “empty room 2.”

CLI twin (same payload, not a wizard):

```bash
mrmr meeting start \
  --title "API shape" \
  --goal "Pick an approach for the public list endpoint" \
  --chair spc_PASTE_APP:designer \
  --participant spc_PASTE_APP:designer \
  --participant spc_PASTE_APP:qa \
  --participant spc_PASTE_RESEARCH:researcher
```

## Step 2 — What headless is for

Agents / automation. Humans still **Run** a meeting flow when they want a dashboard trigger. Do not add a shell “New meeting” habit.

## Step 3 — Commit (cleanup last)

From `meeting-app` (and a second commit on research if you want both clean):

```bash
git add -- .gitignore .mrmr/space .mrmr/flows docs/api-shape.md
git status --short   # .mrmr/dev must not appear
git commit -m "chore: configure meeting tutorial spaces"
```

`.mrmr/dev` stays ignored. No view `dist/`.

## You wired

Two spaces · ads · `meeting:` step · Transcript · `mcp_session` said handlers · chair close → implement · headless convene.

## Next paths

- [Meetings](../../meetings) — conceptual home
- [Space handlers](../../space-handlers) — `on.event.participant`
- [Shell UI routes](../../shell-routes) — watch a meeting
- [Tutorial 1a](../01-local-preview-review-v3/) if someone skipped it

Do **not** “now build a meeting View.” A validation View (PR / artifact review) is a later sibling step with `view_resolver` — same session, Transcript stays a tab.
