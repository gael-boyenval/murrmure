# UI/UX Critique: Connect — agent setup

**Reviewed:** 2026-07-01  
**Snapshots:** connect-agent-setup.png

## Context & intent

`/connect` serves **non-bundled** shell users connecting external agents (Cursor, Claude Desktop, etc.) to the hub. User pastes hub URL and CLI-minted grant token (`mrmr grant mint`); shell surfaces a prefilled MCP JSON snippet. Observer mode: no Configure wizard — CLI owns grants; shell only collects connection material.

## What works well

- **CLI-first copy.** Subtitle explicitly references `mrmr grant mint` — reinforces that grants are minted outside the UI, matching v2 philosophy.
- **Focused two-card layout.** Hub connection (inputs + save) then MCP snippet (read-only config) mirrors the mental model: connect → copy into agent harness.
- **Sensible defaults.** Local hub URL `http://127.0.0.1:8787` matches dev workflow; monospace token field signals secret format.
- **MCP snippet structure is correct.** `murrmure` command, `mcp` args, env vars for URL, token, and space id — aligns with cross-harness integration story.
- **Empty spaces sidebar.** “No spaces linked yet” correctly signals pre-connection state for this route.
- **Narrow max-width (`max-w-xl`).** Setup page feels like a single task, not a dashboard — appropriate for one-off configuration.

## Issues & concerns

### Visual design

- ~~**Header chrome contradicts sidebar.** Top bar still shows “Needs you 3”, Email/Desktop toggles, and “Demo space” dropdown while sidebar says no spaces linked — breaks trust in empty-state story.~~ **Fixed (P2):** `headerVariant="disconnected"` shows “Not connected” badge only.
- ~~**MCP block is dense monospace** without line numbers or copy affordance — hard to select full JSON accurately on first try.~~ **Partially fixed (P2):** “Copy MCP config” button added.
- **“Save & continue” is sole primary CTA** but “continue” destination is invisible — no progress hint or next step preview.
- **Grant token placeholder `tok_…` in snippet** while input is empty — “Prefilled from your connection values” subtitle is ahead of actual user input in snapshot.

### UX / usability

- ~~**No copy-to-clipboard** on MCP snippet — high-friction for the main deliverable of this page.~~ **Fixed (P2):** “Copy MCP config” button with accessible live-region confirmation.
- **`MURRMURE_SPACE_ID`: `spc_…` unexplained.** User has no spaces yet; snippet includes space id with no guidance on how to obtain or whether it’s optional for first connect.
- **Token security UX.** Plain visible input for grant token; no reveal/hide toggle, no warning about treating token as secret, no post-save masking.
- **Save feedback missing.** No success state, validation errors, or connection test — user cannot know if URL/token pair works before copying MCP config.
- **Bundled vs hosted ambiguity.** Spec notes bundled desktop uses same-origin token in localStorage; this page should clarify when `/connect` appears (hosted web only) to avoid confusion for desktop users.
- **+ New space in sidebar** while disconnected — may be correct (CLI instructions elsewhere) but competes with “connect first” narrative.

### Accessibility (visible cues only)

- ~~**Code block in `<pre>`** may not expose copy action to keyboard users if added later — plan for accessible copy button with announced success.~~ **Fixed (P2):** Copy button with `aria-live` confirmation.
- **Labels “Hub URL” and “Grant token”** are clear; association with inputs appears correct.

### Consistency with shell intent

- **Strong alignment with observer-only grants.** No in-UI grant minting or Configure mode — correct boundary.
- **Agent-agnostic positioning** is implied via MCP snippet but not stated in prose (“Paste into Cursor, Claude Desktop, or any MCP client”).
- **Space coupling in env vars** reflects protocol reality but page doesn’t bridge to `mrmr space link` / space init CLI flow.

## Recommendations (prioritized)

1. ~~**Fix prototype chrome for connect story** — zero Needs you badge, no space selector, or explicit “disconnected” header variant.~~ Done.
2. ~~**Add “Copy MCP config” button** with toast confirmation; keep snippet read-only.~~ Done (button + `aria-live` confirmation).
3. **Explain `MURRMURE_SPACE_ID`** — link to CLI space init/link docs or hide until first space exists.
4. **Post-save states:** validate connection, mask token, refresh snippet with real values.
5. **Add harness-agnostic one-liner** under title: where to paste JSON (Cursor settings, Claude config, etc.).
6. **Optional “Test connection”** after save — lightweight hub health check without becoming a wizard.
7. **Clarify page visibility** for bundled desktop (hide route or show “already connected”).

## Severity summary

| Area | Rating (1-5, 5=excellent) | Notes |
|------|---------------------------|-------|
| Visual hierarchy | 4 | Clear title → hub card → snippet |
| Readability | 4 | CLI reference and labels clear |
| Affordance / clarity | 3 | Copy + disconnected header fixed; space-id/save feedback remain |
| Dark-theme polish | 4 | Clean, minimal setup aesthetic |
| Fit for orchestration UX | 4 | Correct CLI-outside-UI boundary; needs polish |
