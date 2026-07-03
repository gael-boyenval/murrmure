# UI/UX Critique: Run — orchestration validation

**Reviewed:** 2026-07-01  
**Snapshot:** run-orchestration-validation.png  
**Route:** `/runs/:id` — agent-pushed graph awaits human approval

## Context & intent

Agents may MCP-push **session-scoped orchestration** that binds only after a **human gate** validates the proposed graph. This is a high-stakes observer moment: the user approves or rejects a pipeline the agent authored. Philosophy: flows declare work; shell visualizes; views never own orchestration. `OrchestrationValidateGate` combines preview graph, step contract details, and resolve actions.

## What works well

- **Dedicated "Review proposed orchestration" section** signals this is not a routine review gate — distinct card title and manifest subtitle (`agent-proposed pipeline`).
- **Preview flowchart renders proposed steps** in the same vocabulary as live runs — consistent mental model.
- **Step contract block lists space, action, params** — supports protocol-vs-implementation boundary (user sees *what* will be invoked, not prompts).
- **Approve/Reject at bottom** reuses gate resolve pattern — learnable across gate types.
- **Live graph still shown above** so user sees current session state while evaluating the proposal.

## Issues & concerns

### Visual design

- **Two nearly identical flowcharts stack vertically** — current-state graph and proposed preview use the same parallel layout in the prototype, so the page reads as duplicate noise rather than before/after.
- **Overwhelming vertical density.** Flowchart + preview card + step list + resolve form creates a long scroll for a single decision — cognitive load is high for a gate that should feel deliberate, not buried.
- **Step detail typography is monospace-dense** (`Params: topic: string, depth: string`) — accurate for protocol but hostile to non-engineer reviewers.
- **No diff/changelog visual language** — added steps, removed steps, or reordered graph invisible.

### UX / usability

- **Current graph shows failed Draft lane** while user is asked to approve a *new* pipeline — confusing narrative: is approval fixing the failure or replacing the run?
- **Missing provenance.** No agent id, timestamp, or "proposed 8m ago" — hard to audit who pushed orchestration.
- **"Action: gate" on review step** exposes orchestration grammar; user-facing copy should say "Human review" or similar.
- **Param shapes without example values** — user cannot tell what topic/depth the agent intends.
- **Approve has same visual weight** as on a simple notes gate — orchestration bind is irreversible; may warrant stronger confirmation or summary checklist.
- **Run header unchanged** (`working`, same `run_8f3a2b`) — orchestration gate on a different run id in fixtures (`run_orch_new`) is not reflected; breaks trust in prototype fidelity.

### Accessibility (visible cues only)

- **Long scroll without skip links** — no "Jump to decision" for keyboard users wading through two graphs.
- **Graph nodes remain color-only** for status in the upper chart.

### Consistency with shell intent

- **Correct feature placement** — human gate before bind matches philosophy and anti-pattern list (no shell graph editor; agent pushes, human validates).
- **Risk of feeling like authoring UI** when two graphs + step contracts resemble a pipeline builder — tighten copy and diff UX to stay observer-only.
- **Logs link in header** does not offer "view proposal manifest" or export for audit.

## Recommendations (prioritized)

1. **Show explicit diff** — side-by-side or overlay: new steps highlighted, removed grayed, changed params called out.
2. **Collapse or hide current graph** when proposal is the focus; offer toggle "Current run" vs. "Proposed pipeline."
3. **Add proposal metadata row** — proposer, time, digest/hash, session link.
4. **Humanize step list** — "Research in Demo space" instead of raw `spc_demo` / param shapes; optional expand for schema nerds.
5. **Confirmation step on Approve** — recap step count, spaces touched, and "This will bind orchestration for this session."
6. **Distinct gate styling** — stronger accent than review gate; consider inline with spec's gate tab deep link.
7. **Fix prototype data alignment** — header run id and lifecycle should match orchestration gate fixture for credible snapshots.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 2 | Duplicate graphs; decision buried at bottom |
| Readability | 2 | Technical step contracts; weak narrative |
| Affordance / clarity | 3 | Approve/Reject clear; proposal vs. current state muddy |
| Dark-theme polish | 3 | Consistent cards; density hurts scan |
| Fit for orchestration UX | 4 | Right capabilities; needs diff + provenance UX |
