# Meetings — space catalog surface

**Status:** draft (hardening 2026-08-17)  
**Protocol:** [spec.md](./spec.md) §6 · [pitfalls.md](./pitfalls.md) D7, D11  
**Shipped:** [bridges/handlers.md](../../current/bridges/handlers.md)

Spaces own ads (`personas.yaml`) and how seats wake (`handlers.yaml`). Hub indexes; it does not interpret ads or store Agent entities.

---

## 1. `personas.yaml`

**Path:** `.mrmr/space/personas.yaml`  
**Optional.** Apply must not require the file. Indexed on `mrmr space apply`.

```yaml
version: 1
personas:
  - id: researcher
    summary: Technical research and prior art
    asks:
      - literature / papers on a topic
    requests:
      - attach a written brief
```

| Field | Rule |
|-------|------|
| `id` | `^[a-z][a-z0-9_-]{0,63}$`, unique in the space |
| `summary` | Required short text |
| `asks` / `requests` | Optional string lists. **Ads.** Not query types, not dispatch keys |

**Out of this file:** prompts, skills, model, harness (`agent.md`, `agents/{id}/`, handler `prompt`).

`designer` is not global. Two spaces may both declare it. Address is `ptc_*` in a meeting.

Default seat: invite a space with no persona → one participant, `persona` omitted.

---

## 2. Index and list

Same apply pipeline as events/handlers ([persistence.md](./persistence.md) §2).

| API | Who |
|-----|-----|
| `GET /v1/spaces/{id}/personas` | Token bound to **that** space (`space:read`) |
| Convenor listing invitees | **Hub-mediated** inside `POST /v1/meetings` / flow convene — hub reads other spaces’ indexes. Chair does **not** `GET` a foreign space. |
| `murrmure_list_personas` | Same-space catalog. Optional `space_id` only if the token may read it. |

Response: ads only (`id`, `summary`, `asks`, `requests`). No prompts, no handler ids.

---

## 3. Handlers (wake)

```yaml
# .mrmr/space/handlers.yaml
- id: meeting-designer
  on:
    event:
      type: mrmr.meeting.said
      participant: designer
  type: mcp_session
  complete: explicit
  prompt: |
    You are the designer seat in this meeting.
    Pull the transcript if you need prior turns. Do not dump the journal.
```

| Rule | Code |
|------|------|
| `on.event.participant` matches the seat’s persona (or the default seat when omitted **and** the space has no personas) | `PERSONA_HANDLER_UNSCOPED` if personas exist and `participant` is missing on a `mrmr.meeting.said` handler |
| Prefer `mcp_session` | `shell_spawn` per `said` is the wrong executor (new empty harness) |
| `complete: explicit` | `complete: auto` → `MEETING_HANDLER_COMPLETE_AUTO` |
| Platform types `mrmr.meeting.said` / `closed` | Emittable by roster members **without** `events.yaml`. Still need `event:emit`. |
| `contract_keys` | Empty on event handlers (prompt scope only; not dispatch) |

`matchEventHandlers` today is type + source. Must gain `participant` for meeting `said`. Non-meeting events unchanged.

One unscoped handler in a persona space would wake **every** voice — apply must reject before that ships.

---

## 4. Capabilities ≠ handlers

| Catalog | Handler |
|---------|---------|
| What others are told the seat is for | How the seat wakes |
| Hub never dispatches on `asks` / `requests` | Hub matches `type` + `participant` + `to` |

If the catalog says “attach a brief” and they never do, the hub does not care.

---

## 5. Apply / CLI

| File | Change |
|------|--------|
| `packages/contracts` | `PersonasFileSchema`; `HandlerEventFilterSchema.participant`; `SpaceApplyBundle.personas`; `SpaceIndexSnapshot.personas` |
| `packages/cli/src/lib/space-directory.ts` | Read `personas.yaml` if present |
| `packages/hub-core/src/index/parse-personas.ts` | New |
| `apply-index.ts` / `validate-handler-bindings.ts` | Unscoped + `complete: auto` |
| Scaffold / `space init` | Optional comment-only file, or omit |

`events.yaml` is **not** required for meeting types. On ship, fix `current/bridges/triggers.md` if it still says declarations gate emit ([pitfalls.md](./pitfalls.md) D16).

---

## 6. Acceptance (this surface)

- `GET …/personas` returns ads only.
- Apply with personas + unscoped `said` handler → `PERSONA_HANDLER_UNSCOPED`, no partial index.
- Apply without `personas.yaml` still works.
- `query_ask` unchanged.
