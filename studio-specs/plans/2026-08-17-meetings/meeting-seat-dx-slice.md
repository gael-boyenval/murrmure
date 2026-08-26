# Meeting seat DX — turn-prompt slice

**Status:** draft (from meeting `ses_01M08BQWT34MX69F8ZE20AB4SY`, 2026-08-17)  
**Owners:** developer seat (`spc_murrmure`)  
**Normative when shipped:** `studio-specs/current/meetings/spec.md`, `apps/docs/guide/meetings.md`, `apps/docs/reference/mcp-tools.md`, agent + developer skills

---

## Problem (observed)

Three seats ran the secret-artifact exercise successfully (`put_artifact` → `said(artifacts)` → `get_artifact`). Artifact loop worked. Friction was **seat bootstrap**, not wire protocol:

| Friction | Seats affected | Extra call / retry |
|----------|----------------|-------------------|
| Convene turn omitted `subject` | all three | `murrmure_get_session` on first turn |
| Said turn omitted triggering `artifacts` | recipients of `xfr_*` | `murrmure_meeting_transcript` before `get_artifact` |
| `murrmure_emit_event` missing `to` | memory seat (once) | retry after `TO_EMPTY` / validation error |

Said turns already carried `subject`; convene did not. Memory seat's validation error was clear; docs/schema hint would have prevented the retry.

**Artifact loop unchanged** — no changes to put/get ACL, hub expand, or attach recipe.

---

## Goal

A meeting seat on **any** turn (convene or said) has enough context in the live-turn markdown to act without extra MCP round-trips for goal or artifact ids.

---

## Consensus scope (three seats + chair)

### 1. Convene turn carries `subject` (required)

Include session goal in the protocol envelope on `trigger: convened`:

```yaml
subject: "<session subject from convene>"
```

**Root cause:** `buildMeetingWakeData` already resolves subject from the session; `resolveInvokePrompt` (`invoke-shell-prompt.ts`) drops it when rendering the first-turn protocol block.

**Surfaces:**

| File | Change |
|------|--------|
| `packages/executors/src/invoke-shell-prompt.ts` | Pass `subject` from `context.params` into `renderMurrmureMeetingProtocolEnvelope` on convene + said first spawn |
| `packages/hub-core/test/unit/meetings/assignment-prompt.test.ts` | Convene integration test via `resolveInvokePrompt` with subject in params |

### 2. Said turn inlines triggering `artifacts` (required)

When the wake message carries `artifacts: [xfr_*]`, include them in live-turn markdown:

```yaml
artifacts: [xfr_01J…]
```

Seat can call `murrmure_get_artifact` immediately; transcript pull becomes optional for artifact-only turns.

**Surfaces:**

| File | Change |
|------|--------|
| `packages/hub-core/src/meetings/assignment-prompt.ts` | `formatLiveSaidPrompt` — append `artifacts:` line when payload has `xfr_*` refs |
| `packages/hub-core/src/hooks/dispatch.ts` | Already passes full `input.event.payload` — no change expected |
| `packages/hub-core/test/unit/meetings/assignment-prompt.test.ts` | Said prompt with artifacts |

**Optional one-liner** in convene operating rule (not said rule): artifact recipe hint — `put_artifact → said(artifacts) → get_artifact(local_path)`. Keep under one line; link to skill reference, do not inline full tutorial.

### 3. `murrmure_emit_event` documents `to` shape (required)

Add a one-line example to the MCP tool description / `mrmr.meeting.said` payload schema:

```json
"to": { "participant_ids": ["ptc_…"] }
```

or `{ "all": true }` — xor, required.

**Surfaces:**

| File | Change |
|------|--------|
| `packages/hub-daemon/src/mcp-tool-schemas.ts` | Enrich `murrmure_emit_event` `mrmr.meeting.said` branch description + `payload.to` properties |
| `packages/mcp-bridge/src/input-schema.ts` | Mirror if bridge owns emit schema |
| `apps/docs/reference/mcp-tools.md` | Same example |
| `packages/cli/skill-agent/reference/mcp.md` | Same example |

Do **not** schema-default `to` — hub validation stays strict; docs-only fix.

### 4. Transcript may carry `subject` (optional, KB proposal)

`murrmure_meeting_transcript` response adds top-level `subject` when session has one. Belt-and-suspenders for seats that pull transcript before acting; does not replace convene inline subject.

**Surfaces:**

| File | Change |
|------|--------|
| `packages/hub-core/src/meetings/transcript.ts` | Include `subject` in projection DTO |
| `packages/hub-daemon/src/routes/meetings/` (transcript route) | Wire field |
| `packages/hub-daemon/test/http/meetings/transcript.test.ts` | Assert `subject` present |

---

## Vertical slice (implementation order)

1. **Convene subject** — smallest fix, highest payoff (removes `get_session` on every seat).
2. **Said artifacts inline** — removes transcript round-trip on attach delivery.
3. **emit_event `to` example** — docs/schema only.
4. **Transcript `subject`** — optional follow-up.

---

## Acceptance

- [ ] Convene live-turn / first-spawn prompt includes `subject:` when session has a goal.
- [ ] Said live-turn lists `artifacts: [xfr_*]` when the triggering message attached files.
- [ ] `murrmure_emit_event` MCP catalog shows required `to` shape for `mrmr.meeting.said`.
- [ ] (Optional) Transcript response includes `subject`.
- [ ] Docs + agent skill updated in same slice.
- [ ] Re-run secret-artifact exercise: no seat calls `get_session` on convene; recipient with inline `artifacts` can `get_artifact` without transcript first.

---

## Out of scope

- Changes to artifact ACL, `expandArtifactReaders`, or put/get handlers.
- Defaulting `to` on said emits.
- Chair-upload convene attachments (Q3 in artifact slice — still deferred).

---

## Changelog

- 2026-08-18 — Draft from meeting `ses_01M08BQWT34MX69F8ZE20AB4SY` optimization discussion.
