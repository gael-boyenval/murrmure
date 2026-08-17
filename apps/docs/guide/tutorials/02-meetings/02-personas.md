# Part 2 — Advertise seats

**Concept:** `.mrmr/space/personas.yaml` is a **catalog of ads**. The hub indexes handles and blurbs. It does **not** pick a handler, spawn an agent, or require anyone to follow `asks` / `requests`.

## Step 1 — App catalog (two voices, one space)

Write `~/work/meeting-app/.mrmr/space/personas.yaml`:

<!-- tutorial-meetings-fence:part-2-app-personas -->
```yaml
version: 1
personas:
  - id: designer
    summary: Product UI in this repo
    asks:
      - UX review of a flow or screenshot
    requests:
      - critique an artifact
  - id: qa
    summary: Breaks the happy path
    asks:
      - empty states, auth, pagination edges
    requests:
      - a repro, not a vibe
```

## Step 2 — Research catalog (one voice)

Write `~/work/meeting-research/.mrmr/space/personas.yaml`:

<!-- tutorial-meetings-fence:part-2-research-personas -->
```yaml
version: 1
personas:
  - id: researcher
    summary: Technical research and prior art
    asks:
      - literature / papers on a topic
      - latency or perf evidence
    requests:
      - attach a written brief
      - recommend a choice (not decide)
```

## What you did not write

No prompts, no model, no skills, no `on:` bindings. Those stay in `handlers.yaml` / `agent.md`. If the catalog says “attach a brief” and they never do, the hub does not care.

## Step 3 — Apply both

```bash
cd ~/work/meeting-app && mrmr space apply --strict
cd ~/work/meeting-research && mrmr space apply --strict
```

## Step 4 — List ads (MCP)

In **chat A** call `murrmure_list_personas`.

You should see `designer` and `qa` with summaries. **No handler ids. No prompt text.**

In **chat B**: `researcher` only.

After apply: no new **Run** button (still no flow). Optional: space index / doctor mentions the catalog.

## Checkpoint

- [ ] App space has `designer` and `qa` in `personas.yaml`
- [ ] Research space has `researcher` only
- [ ] Both applies succeeded `--strict`
- [ ] `murrmure_list_personas` in each chat matches that space — ads only
- [ ] You did **not** convene and did **not** write handlers yet

## Next

[Part 3 — A step that is a room →](./03-meeting-flow)
