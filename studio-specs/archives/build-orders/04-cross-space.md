# XS0–XS1 — Cross-space queries

**Normative:** [../cross-space/spec.md](../cross-space/spec.md) · **Journeys:** [traceability § XS](./journey-traceability.md#04--cross-space-xs0xs1)

**Prerequisite:** Hub S3 (shipped). FS0 for `spec_summary@1` handler.

---

## Why

**J02 workaround:** Frontend agent uses `blob_read` after wake. Works for OpenAPI diffs, but:

- Requires broad blob grant or cross-space blob read (forbidden in c02-J14)
- No topic allowlist — agent could ask for billing, contracts, other clients

**c02-J14 (canonical):** Claude Code tries `blob_read` on `client-c-knowledge` → **403**. Falls back to structured **`query_ask`** with `context_fetch` / `spec_summary@1`. Knowledge space returns **scoped sections**, blocks forbidden topics.

**c02-J09:** Personal machine agents must not read company client spaces except explicit query paths.

**Versus emit+trigger alone:** Async events wake workers; **queries** fetch scoped answers synchronously with platform timeout (ADR-15) — agent doesn't parse megabyte blobs from chat.

---

## Who

| Persona | Role |
|---------|------|
| Théo | Writes `query_policy` per space; quarterly audit (J17) |
| Dev / Liam | Agents `query_ask` across spaces within grant |
| Knowledge capability | Answers inbound query types |
| Sarah | Verifies forbidden_topics block PII (J12 pattern) |

---

## User story — context without exfiltration (c02-J14)

1. Claude in `client-c-code` needs device registry docs in `client-c-knowledge`
2. Direct `blob_read` → `403` — token scoped to code space only
3. Agent calls **`query_ask`**: `target_space_id`, `query_type: context_fetch`, params `{ topic, max_sections }`
4. Policy checks: source on inbound_allowlist; topic not in `forbidden_topics`
5. Knowledge agent returns 3 sections — no billing, no contract, no other-client names (J18)
6. Théo sees in Observability: blob 403, then ask success — expected fallback

**Timeout story:** No answer in 30s → platform emits `query_failed(ANSWER_TIMEOUT)` — not hung agent (J02 silent failure class).

---

## Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| XS-R1 | Scopes `query:ask`, `query:answer` in grants + MCP | c02-J14 |
| XS-R2 | `target_space_id` only on ask — not generic emit | J09 |
| XS-R3 | Platform 30s timeout → `query_failed` | ADR-15 |
| XS-R4 | Answer includes `_attribution`; projection strips forbidden fields | J18 |
| XS-R5 | Configure UI: inbound/outbound query types | J17 |
| XS-R6 | Federation passthrough ask/answer via relay | J13, J15 |
| XS-R7 | Relay down → `TARGET_SPACE_UNREACHABLE` | c02-J13 |

---

## XS0 — Same-hub HTTP + MCP

**Routes** `studio-hub-daemon/src/routes/cross-space/`:

| Method | Path |
|--------|------|
| POST | `/v1/spaces/{id}/queries/ask` |
| POST | `/v1/spaces/{id}/queries/{qid}/answer` |
| GET | `/v1/spaces/{id}/queries/{qid}` |

**MCP:** `query_ask`, `query_answer`

**DoD:**

- [ ] `same-hub-ask-answer.json` — replace J02 emit workaround in e2e (XS-R1)
- [ ] `query-failed-timeout.json` (XS-R3)
- [ ] `query-policy-denied.json` (XS-R1 policy)
- [ ] Audit trail includes query_id + attribution

---

## XS1 — Policy UI + federation

**Configure** space settings: `query_policy.inbound_allowlist`, outbound editor, forbidden_topics

**DoD:**

- [ ] query_policy editable (XS-R5)
- [ ] Relay down → `TARGET_SPACE_UNREACHABLE` (XS-R7)
- [ ] Cross-hub ask minimal test — Théo topology (XS-R6)

**Commit order:** XS0 → XS1
