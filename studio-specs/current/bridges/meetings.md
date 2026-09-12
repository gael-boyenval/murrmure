# Meetings — HTTP / MCP wire

**Status:** normative — shipped (2026-08-17)  
**Spec:** [meetings/spec.md](../meetings/spec.md)  
**Binds:** [pitfalls.md](../../plans/2026-08-17-meetings/pitfalls.md) D1, D4, D5, D7, D13 · [persistence.md](../../plans/2026-08-17-meetings/persistence.md)

Adapters only. Domain lives in `hub-core/src/meetings/` + journal-first emit.

---

## 1. Commands

| HTTP | MCP | Scope | Notes |
|------|-----|-------|-------|
| `GET /v1/spaces/{id}/personas` | `murrmure_list_personas` | `space:read` | **Same-space token.** Ads only. |
| — | `murrmure_list_invitable_spaces` | `space:read` | Hub-mediated directory. Bootstrap / `hub:admin` see all active spaces; other callers see their bound space plus active same-actor/harness `space:read` grants. Ads only. No local paths, memory, or secrets. |
| `POST /v1/meetings` | `murrmure_start_meeting` | `flow:run` + convenor `space:read` on every invitee (hub-enforced) | New session or attach if `session_id` given. Hub reads invitee catalogs. |
| `GET /v1/sessions/{id}/transcript?since_seq=&participant_id=` | `murrmure_meeting_transcript` | roster space **or** `journal:read` on a roster space | Session-monotonic cursor. Pass this seat's `ptc_*` for `you` / `addressed_to_you`. Not `GET /v1/journal`. |
| `GET /v1/meetings` | — | `space:read` | Open + closed rooms. Bootstrap / `hub:admin` sees all; other tokens see rooms whose roster includes their space. |
| `POST /v1/sessions/{id}/meeting/close` | chair may `murrmure_emit_event` `closed` **or** this tool | chair / human chair | Same payload as `closed`. Shell uses this. |
| `POST /v1/sessions/{id}/meeting/resume` | — | chair / human chair | Same `ses_*` + `ptc_*`. Journals `mrmr.meeting.resumed`, re-wakes seats. Hub boot rehydrate of an already-open room does **not** use this route or journal `resumed`. |
| existing emit | `murrmure_emit_event` | `event:emit` | `said` / `closed`. **Requires `session_id`.** |
| `PUT /v1/artifacts` | `murrmure_put_artifact` | `blob:write` | Inline `content`+`name` or space-relative `path`. Meeting attach then `said` with `artifacts`. |

No `/v1/meetings/{id}` collection besides start. The id is `ses_*`.

CLI: [cli/spec.md](../cli/spec.md). Shell: [shell/spec.md](../shell/spec.md).

---

## 2. Emit

Shipped:

1. Journal-first `emitAndDeliver` ([architecture.md](../../plans/2026-08-17-meetings/architecture.md) R2).
2. Meeting types: top-level `session_id` on the envelope so attach cannot be dropped.
3. HTTP emit requires `event:emit` (parity with MCP).
4. Hub-only denylist: `mrmr.meeting.convened`, `delivered`, `delivery_failed`, `resumed`.
5. Platform `said` / `closed` emittable without `events.yaml`.
6. `from` hub-stamped; client `from` ignored.

`murrmure_emit_event` args for meeting types:

```json
{
  "event_type": "mrmr.meeting.said",
  "session_id": "ses_…",
  "payload": {
    "as_participant_id": "ptc_…",
    "to": { "participant_ids": ["ptc_…"] },
    "text": "…",
    "in_reply_to": "msg_…",
    "artifacts": ["xfr_…"]
  }
}
```

`to`: `{ participant_ids }` **xor** `{ all: true }`.

---

## 3. Convene body

```json
{
  "title": "API shape",
  "goal": "Pick an approach for the public list endpoint",
  "session_id": "ses_…",
  "participants": [
    { "space_id": "spc_app", "persona": "designer" },
    { "space_id": "spc_research", "persona": "researcher" }
  ],
  "chair": { "space_id": "spc_app", "persona": "designer" }
}
```

`chair: { "human": true }` allowed. Omit `session_id` → create `ses_*`. Flow path convenes on the run’s session and does **not** go through this POST (engine calls the same convene function).

---

## 4. Transcript

See [meetings/spec.md](../meetings/spec.md) §9 for the DTO. Wire rules:

- `since_seq` / `up_to_seq` = **meeting_seq** ([persistence.md](../../plans/2026-08-17-meetings/persistence.md) §4.2)
- Auth bypasses the journal **space filter**; roster check replaces it
- Closed meeting: still 200
- Do not teach `murrmure_journal_query` as the chat

---

## 5. Denial codes

Keep [meetings/spec.md](../meetings/spec.md) §15. Add:

| Code | When |
|------|------|
| `MEETING_HANDLER_COMPLETE_AUTO` | Apply: `said` handler `complete: auto` |
| `MEETING_STEP_VIEW_RESOLVER` | Apply: `view_resolver` on a `meeting:` step |

Reuse `INLINE_PAYLOAD_EXCEEDED`, `EXECUTOR_UNAVAILABLE`. **Not** `QUERY_POLICY_DENIED`.

HTTP: 4xx + `{ code, message }`. MCP: thrown error with the same `code`.

---

## 6. MCP catalog

Add to `PLATFORM_TOOLS` + `mcp-tool-schemas.ts` + `mcp-handlers.ts` + `apps/docs/reference/mcp-tools.md` + `catalog-schema.test.ts` `PLATFORM_TOOL_NAMES` **in the same PR**.

| Tool | required |
|------|----------|
| `murrmure_list_personas` | — (space from auth) |
| `murrmure_list_invitable_spaces` | — |
| `murrmure_start_meeting` | participants, chair |
| `murrmure_meeting_transcript` | `session_id` |
| `murrmure_put_artifact` | exactly one of `path` or `content`; `name` with `content` |
| `murrmure_emit_event` | existing + `session_id` when type is `mrmr.meeting.*` |

`docs-proof` does not exact-list tools today; **catalog-schema does**.

---

## 7. Do not add

- `GET /v1/spaces/{foreign}/personas` as the chair path
- Transcript as a `journal` query alias
- `query_ask` meeting types
- `/v1/chat` or `/v1/meetings/{id}/messages` CRUD
