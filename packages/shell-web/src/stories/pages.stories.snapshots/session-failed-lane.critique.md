# UI/UX Critique: Session — failed lane

**Reviewed:** 2026-07-01 (post button Slot fix + snapshot regen)  
**Snapshots:** session-failed-lane.png

## Context & intent

Partial failure is a first-class session state: one parallel lane fails while others continue or wait. Shell spec requires lane borders green (`completed`) / red (`failed`), session badge `partial_failure`, and **Retry** on failed lane via `POST /v1/runs/{id}/retry`. This snapshot should communicate degraded but recoverable orchestration — legible failures are a philosophy goal.

## What works well

- **Failed lane is visually distinct.** "Draft" node with red border stands out against green "Research" and amber fork/join nodes — instant scan for which branch broke.
- **`partial_failure` session badge (CC-12).** Header shows amber "Partial failure" — syncs session-level status with graph truth.
- **Failed run in Runs list.** `run_fail99` appears with `failed` badge, error one-liner (`invoke:agent returned exit code 1 after 3 retries`), and selected highlight — graph/list/retry target aligned.
- **Lane detail card with error context.** Right rail shows lane title, failed badge, run link, space, last step, started time, and red error box — legible failure before retry.
- **"Retry failed lane" action** below lane detail with helper copy ("Creates a new run referencing this lane's failed attempt") — matches spec's retry affordance.
- **Parallel structure still readable** after failure — user sees that only one lane failed, not total session collapse; supports cross-space parallel delivery narrative.
- **Runs list shows sibling runs still working/waiting** — reinforces partial failure semantics vs full session failure.
- **"View error in log explorer"** link tailored to failure context — better than generic logs shortcut.

## Issues & concerns

### Visual design

- **React Flow MiniMap/Controls white blocks** remain — especially jarring next to red failure signaling; looks like a rendering error users might confuse with the failure itself.
- **Retry button sits below error card** — hierarchy is good; could use outline-destructive tint to signal consequence.

### UX / usability

- **~~Session badge still reads "active"~~** Resolved (CC-12): `partial_failure` badge shown.
- **~~Selected run does not appear in Runs list~~** Resolved: `run_fail99` listed with error excerpt.
- **No confirmation or scope hint on Retry beyond helper text.** Retrying a lane creates a new run with `reference_run_ids`; optional confirm for destructive re-invoke still absent.
- **"Draft" label alone may be insufficient** for multi-matrix sessions — matrix index, space, or worktree label would disambiguate parallel lanes.
- **Header "Needs you 3" unrelated to this session failure** — failed runs may also notify globally; badge doesn't reflect this session's failed lane unless user connects dots.

### Accessibility (visible cues only)

- **Failure now has text chip on node ("Failed")** and error box in lane detail — improves on color-only signaling; graph legend still absent.
- **Retry button label is good plain language** with helper copy; screen readers benefit from explicit run id association (present in lane detail).

### Consistency with shell intent

- **Partial failure modeling complete in snapshot** — graph, badge, list, lane detail, and retry align with CC-12.
- **Retry endpoint behavior not reflected post-click** — no mention of new run id after submit; acceptable for static prototype.
- **Logs deep-link pre-filtered** via "View error in log explorer" — matches retrieval-vs-live split.

## Recommendations (prioritized)

1. **~~Show `partial_failure` session badge~~** — done (CC-12).
2. **~~Include failed run in Runs list with error one-liner~~** — done.
3. **~~Add lane detail card above Retry~~** — done; consider journal excerpt link to `/runs/:id`.
4. **Retry flow copy:** optional confirm for irreversible re-invoke; show spawned run id after success.
5. **Theme or hide MiniMap/Controls** — same fix as other session snapshots.
6. **Pre-filter log explorer link** with `session_id` and failed `run_id` query params (copy suggests intent; verify href in implementation).

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Red lane + partial_failure badge clear; overlays noisy |
| Readability | 4 | Error excerpt + lane detail land well |
| Affordance / clarity | 4 | Retry contextualized; confirm step optional |
| Dark-theme polish | 2 | White flowchart widgets |
| Fit for orchestration UX | 5 | CC-12 partial-failure story complete in snapshot |

---

**Headline:** CC-12 partial-failure snapshot is production-grade — theme flowchart chrome next.
