# TR0–TR1 — Triggers

**Normative:** [../triggers/spec.md](../triggers/spec.md) · **Journeys:** [traceability § TR](./journey-traceability.md#03--triggers-tr0tr1)

**Prerequisite:** FS0 (`spec.published`), CR1 (event catalog rebuild), CR2 (`mcp_wake`)

---

## Why

**J02:** Liam finishes `/recommendations` at 11:43pm. Dev is asleep. Without triggers, Liam Slacks Dev; Dev sees it at standup. **Studio promise:** async plane wakes the right agent with structured payload.

**J06:** Network hiccup delivers event twice → two PRs. Triggers are **at-least-once**; handlers need business-key dedup + visible delivery log.

**J06:** Duplicate delivery → two PRs. Dedup reason `duplicate_business_key` in delivery log.

**Hub ADR-14:** Wake/handler failure must emit `integration_failure` — not silent. (Do not confuse with c01-J07 token leak — that is cloud auth.)

**Versus Zapier:** Studio triggers require `trigger:register`, allow-listed actions, grant-scoped wake targets. No arbitrary shell from a UI button.

---

## Who

| Persona | Role |
|---------|------|
| Alex | Registers triggers in configure; holds `trigger:register` |
| Liam | Emits `work.ready` / completes publish |
| Dev | Agent woken via mcp_wake; checks delivery log when "why two PRs?" |
| Sarah | Reviews trigger delivery log in audit (J06 post-mortem) |

---

## User story — backend ready (J02)

1. Alex registers template **`work-ready-wake-frontend`**: filter `work.ready` in `backend-api`, payload.type `api_change`
2. Action: mcp_wake `wake_label: handle_work_ready` in `ui-sandbox`, payload_map includes `openapi_diff_ref`
3. Liam emits `work.ready` with blob ref (not 47KB inline — J02 step 5)
4. Trigger fires → Dev's Cursor wakes → `blob_read` → codegen → PR
5. Dev checks Observability next morning — delivery at 11:43pm, no Slack

**Dedup story (J06):** Same `openapi_diff_ref` re-delivered → second wake dropped; log shows `duplicate_business_key`.

**Spec workflow (phase 2 E2E):** Template **`spec-published-wake-dev`** — filter `spec.published`, dedup on `spec_key` + `version`.

---

## Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| TR-R1 | Event catalog rebuilds on `capability.live_applied` | J04 |
| TR-R2 | Template API: `from-template` → hub `trigger.register` | first-week checklist |
| TR-R3 | `spec-published-wake-dev` with payload_map + dedup | E2E story |
| TR-R4 | `work-ready-wake-frontend` J02 parity | J02 |
| TR-R5 | Delivery log: fingerprint, dedup reason, failure | J06 |
| TR-R6 | Wake failure → `integration_failure` event | Hub ADR-14 |
| TR-R7 | `test-fire` for admin validation | c02-J11 onboarding |

---

## TR0 — Event catalog + templates API

| Method | Path |
|--------|------|
| GET | `/v1/spaces/{id}/triggers/event-catalog` |
| GET | `/v1/spaces/{id}/triggers/templates` |
| POST | `/v1/spaces/{id}/triggers/from-template` |
| POST | `/v1/spaces/{id}/triggers/{id}/test-fire` |

**Package:** `packages/triggers-templates/`

**DoD:**

- [ ] Catalog lists `spec.published` after feature-spec live (TR-R1)
- [ ] Both templates registered (TR-R3, TR-R4)

---

## TR1 — UI + E2E

**Extend shell** `configure/triggers/`:

- `TriggerTemplatePicker`, `EventCatalogSelect`, `TriggerTestFireButton`
- Delivery log deep link

**mcp_wake:** `applyJsonPathMap` → `mcpWake({ wake_label, payload, session_hint: "wake" })`

**DoD:**

- [ ] `spec-published-wake-dev.json` (TR-R3)
- [ ] `dedup-spec-publish.json` (TR-R4 dedup)
- [ ] Wake failure → integration_failure (TR-R6)

**Commit order:** TR0 → TR1
