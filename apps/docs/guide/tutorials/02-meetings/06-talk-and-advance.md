# Part 6 — Close the room so the flow can continue

**Concept:** `mrmr.meeting.closed` **is** the resolve of `decide`. Then the next step runs like 1a `write_spec`. Talk may address several seats, reply to a message, and attach a file.

## Before you start

Part 5 handlers stay. Wait until the Part 5 run is **terminal** (apply quiescence — `SPACE_HAS_ACTIVE_RUNS` if you apply too soon).

## Step 1 — Extend the manifest

Diff from [Part 3](./03-meeting-flow):

```diff
     meeting:
       participants:
         - { space: "spc_PASTE_APP", persona: designer }
         - { space: "spc_PASTE_APP", persona: qa }
         - { space: "spc_PASTE_RESEARCH", persona: researcher }
-      chair: { human: true }
+      chair: { space: "spc_PASTE_APP", persona: designer }
       goal: Pick an approach for the public list endpoint
+    branches:
+      completed:
+        route: { step: implement }
+      failed:
+        route: { run: failed }
+
+  - id: implement
+    description: Record the meeting outcome in the repo.
```

Paste the same `spc_…` ids as Part 3. Full file:

<!-- tutorial-meetings-fence:part-6-flow -->
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
      chair: { space: "spc_PASTE_APP", persona: designer }
      goal: Pick an approach for the public list endpoint
    branches:
      completed:
        route: { step: implement }
      failed:
        route: { run: failed }

  - id: implement
    description: Record the meeting outcome in the repo.
```

## Step 2 — Implement handler

Append to app `handlers.yaml` (keep the two `said` handlers). Close currently resolves `decide` with an empty payload — the command records the same outcome string the chair will emit.

<!-- tutorial-meetings-fence:part-6-implement-handler -->
```yaml
  - id: write_decision
    on: step.opened::api-shape.implement
    type: shell_spawn
    complete: auto
    command: |
      mkdir -p docs
      printf '%s\n' Use cursor-based pagination > docs/api-shape.md
    timeout_ms: 10000
```

Do not invent a second agent for implement.

```bash
cd ~/work/meeting-app && mrmr space apply --strict
```

## Step 3 — Run and talk like a room

**Run.** You should see chair = **designer**, not human. Shell **Close** is absent or denied.

Script **three** emits (fill live `ptc_*` / `msg_*` from Transcript):

1. **Chat A (designer)** → researcher: `Need the last latency study.` (same as Part 5)
2. **Chat B (researcher)** → `{ participant_ids: [designer ptc, qa ptc] }`, `in_reply_to` = designer’s `msg_*`, text plus optional artifact. Prefer a real attach (`xfr_…` / a small `~/Documents/latency-brief.md`) if the attach API is handy; text-only is allowed. You should see: thread hook, **two** receipts, QA seat **working**.
3. Later `said` → designer only (researcher or designer): `to: { participant_ids: [designer ptc] }`. QA receipt/wake **absent**. QA may still pull the transcript.

Desktop must-show: from, to (or “everyone” if you try `{ all: true }` — optional), receipts, artifact as a **link** (not a PR renderer).

## Step 4 — Designer closes (not you, not `resolve_step`)

Chat A:

`murrmure_emit_event` `event_type: mrmr.meeting.closed` with top-level `session_id` and `payload` outcome text `Use cursor-based pagination`.

You should see:

- Transcript **closed**, outcome visible
- Further `said` → `MEETING_CLOSED` (optional one failed emit)
- `decide` completed → `implement` → `docs/api-shape.md` contains the outcome line
- Run **succeeded**

```text
mrmr.meeting.closed
  └─ step.resolved(decide, completed)
       └─ step.opened(implement) → write_decision
            └─ step.resolved(implement, completed)
                 └─ run.terminal(success)
```

## Step 5 — Non-chair close (on-purpose fail)

Before closing, or on a fresh run: try Close in the shell or emit `closed` as **qa**. You should see **`MEETING_CHAIR_REQUIRED`**. Then close as designer.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Missing `docs/api-shape.md` | Implement handler not applied / run failed before implement | Apply app space; close as designer |
| File empty or wrong text | Command does not match the close line | Use the fence command; close with `Use cursor-based pagination` |
| `SPACE_HAS_ACTIVE_RUNS` | Part 5 run still open | Wait or Close that run first |
| `MEETING_ALREADY_OPEN` | Second convene on the same session | One meeting per session while open |
| Artifact ACL | Reader not on roster | Roster spaces only |
| Shell Close works | Chair still human | Part 6 chair is designer |

## Checkpoint

- [ ] Chair is designer; shell Close denied for you
- [ ] Researcher `said` to designer + qa (two receipts); later designer-only `said` does not wake QA
- [ ] Designer `closed`; `implement` wrote `docs/api-shape.md`
- [ ] Non-chair close → `MEETING_CHAIR_REQUIRED`

## Next

[Part 7 — Same room, no flow — then commit →](./07-headless-and-cleanup)
