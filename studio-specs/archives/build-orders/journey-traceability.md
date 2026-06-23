# Phase 2 — journey traceability matrix

Maps **40 input journeys** ([`inputs/studio/`](../../../inputs/studio/)) to phase 2 build work. Phase 1 journeys (J01 review, J03 scope, J05 gates, J07 token leak, J09 broad grant, J10 breaking promote, J12 SOC2) are **shipped** — listed here only where phase 2 extends them.

**Sources:** [`studio-v3-overview.md`](../../../inputs/studio/studio-v3-overview.md), [`company-01/journeys.md`](../../../inputs/studio/company-personas-and-uses-cases/company-01/journeys.md), [`company-02/journeys/`](../../../inputs/studio/company-personas-and-uses-cases/company-02/journeys/), [`hub-core-validation-2026-06-20.md`](../../studio/hub-core-validation-2026-06-20.md).

---

## Why phase 2 exists (comparative)

| Alternative | What users do today | Why it fails | Phase 2 answer |
|-------------|---------------------|--------------|------------------|
| **Slack + manual relay** | Liam DMs Dev "API ready" | Timezone delay, no structure, no audit | TR: `work.ready` / `spec.published` → mcp_wake |
| **Static MCP at build time** | Restart daemon after promote | Agents run stale tools mid-session | CR: live apply + `tools_changed` |
| **Megabyte events** | Paste OpenAPI in chat | Payload limits, no replay | Blobs + XS `query_ask` for scoped fetches |
| **Direct blob reads across spaces** | Agent reads knowledge space blobs | Blast radius, PCI/PII leak | XS: typed queries + forbidden_topics |
| **Paste `tok_*` in browser** | Admin shares bearer in Slack | Token leak, no session expiry | CL: BFF + httpOnly session |
| **Zapier / webhooks** | Ad-hoc automation | No grant model, duplicate fires, no dedup UI | TR: `trigger:register` + business-key dedup |

Studio is **not** replacing Cursor/Claude Code — it gives them a **protocol** for handoffs humans can trust. Phase 2 completes that protocol for dynamic capabilities, cross-space context, and hosted admin.

---

## E2E story (all phase 2 layers)

**Extends J20 (Smart Sprint)** and **J02 (backend→frontend)** with typed spec lifecycle:

1. Alex (admin) installs **feature-spec** in `backend-api` via configure or cloud BFF — **CR0** live apply, no restart
2. Liam's agent drafts spec sections → Maya approves publish → **`spec.published`** — **FS0/FS1**
3. Trigger **`spec-published-wake-dev`** mcp_wakes Dev's Cursor — **TR1** (replaces "did you see my Slack?")
4. Dev's agent **`query_ask`**s `spec_summary@1` from backend space — **XS0** (replaces emit+blob hack; aligns **c02-J14**)
5. Dev promotes feature-spec 1.1 → connected MCP gets **`tools_changed`** within 2s — **CR2**
6. Alex runs this from **cloud shell** on EC2 — **CL0/CL1** (J15 topology)

---

## Matrix by build file

### 01 — Capability runtime (CR0–CR2)

| Journey | Company | Scenario | Requirement |
|---------|---------|----------|-------------|
| **J04** | c01 | Agent follows stale contract after Notion update | `contract_updated` push on promote; handshake v2 full `server_tools[]` |
| **J10** | c01 | Breaking promote needs gate | Live apply respects evolution pipeline; rollback unmounts |
| **J11** | c01 | Production rollback in 2 min | Previous mount addressable; rollback → tools removed |
| **J13** | c01 | Agent missed rebind (IDE closed) | Outbox replay on reconnect; `last_ack_seq` |
| **J16** | c01 | Agent install to `ui-prod` by typo | `INSTALL_POLICY_VIOLATION` before mount |
| **J09** | c02 | Over-scoped token sees all MCP tools | Grant-filtered catalog; `TOOL_NOT_AUTHORIZED` hint |
| **J17** | c02 | Quarterly review finds scope drift | Catalog reflects live ACL; observability on denied invoke |

**Fixtures:** `promote-tool-refresh`, `grant-scoped-tool-list`, `install-policy-violation`, `reconnect-outbox-replay`, `rollback-live-mount`

---

### 02 — Feature-spec (FS0–FS2)

| Journey | Company | Scenario | Requirement |
|---------|---------|----------|-------------|
| **J02** | c01 | OpenAPI handoff via blob + trigger | `spec.published` **complements** `work.ready` — typed doc lifecycle |
| **J20** | c01 | Smart Sprint backend → frontend | Publish spec → trigger wake (step 1 of sprint) |
| **J04** | c01 | Contract out of sync | Live contract read; version in published payload |
| **J10** | c01 | Breaking capability change | feature-spec promote through same evolution gates |
| **c02-J14** | c02 | Agent needs docs from knowledge space | Inbound `spec_summary@1` — summary only, never `body_ref` |
| **c02-J18** | c02 | Cross-client knowledge leak | Query response excludes client-identifying fields |

**Fixtures:** `happy-path-publish`, `publish-direct-denied`, `revise-republish-v2`, `spec-summary-query`, `feature-spec-v1` contract

**Not in scope:** J14 `review-loop-lite` (phase 2.1)

---

### 03 — Triggers (TR0–TR1)

| Journey | Company | Scenario | Requirement |
|---------|---------|----------|-------------|
| **J02** | c01 | Liam emits `work.ready`, Dev wakes at 11:43pm | Template `work-ready-wake-frontend`; blob ref in payload_map |
| **J06** | c01 | Duplicate trigger → two PRs | Dedup on business key (`spec_key`, `diff_blob_id`); delivery log shows drop reason |
| **J04** | c01 | Contract change mid-version | Event catalog rebuild on `capability.live_applied` |
| **Hub ADR-14** | — | Trigger delivery/handler fails | `integration_failure` event + delivery log (not c01-J07 token leak) |
| **J15** | c01 | Laptop asleep, trigger lost | mcp_wake pending queue; relay path (hub S3) |
| **J20** | c01 | Smart Sprint 3 trigger fires in audit | `spec-published-wake-dev` in event log |

**Fixtures:** `spec-published-wake-dev`, `dedup-spec-publish`, `spec-published-dedup-key`, config `trigger-backend-frontend`

**Product feedback baked in (J06):** delivery log must show fingerprint + dedup reason — not just "delivered"

---

### 04 — Cross-space (XS0–XS1)

| Journey | Company | Scenario | Requirement |
|---------|---------|----------|-------------|
| **J02** | c01 | Frontend fetches OpenAPI diff | Replace emit workaround with `query_ask` + blob ref in answer |
| **c02-J14** | c02 | Claude tries blob read → 403 → context_fetch | Platform `query_ask` / capability answers `spec_summary@1`, `context_fetch@1` |
| **c02-J12** | c02 | Finance refuses salary to comms agent | `forbidden_topics` → `query_failed`; minimum disclosure |
| **c02-J09** | c02 | Personal ↔ company machine isolation | `query_policy.inbound_allowlist`; no cross-hub unless explicit |
| **c02-J13** | c02 | Relay down during cross-space query | `TARGET_SPACE_UNREACHABLE`; local spaces keep working |
| **c02-J17** | c02 | Quarterly query type audit | Configure UI for inbound/outbound query types |
| **c02-J18** | c02 | Knowledge surfaces pattern without client name | Response projection + `_attribution` without client id |

**Fixtures:** `same-hub-ask-answer`, `query-failed-timeout`, `query-policy-denied`

**Hub validation ADR-15:** platform 30s timeout → synthetic `query_failed(ANSWER_TIMEOUT)` — not agent-only timeout

---

### 05 — Cloud shell (CL0–CL1)

| Journey | Company | Scenario | Requirement |
|---------|---------|----------|-------------|
| **J15** | c01 | Move hub to EC2; Dev laptop can sleep | BFF + always-on hub; relay status on configure |
| **c02-J11** | c02 | New client onboarding in 2 hours | Browser-only admin: spaces, grants, capability install |
| **c01-J07** | c01 | Token in public repo (cloud) | Session cookie ≠ MCP bearer — see cloud matrix |
| **J09** | c01 | Sarah audits grants | Configure parity via BFF; audit export in browser |
| **J12** | c01 | SOC2 auditor export | Event log download without curl |

**Fixtures:** `cloud-admin-first-space`

**Comparative:** local shell `/connect` paste is fine for solo dev; cloud gap is **team admin without token handoff** (Alex, Théo architect mode).

---

## Coverage gaps (phase 2.1 — not in this build)

| Journey | Need | Defer reason |
|---------|------|--------------|
| J14 | review-loop-lite fast-track | Separate capability variant |
| J05 | Gate delegation UI | Runtime workaround exists |
| J19 | Filterable gate queue | Shell UX, not phase 2 spine |
| c02-J19 | Comms scheduling agent | Domain capability, not platform |
| Cron triggers | c02-J01 | Explicit non-goal |

---

## Acceptance rule

A phase 2 layer is **done** when:

1. All fixtures in [acceptance.md](./acceptance.md) for that layer are green
2. Every **Primary** journey row above has a manual or e2e walkthrough documented
3. E2E story (top of this file) runs end-to-end once
4. [phase2-full-chain.json](../fixtures/e2e/phase2-full-chain.json) green

---

## 40-journey ledger

| ID | Status | Phase 2 layer / note |
|----|--------|----------------------|
| c01-J01 | shipped | review-loop (phase 1) |
| c01-J02 | phase2-primary | TR, XS, FS complement |
| c01-J03 | shipped | scope enforcement (phase 1) |
| c01-J04 | phase2-secondary | CR contract_updated |
| c01-J05 | deferred | gate delegation UI |
| c01-J06 | phase2-primary | TR dedup |
| c01-J07 | shipped + cloud | token leak; CL session auth |
| c01-J08 | deferred | preview URL in session (phase 2.1) |
| c01-J09 | shipped + CR | grants; grant-scoped catalog |
| c01-J10 | phase2-secondary | CR evolution + FS promote |
| c01-J11 | phase2-primary | CR rollback fixture |
| c01-J12 | shipped + CL | audit export |
| c01-J13 | phase2-primary | CR reconnect replay |
| c01-J14 | deferred | review-loop-lite |
| c01-J15 | phase2-primary | CL + hub relay |
| c01-J16 | phase2-primary | CR install policy |
| c01-J17 | shipped | concurrency (phase 1 hub) |
| c01-J18 | out-of-scope | security anomaly ML |
| c01-J19 | deferred | gate queue filters |
| c01-J20 | phase2-primary | E2E chain |
| c02-J01 | out-of-scope | cron triggers |
| c02-J02 | deferred | briefing holes (domain) |
| c02-J03 | deferred | client portal capability |
| c02-J04 | deferred | client portal deploy |
| c02-J05 | deferred | research agent |
| c02-J06 | deferred | finance query (domain) |
| c02-J07 | deferred | GHA silent fail (domain) |
| c02-J08 | deferred | sensitive Q&A (domain) |
| c02-J09 | phase2-primary | XS isolation policy |
| c02-J10 | deferred | decommission (ops) |
| c02-J11 | phase2-primary | CL onboarding |
| c02-J12 | phase2-primary | XS forbidden_topics |
| c02-J13 | phase2-primary | XS relay unreachable |
| c02-J14 | phase2-primary | XS context_fetch / spec_summary |
| c02-J15 | deferred | weekly review UI |
| c02-J16 | deferred | P0 hotfix (domain) |
| c02-J17 | phase2-secondary | CR denied invoke audit; XS policy UI |
| c02-J18 | phase2-secondary | FS/XS redaction |
| c02-J19 | deferred | comms scheduling |
| c02-J20 | reference | composite — covered by c01-J20 E2E |
