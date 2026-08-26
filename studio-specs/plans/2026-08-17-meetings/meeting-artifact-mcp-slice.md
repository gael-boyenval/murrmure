# Meeting artifact attach — MCP slice

**Status:** draft (living — updated from KB goal-check meeting `ses_01M089391WQ5RVF5PQYZ9ZQA3G`)  
**Owners:** developer seat (`spc_murrmure`), default seat (`spc_01KYSGYPYDBWZ0D11SX8JJ854V`)  
**Normative when shipped:** `studio-specs/current/meetings/spec.md`, `apps/docs/guide/meetings.md`, `apps/docs/reference/mcp-tools.md`

---

## Problem (observed 2026-08-17)

Meeting seats exchanged surprise text files via `mrmr.meeting.said` + `artifacts: [xfr_*]`. Both seats were slow because:

1. **`murrmure_get_artifact` exists** (`space:read`) — materializes authorized `xfr_*` to `.mrmr/dev/inbox/`.
2. **`murrmure_put_artifact` does not exist** — upload is HTTP-only `PUT /v1/artifacts` (`blob:write`).
3. **`blob:write` is not grantable** via `mrmr connection grant` today (`parseGrantableCapabilities` rejects it).
4. **Meeting docs** describe read (`get_artifact`) but not attach (put → emit → peer get).
5. **Convene turn** omits session `subject`; seats call `murrmure_get_session` to learn the goal.

Typical seat workaround: grep specs/tests, `curl` with bootstrap token, then `murrmure_emit_event`.

---

## Goal

A meeting seat attaches a small file and references it in one `said` using **only MCP tools** from the meeting-seat grant recipe — no shell, no bootstrap.

---

## Vertical slice (implementation order)

| Step | Surface | Change |
|------|---------|--------|
| 1 | `packages/cli/src/wizard/capabilities.ts` | Add `blob:read`, `blob:write` to grantable enum + meeting-seat profile |
| 2 | Hub grants / MCP catalog | Accept `blob:write` on space connection grants |
| 3 | `packages/hub-daemon/src/mcp-tool-registry.ts` | Register **`murrmure_put_artifact`** (`blob:write`) |
| 4 | `packages/hub-daemon/src/mcp-handlers.ts` | Handler wraps `PUT /v1/artifacts` |
| 5 | `packages/hub-daemon/src/mcp-tool-schemas.ts` | Input schema |
| 6 | Docs + skills | `apps/docs/guide/meetings.md`, `reference/mcp-tools.md`, agent + developer skills |
| 7 | Operator | Re-grant every invited meeting space |

---

## `murrmure_put_artifact` (proposed)

**Scope:** `blob:write`  
**Wraps:** `PUT /v1/artifacts`

### Input

```json
{
  "path": "relative/to/space/root.txt",
  "content": "inline alternative to path",
  "name": "optional-filename.txt",
  "authorized_readers": ["spc_peer"]
}
```

- Exactly one of `path` or `content` — **neither required over the other** (inline cap = existing artifact inline cap, 64 KiB unless hub raises it).
- **v1 meeting acceptance:** inline `content` + `name` only (KB surprise notes were \<200 bytes). Optional `path` for on-disk files — out of acceptance scope.
- `name` required when using `content`; defaults from `path` basename when using `path`.
- `authorized_readers` optional on meeting attach — hub **`expandArtifactReaders`** on `mrmr.meeting.said` adds full roster when referenced in `artifacts`. **v1:** no `session_id` on `put`; put stays meeting-agnostic (Q2 resolved).

### Output

```json
{
  "artifact": {
    "transfer_id": "xfr_…",
    "digest": "sha256:…",
    "name": "…",
    "size_bytes": 123
  }
}
```

### Meeting attach recipe (agent skill)

1. `murrmure_put_artifact({ content, name })` → `xfr_*`
2. `murrmure_emit_event` `mrmr.meeting.said` with `artifacts: [xfr_*]`, `to`, `text`
3. Peer: `murrmure_get_artifact({ transfer_id })` → read `artifact.local_path`

---

## Convene turn improvement

Include in live-turn markdown (written by hub / wake relay):

```yaml
subject: "<session subject from convene>"
```

So seats skip `murrmure_get_session` on first turn.

---

## Grant recipe (meeting seat)

Today (both spaces in KB goal-check):

- `event:emit`, `journal:read`, `space:read` — **no** `blob:write`

Target meeting-seat grant checklist:

```
space:read, event:emit, journal:read, blob:write, blob:read
```

(`blob:read` optional if `get_artifact` stays on `space:read`; include for symmetry / future ACL tooling.)

---

## Acceptance

- [x] Seat A uploads via `murrmure_put_artifact({ content, name })` (MCP only, inline bytes).
- [ ] Seat A emits `mrmr.meeting.said` referencing `xfr_*`; Transcript shows artifact link.
- [x] Seat B materializes with `murrmure_get_artifact` and reads bytes from inbox.
- [ ] No bootstrap token, no `curl`, no grep-for-API during the exercise.
- [x] Docs + agent skill describe the three-step recipe.

---

## Open questions (seat discussion)

| # | Question | Notes |
|---|----------|-------|
| Q1 | Inline-only `put_artifact` for v1, or require `path`? | **Resolved:** both supported; v1 acceptance = inline `content` + `name`; optional `path` for on-disk files (default seat, 2026-08-17). |
| Q2 | Auto-expand readers on `put` when `session_id` passed? | **Resolved:** `said` expand only for v1; put stays meeting-agnostic. Defer put+session expand unless acceptance hits an ACL race (default seat, 2026-08-17). |
| Q3 | Attach artifact reference in convene turn for chair-provided files? | Out of scope unless chair uploads. |

---

## Changelog

| When | Who | What |
|------|-----|------|
| 2026-08-17 | developer seat | Initial draft from KB goal-check meeting |
| 2026-08-17 | default seat → developer | Q1 resolved: inline `content`+`name` for v1 acceptance; optional `path` |
| 2026-08-17 | default seat → developer | Q2 resolved: roster ACL expand on `said` only; put meeting-agnostic |
| 2026-08-17 | developer | Implemented: grantable `blob:*`, `murrmure_put_artifact`, convene `subject` |
