# UI/UX Critique: Space home — empty

**Reviewed:** 2026-07-01 (post button Slot fix + snapshot regen)  
**Snapshot:** space-home-empty.png  
**Story:** "Space home — empty" (`SpaceHomePrototype` state `empty`)  
**Route:** `/spaces/:id` — first-time or idle space with no indexed flows or session history.

---

## Context & route intent

Space home is the default landing for a linked space in observer mode. With no active work, it should orient the user toward CLI setup (`mrmr space apply`, flow init/push) while keeping the shell readable and calm. The v2 payload exposes one unified `flows` collection for authored and federated flows; empty states should degrade gracefully without wizard UI.

This snapshot shows **Demo space** with three cards: Active runs, Flows (with CLI apply hint), and Recent completed — all in placeholder mode. Receiving from is hidden when empty, matching production.

---

## What works well

- **Observer chrome is clear.** Header shows Murrmure + "Observer" badge, notification bell, profile/space controls, and sidebar with linked spaces — reinforces read-only shell, mutations via CLI.
- **Section order matches mental model.** Active → flows → history top-to-bottom mirrors "what's running → what I can start → what finished."
- **CLI-first empty copy on Flows.** Elevated empty state: explanation line plus monospace `mrmr space apply` in a bordered code block — on-brand; no fake Run buttons or install wizards.
- **Unified Flows surface.** Authored and federated flows share one canonical list rather than separate authored and runnable sections.
- **Consistent card primitive.** Rounded cards, `text-base` section titles, muted empty lines — same vocabulary as active states.
- **Sidebar "+ New space"** routes to `/spaces/new` (CLI instructions) per first-run spec; low visual weight avoids competing with main content.
- **Narrow content column (`max-w-2xl`).** Comfortable reading width for a dashboard that is mostly lists.

---

## Issues

### Visual design

- **Three tall empty cards feel sparse.** Equal visual weight on three "nothing here" blocks creates vertical dead space; the page reads unfinished rather than intentionally quiet.
- **No differentiated empty-state treatment.** Flows (actionable via CLI) and Active/Recent (passive wait) use identical gray one-liners — missed hierarchy opportunity.
- **Space title only; no path or slug.** "Demo space" alone may not disambiguate when users have similarly named spaces (spec shows `frontend` style labels).
- **Card borders are very subtle** on pure black — sections rely on title text alone for separation.

### UX / usability

- **~~Split authored and runnable flow sections.~~** Resolved by space-home v2: `flows` is canonical. Receiving from remains hidden when empty.
- **No bundled quick-start pointer.** Spec §12.5 / architecture plan mention bundled quick-start example alongside CLI; empty home could link to docs or `mrmr dev` hint.
- **"No recent runs" vs "No active runs"** — correct but passive; no link to `/logs` or journal explorer for users who expect history elsewhere.
- **Header "Needs you (3)" while space is empty** — global inbox count is fine, but may confuse on first visit ("what needs me if nothing is running here?"). Cross-space notifications are valid but unexplained on this page.
- **No loading / SSE-waiting state** for space index still syncing after `mrmr space link`.

### Accessibility (visible cues only)

- **Empty text contrast** appears adequate for secondary messaging.
- **Monospace CLI snippet** is readable; copy-to-clipboard affordance not shown (spec first-run page uses copy blocks).
- **No skip link or landmark cues** visible — relies on heading hierarchy (h1 + card titles).

### Consistency with shell intent

- **Aligns with observer-first** — no Configure mode, no inline flow authoring.
- **~~Gap vs production route~~** — prototype now mirrors the unified Flows surface and hides Receiving from when empty.
- **Sidebar label "New space"** vs product copy `[ + Add space ]` — minor wording drift.

---

## Prioritized recommendations

1. **~~Unify flow sections~~** — done: one Flows card consumes the v2 `flows` collection.
2. **~~Elevate Flows empty state~~** — done: CLI code block + apply explanation.
3. **Collapse or combine passive empties** — e.g. single "No sessions yet" subline under space title, or smaller inline empties instead of full cards for Active + Recent when both empty.
4. **Add first-run story variant** — sidebar with zero spaces → `/spaces/new` instruction page (separate story, but empty home should reference it when `flows` is empty).
5. **Context line under space title** — optional `spc_demo` mono slug or filesystem path for power users.
6. **Explain global "Needs you"** on empty space — tooltip or subtitle when count > 0 but `needs_attention` for this space is empty.

---

## Severity summary

| Area | Rating (1–5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 3 | Clear titles; too much empty vertical mass |
| Readability | 4 | Simple copy, good contrast |
| Affordance / clarity | 3 | CLI hint good; missing sections and quick-start |
| Dark-theme polish | 4 | Consistent with shell-ui cards |
| Fit for orchestration UX | 4 | Observer + CLI aligned; sections match spec |
| Empty-state UX | 3 | CLI block helps; passive Active/Recent cards remain |

---

**Headline:** Calm, CLI-honest empty home — the unified Flows card and CLI block land; consider collapsing passive Active/Recent empties next.
