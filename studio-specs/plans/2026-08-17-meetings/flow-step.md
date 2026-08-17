# Meetings — flow step surface

**Status:** draft (hardening 2026-08-17)  
**Protocol:** [spec.md](./spec.md) · [pitfalls.md](./pitfalls.md) D3, D8  
**Shipped:** [bridges/step-contract.md](../../current/bridges/step-contract.md) · [ADR-007](../../ADR/ADR-007-resolver-agnostic-step-contracts.md)

A meeting may be a **protocol facet** on a resolver-agnostic step. It is not a `wait:` / `gate:` kind and not a View.

---

## 1. Why a facet

Today a step is `id`, optional `description`, optional `branches`, optional nested `steps` — **nothing else**. `FlowStepSchema` and `StepContractManifestStepSchema` are `.strict()`. `meeting:` is rejected.

`artifact_slots` is the wrong analogy: it is a **branch** field. Meeting is **step-level** — the step *is the room* until close.

Amend ADR-007 / step-contract “nothing else” in the **same PR** as the schema. Do not resurrect removed keys.

---

## 2. Authoring

```yaml
steps:
  - id: decide
    description: Designer and researcher agree the API shape
    meeting:
      participants:
        - { space: "{{input.app_space}}", persona: designer }
        - { space: "{{input.research_space}}", persona: researcher }
      chair: { space: "{{input.app_space}}", persona: designer }
      goal: "{{input.goal}}"
    branches:
      completed:
        route: { step: implement }
      failed:
        route: { run: failed }
```

| Field | Rule |
|-------|------|
| `participants[]` | `{ space, persona? }`. `space` may be a template. Hub resolves against indexed catalogs. Unknown → `PERSONA_NOT_FOUND`. Duplicate `(space, persona)` → reject. |
| `chair` | `{ space, persona? }` **or** `{ human: true }` |
| `goal` | Optional opaque string (templates ok) |
| Unknown keys | Reject (keep `.strict()` besides this object) |

`chair: { human: true }` — Close in the shell ([shell-lens.md](./shell-lens.md)). No compose.

Nested `meeting:` — **reject in v1** ([pitfalls.md](./pitfalls.md) O4).

Standalone convene (no flow) remains valid — [wire.md](./wire.md).

---

## 3. Runtime

| On | Hub does |
|----|----------|
| Step **opens** | `openStepContract` as today (memo `working`, `mrmr.step.opened`). Then **convene on this `session_id`**. Templates from `exec_context.input`. `spaces_touched` += roster. |
| Meeting **open** | Step stays `working`. No `view_resolver` required. Shell Transcript is the lens. |
| `mrmr.meeting.closed` | Engine `resolveFlowStep` — `failed` if `data.failed: true`, else `completed` (D19). Chair does **not** call `murrmure_resolve_step`. |
| Next step | Existing routes. |

`openStepContract` already allows no handler (`resolver: null`). A `step.opened` handler on the meeting step is **optional** (chair kickoff `said`). It is not required to open the room.

**Forbidden on the meeting step**

- `view_resolver` **for the chat** (apply warning or reject — prefer **reject** `MEETING_STEP_VIEW_RESOLVER`)
- `complete: auto` on that `step.opened` handler (would close the room)
- Teaching the kickoff assignment to `resolve_step` the meeting step

A **later / sibling** step may bind a View for PR/artifact validation. Same session; Transcript stays.

---

## 4. Compile / catalog

`compileStepContractCatalog` persists the facet on `StepContractCatalogEntry` (participants/chair/goal as authored, templates unresolved). If compile drops `meeting`, open-step convene has nothing to read ([pitfalls.md](./pitfalls.md) D17). No new IR kind. Default `completed` / `failed` still inject when `branches` omitted.

`handler-catalog-lint` must **not** require a `step.opened` handler on a meeting step.

Flowchart: the step is a normal node. Meta may show “meeting” + roster handles. Not a diamond unless branches are custom.

---

## 5. Assignment split

| Assignment | Envelope | Resolve |
|------------|----------|---------|
| Meeting **seat** (`on.event` `said`) | `murrmure.meeting/v1` | `said` / `closed` (chair only). **No** `resolve_step` on `decide`. |
| Optional **kickoff** `step.opened` | Today’s ADR-013 **only if** the handler is allowed to resolve — **don’t** ship that for v1 kickoff. Prefer kickoff = first `said` from a seat handler. | |
| **`implement`** (after close) | ADR-013 as today | `murrmure_resolve_step` / `complete: auto` |

---

## 6. One open meeting per session

Second convene while snapshot `open` → `MEETING_ALREADY_OPEN`. After close, a later step (or MCP) may convene again on the same `ses_*`.

Parallel matrix lanes with two `meeting:` steps on one session — second fails. Document; do not invent a second room id.

---

## 7. Acceptance (this surface)

- Opening `decide` convenes on the **same** `ses_*` as the run.
- Close advances to `implement` without a second `resolve_step`.
- Apply rejects `meeting:` unknown fields, nested meeting, `view_resolver` on the meeting step.
- Apply still rejects `wait:` / `gate:`.
- Headless convene (no flow) still works.
