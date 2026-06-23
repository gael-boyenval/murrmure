# FS0–FS2 — Feature-spec capability

**Normative:** [../capabilities/feature-spec.md](../capabilities/feature-spec.md) · **Journeys:** [traceability § FS](./journey-traceability.md#02--feature-spec-fs0fs2)

**Prerequisite:** CR1 (dynamic MCP catalog)

---

## Why

**J02** today: Liam emits generic `work.ready` + OpenAPI blob. Works for API handoffs, but:

- No typed document lifecycle (draft → review → published)
- No human gate on "what the frontend should build"
- Triggers can't filter on structured `spec_key` / version

**J20 (Smart Sprint):** backend work produces a **spec artifact** humans approve before frontend wakes. `spec.published` is the typed event; `work.ready` remains for ad-hoc API diffs — **both coexist**.

**c02-J14:** Dev agent must not blob-read knowledge space. feature-spec **answers** `spec_summary@1` — summary only, never full body or `body_ref`.

**Versus review-loop:** review = preview + comment rounds on a build. feature-spec = structured sections + publish event. Different capability, same mount/runtime.

---

## Who

| Persona | Role |
|---------|------|
| Liam | Agent drafts sections via MCP |
| Maya | Approves publish (or `skip_review` path for trusted flows) |
| Dev | Trigger consumer; queries spec summary from frontend space |
| Théo | Enforces query policy so spec body doesn't cross spaces |

---

## User story — publish wakes frontend (J20 step 1)

1. Admin installs feature-spec in `backend-api` (configure or cloud) — **CR live apply**
2. Liam's Claude Code: `open_spec` → `patch_spec_section` × N → `submit_for_review`
3. Maya opens shell canvas `/spaces/backend-api/specs/{specKey}` — reads sections, clicks **Approve publish**
4. Hub emits **`spec.published`** with `body_ref`, `published_by`, `version`, `summary`
5. Trigger (TR1) mcp_wakes Dev's agent — no Slack
6. Dev's agent `query_ask`s `spec_summary@1` — gets title, version, summary — **not** full blob (c02-J14)

**Governance story:** `skip_review: false` → agent cannot `publish_direct`; only Maya's role can `approve_spec`.

---

## Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| FS-R1 | FSM: gathering_context → draft → in_review → published → archived | J20 |
| FS-R2 | `spec.published` always includes `body_ref` + server-set `published_by` | J12 audit |
| FS-R3 | `publish_direct` only when `skip_review: true` + role gate | J10 pattern |
| FS-R4 | `revise_spec` increments version; republish fires new event | J06 dedup input |
| FS-R5 | MCP tools 1.0.0 vs 1.1.0 per manifest semver | CR1 |
| FS-R6 | Inbound `spec_summary@1` — no `body_ref` in answer | c02-J14 |
| FS-R7 | Install via configure catalog + live apply | first-week checklist |

---

## FS0 — Backend + MCP + contract

**Packages:**

```
packages/feature-spec-contracts/   ← fixtures/feature-spec/contracts/feature-spec-v1.json
packages/feature-spec-core/
```

**DoD:**

- [ ] `happy-path-publish.json` (FS-R1, FS-R2)
- [ ] `publish-direct-denied.json` (FS-R3)
- [ ] `revise-republish-v2.json` (FS-R4)
- [ ] `spec-summary-query.json` (FS-R6)
- [ ] `request_changes` path: in_review → draft → republish
- [ ] `query-policy-denied.json` (allowlist denial)

---

## FS1 — UI canvas

**Package:** `@studio/feature-spec-ui`

- Route: `/spaces/:spaceId/specs/:specKey`
- Sections editor, publish (role-gated), revise (admin)
- Playwright: skip_review + review path

**DoD:**

- [ ] Human publish flow — Maya path from user story
- [ ] Read-only sections after publish

---

## FS2 — Catalog + config install

- Add to `packages/config-catalog/bundled.json`
- Install schema: `skip_review`, `required_approver_role`, `default_target_repo`

**DoD:**

- [ ] Install from configure UI (FS-R7)
- [ ] Live apply exposes MCP tools without restart

**Commit order:** FS0 → FS1 → FS2
