# Part 3 — A step that is a room

**Concept:** `meeting:` is a **facet** on a resolver-agnostic step (same family as `artifact_slots`). The step *is the room* until the meeting closes. The file still does not run code, open a View, or spawn seats.

## Why there is no Part-3 view

1a needed a View because a human had to attach a file. Here the human only **watches** and later **Closes**. Binding `view_resolver` on `decide` for chat is an anti-pattern. Skip `mrmr space view init`.

## Step 1 — Flow shell

Create `.mrmr/flows/api-shape/flow.manifest.yaml` in **meeting-app only**.

A flow by itself does nothing. `triggers` records which kinds of starts are allowed — not an active listener. **`manual: true`** means you may click **Run** (or `mrmr flow run`). Something else must still act.

The research space does **not** get a copy of this flow.

Start with the header:

```yaml
apiVersion: murrmure.flow/v1
name: api-shape
description: Agree the public list endpoint in a room, then stop.

triggers:
  manual: true
```

## Step 2 — One step: `decide`

Open the file and make it match this complete manifest. Paste the two `spc_…` ids from your [workspace card](./01-two-spaces#fill-the-workspace-card). Do **not** use `{{input.*}}` as the required path — Desktop **Run** has no roster form in v1.

<!-- tutorial-meetings-fence:part-3-flow -->
```yaml
apiVersion: murrmure.flow/v1
name: api-shape
description: Agree the public list endpoint in a room, then stop.

triggers:
  manual: true

steps:
  - id: decide
    description: Designer, QA, and researcher agree the API shape.
    meeting:
      participants:
        - { space: "spc_PASTE_APP", persona: designer }
        - { space: "spc_PASTE_APP", persona: qa }
        - { space: "spc_PASTE_RESEARCH", persona: researcher }
      chair: { human: true }
      goal: Pick an approach for the public list endpoint
```

Notes:

- `chair: { human: true }` — you will Close in the shell (Part 4). Persona chair comes in Part 6.
- Default `completed` / `failed` are enough; last step ends the run.
- `meeting:` names **spaces + handles**, not prompts.
- Duplicate `(space, persona)` → reject.
- Unknown persona → `PERSONA_NOT_FOUND` (if you typo `designr`).

## Step 3 — Apply (yes, now — no view to wait for)

```bash
cd ~/work/meeting-app && mrmr space apply --strict
```

You should see `api-shape` on the **meeting-app** space home. Research space home still has no flow.

## Step 4 — Inspect the graph (do not Run yet)

You should see:

- Rectangular `decide` (not a diamond unless you added custom branches)
- Side panel: meeting roster (persona + space labels, not only `ptc_*`), goal text, chair = human
- **No** `view_resolver` / spec-intake
- **Run** in the flow-page header

::: tip Portable later
Production flows may use `{{input.app_space}}`. This tutorial pastes ids so **Run** stays the trigger. Do not build an intake View “just for ids.”
:::

## Checkpoint

- [ ] Flow lives only on `meeting-app`
- [ ] `triggers.manual: true`
- [ ] `decide` has `meeting:` with three seats and `chair: { human: true }`
- [ ] Both `spc_…` literals match the workspace card
- [ ] Research space has **no** flow
- [ ] You have **not** clicked **Run** yet

## Next

[Part 4 — Run it and read the room →](./04-run-and-read-the-room)
