# UI/UX Critique: Flow preview — step list

**Reviewed:** 2026-07-01  
**Snapshots:** flow-preview-step-list.png

## Context & intent

`/spaces/:id/flows/:flowId` is a **read-only** flow preview (`flow:read`): inspect installed orchestration contract without mutating space or running from this view (Run lives on space home / drawer). Philosophy: flows declare work; this page shows the declared step graph as reference material for observers and agents orienting to a space.

## What works well

- **Clear page identity.** “Review loop” title with manifest fingerprint `sha256:abc123def456…` communicates human name + immutable contract id — good for audit and “which version is installed.”
- **Step list is scannable.** Numbered rows with kind badge (`start`, `invoke`, `gate`) plus step id read left-to-right in execution order.
- **Cross-space invoke visible.** `research @ spc_demo`, `publish @ spc_ops` surfaces federation/orchestration across spaces — core Murrmure story on a simple list.
- **Read-only tone.** No Run button, no edit affordances — observer-appropriate; avoids Configure-era wizard feel.
- **“← Back to space” wayfinding.** Returns user to space home context without relying on sidebar alone.
- **Compact badge + monospace ids.** Technical audience can parse `invoke` / `gate` kinds and action names quickly.

## Issues & concerns

### Visual design

- **Very sparse canvas.** Large empty margins and a single Steps card underuse space — page feels like a stub rather than a purposeful preview destination.
- **Redundant typography on rows.** Badge already says `invoke`; adjacent monospace `research` repeats kind-adjacent identity — visual noise without adding semantics.
- **Cross-space targets are easy to miss.** `@ spc_demo` / `@ spc_ops` in `text-xs text-muted-foreground` — critical orchestration detail fades into background.
- **sha256 line is inert.** Truncated hash with no copy icon or expand — users comparing manifests cannot act on it.
- **Back link is plain muted text.** Not styled as button or breadcrumb; easy to overlook compared to sidebar navigation.

### UX / usability

- **List-only preview underwhelms for multi-step flows.** Phase-09 shell invests in `RunFlowchartView` for sessions/runs; flow preview shows linear list only — no graph, forks, or join nodes for matrix flows.
- **No flow metadata.** Missing description, `requires_view` hint, manual vs triggered start, or install path — observer cannot tell how this flow is started from space home.
- **Gate step opaque.** Row `gate · review` does not show gate schema, assignee, or timeout — human approval step is structurally important but visually same weight as invoke.
- **No space context in header.** Route is space-scoped (`/spaces/:id/flows/...`) but page does not repeat which space owns the install (sidebar selection helps, but header/breadcrumb would anchor).
- **No link from steps to actions/spaces.** `publish @ spc_ops` could deep-link to ops space or action docs — currently inert text.

### Accessibility (visible cues only)

- **Numbered list provides sequence** for screen readers — good.
- **Kind communicated by badge text** — adequate if badges have accessible names; color alone not relied on.
- **Low contrast on invoke targets** may fail extended reading for low-vision users.

### Consistency with shell intent

- **Correct read-only observer route** — no flow install UI in shell.
- **Thin vs philosophy “flows declare orchestration”.** Page shows declaration but not how it relates to sessions, views, or triggers — acceptable for v1 preview if documented elsewhere.
- **View coupling invisible.** If `start.requires_view: review-params`, preview should note that runs open `ViewDrawer` first — per views.md run flow.

## Recommendations (prioritized)

1. **Add flow metadata block** under title: space name, start mode (manual), `requires_view` badge if present, one-line description from manifest.
2. **Elevate cross-space invoke targets** — badge or link styling for `@ spc_*`; optional click to space home.
3. **Expand gate rows** — show gate id, form summary, or “human approval” label distinct from invoke.
4. **Offer graph toggle** when manifest has parallel/join — reuse read-only subset of `RunFlowchartView` or mini DAG.
5. **Copyable manifest hash** with full value on hover/tooltip.
6. **Improve back navigation** — breadcrumb `Demo space / Flows / Review loop`.
7. **Snapshot a richer flow** (matrix, fork/join) to stress-test list-only vs graph need.

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 3 | Title strong; body sparse |
| Readability | 3 | Steps clear; cross-space muted |
| Affordance / clarity | 3 | Read-only clear; metadata thin |
| Dark-theme polish | 4 | Clean, developer-tool aesthetic |
| Fit for orchestration UX | 2 | List-only preview misses graph + view/start hints |
