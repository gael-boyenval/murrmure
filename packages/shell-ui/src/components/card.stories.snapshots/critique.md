# UI/UX Critique: Card

**Reviewed:** 2026-07-01 (updated P2 orchestration stories)  
**Snapshots:** default.png, run-card.png, gate-card.png

## Context & intent

Cards group related content in Murrmure — space home sections, run summaries, notification items, and gate panels. They should frame information for scanning without feeling like editable forms or authoring wizards.

## What works well

- **Clear typographic hierarchy.** Bold white title above muted gray description establishes title → supporting detail order suitable for run name + last event summary.
- **Subtle elevation on dark canvas.** Charcoal card surface with thin low-contrast border separates content from pure black background without heavy shadow — fits Vercel-inspired dark theme.
- **Generous internal padding.** Content breathes; readable at a glance when stacked in a space home or notification drawer.
- **P2 — RunCard demonstrates observer-first pattern.** Title + `Running` badge + chevron, space/time metadata, mono run ID — read-only click-through without Action/Cancel footer noise.
- **P2 — GateCard uses amber border emphasis.** Gate badge, pending time, domain copy, and footer separated by top border with Approve/Reject pair at `sm` size.
- **Lifted description contrast on orchestration cards.** `text-foreground/70` on RunCard/GateCard summaries improves journal/gate snippet readability vs. pure muted-foreground.

## Issues & concerns

### Visual design

- **Card surface vs. page background delta is modest.** On screens where the app background is not pure black, the card may blend into sidebars or main panels — border carries most of the separation burden.
- **Default story still generic.** Primitive Action/Cancel demo retained for shadcn parity; production cards should prefer RunCard/GateCard patterns.

### UX / usability

- **NotificationItem compact variant not yet snapshotted.** Unread dot + single-line inbox row still missing from story set.
- **Fixed width (380px in stories)** may not reflect responsive behavior in notification list vs. full-width space home grid.

### Accessibility (visible cues only)

- **Title/description contrast appears adequate** for primary and secondary text roles.
- **RunCard chevron is decorative** (`aria-hidden`); whole-card link needs focus ring when wired in production.
- **GateCard footer buttons have strong contrast** — primary Approve and destructive-outline Reject.

### Consistency with shell intent

- **RunCard aligns with observer shell** — status + deep-link, no inline mutation.
- **GateCard mirrors GateResolvePanel footer** — Approve/Reject at sm with action separation via border-t.
- **CardFooter primitive not extracted** — border-t on CardContent works in stories; optional `CardFooter` component still open if reused widely.

## Recommendations (prioritized)

1. ~~**Add orchestration-specific story snapshots**~~ — **Done (P2):** RunCard, GateCard.
2. **Add NotificationItem compact story** — unread accent, single CTA or chevron only.
3. **Show card on non-black shell background** snapshot to validate border/fill separation in real app chrome.
4. **Extract CardFooter** if gate/notification cards share footer styling in shell-web.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Title, body, actions well ordered |
| Readability | 4 | Orchestration cards lift description contrast |
| Affordance / clarity | 4 | RunCard vs GateCard patterns distinct |
| Dark-theme polish | 4 | Subtle, professional elevation |
| Fit for orchestration UX | 4 | Domain-shaped examples shipped; NotificationItem pending |
