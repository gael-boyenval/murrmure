# Phase 05 — ViewCanvasHost + checkpoint views

**Status:** ✅ complete  
**Execution order:** **5 / 10**  
**Feedback:** [views-mid-flow-ui](../../../../feedbacks/2026-07-02-improvement-views-mid-flow-ui.md)  
**Depends on:** [02](./02-view-sdk.md), [03](./03-engine-completion.md)  
**Decisions:** [03 context](./decisions/03-gate-view-context-shape.md) · [04 resolve adapter](./decisions/04-human-checkpoint-resolve-wire.md) · [05 checkpoint-only](./decisions/05-triggers-only-checkpoint-steps.md) · [07 session UX](./decisions/07-session-vs-run-user-facing.md) · [08 payload_ref](./decisions/08-payload-ref-from-step-output.md)  
**Reference:** [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md)

> **North-star centerpiece.** Custom views fill the **primary content region**. `ViewDrawer` / built-in forms = fallback/admin only.

---

## Manifest (normative)

```yaml
steps:
  - id: review
    checkpoint:
      view: preview-review
      assignees: ["{{input.reviewer}}"]
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
        default: { goto: done }
        cancel: { fail: true }
```

Human UI is **never** on `triggers:` — only on checkpoint steps ([decision 05](./decisions/05-triggers-only-checkpoint-steps.md)).

---

## ViewCanvasHost (shell component spec)

| Requirement | Detail |
|-------------|--------|
| **Layout** | Fills primary region on session/run routes when checkpoint pending |
| **Not** | `Sheet`, `max-w-lg`, side drawer as default |
| **Iframe (prod)** | `GET /v1/spaces/{space_id}/views/{view_id}/*` — hub-served `dist/` |
| **Iframe (dev)** | Author dev server URL when `mrmr view dev` active ([decision 02](./decisions/02-view-dev-loop.md)) |
| **Sandbox** | `allow-scripts allow-same-origin allow-forms` |
| **Chrome** | Shell header shows **session title** ([decision 07](./decisions/07-session-vs-run-user-facing.md)); `run_` id operator/debug only |
| **Fixture tabs (dev)** | Switch `dev/fixtures/*.json` scenarios without real run |

### Routing

| Condition | Shell behavior |
|-----------|----------------|
| Pending checkpoint with `view_ref` | Navigate/focus session route; mount ViewCanvasHost |
| Manual Run clicked | `POST …/run` → engine enters step 0; if checkpoint, pause + ViewCanvasHost |
| No `view_ref` at apply | Fallback `GateResolvePanel` — **admin only** |
| Dev mode | ViewCanvasHost dev route; submit logs only by default |

**Removed:** `start.requires_view` → ViewCanvasHost before run. Step 0 checkpoint handles intake.

---

## ViewAppContext (shell builder — normative)

Use **`ViewAppContext`** from `@murrmure/view-sdk` only — **no flat redefinition** ([decision 03](./decisions/03-gate-view-context-shape.md)).

When mounting ViewCanvasHost for a pending checkpoint:

1. Populate `gate: { gate_id, step_id, payload_ref }` from pending gate record
2. If manifest step has shell fallback `gate.form`, copy structure into `gate.responseSchema` (view field name)
3. Populate `steps` and `input` from run `exec_context`
4. Set `session_id`, `run_id`, token, routing ids

Send via `murrmure.view.context` postMessage.

---

## Submit handling (shell adapter — single mapper)

**Three-layer separation** ([decision 04](./decisions/04-human-checkpoint-resolve-wire.md)):

| View action | Shell sends to hub |
|-------------|-------------------|
| `submit(params)` — human completion | `POST /v1/gates/{gate_id}/resolve` `{ disposition: "continue", output: params }` |
| `cancel()` — dismiss | `{ disposition: "cancel", output: params? }` |

**Convention (not protocol):** review views use `outcome: "validated" | "changes_required"` inside `output`. Flow branches on `output.outcome`, not `disposition`. "Request changes" is **`disposition: continue`**.

**Removed:** mapping to `decision: approved/rejected`, `resume_data`, pre-run `POST …/run` from view submit.

Dev mode: log mapped payload; optional dry-run toggle in dev chrome.

---

## Hub / index

- [ ] `FlowCheckpointStepSchema.view` in contracts
- [ ] `apply-index.ts` → `view_ref` on checkpoint steps in flow IR
- [ ] Gate record stores `view_ref` when pending
- [ ] `payload_ref` from resolved template on gate record

---

## Definition of done

### Code

- [x] `ViewCanvasHost` in `shell-web` — replaces `ViewDrawer` as default
- [x] Checkpoint pending → ViewCanvasHost when `view_ref` present (step 0 + mid-run)
- [x] ViewCanvasHost dev route + fixture tab bar
- [x] `ViewDrawer` deleted or `@deprecated` dev-only
- [x] view-sdk host sends full checkpoint context per `ViewAppContext`
- [x] Shell resolve adapter: submit → `{ disposition, output }`

### Tests

- [x] Shell component: iframe width = primary region (not 480px) — **R3 CI minimum** ([decision 10](./decisions/10-reference-workflow-verification-layered.md))
- [x] Shell: view submit → resolve wire v2 → engine branches per `on_resolve`
- [x] Fixture `fixtures/flow-engine/gate-requires-view.json`

### Docs

- [x] shell/spec.md, view-sdk.md, skill views.md — session/title UX
- [x] Remove B4 from known-gaps

### Proof

- [ ] [06](./06-reference-workflow-preview-review.md) R3 — preview in ViewCanvasHost at checkpoint

---

*End of phase 05.*
