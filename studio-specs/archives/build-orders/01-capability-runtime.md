# CR0–CR2 — Capability runtime

**Normative:** [../capability-runtime/spec.md](../capability-runtime/spec.md) · **Journeys:** [traceability § CR](./journey-traceability.md#01--capability-runtime-cr0cr2)

---

## Why

Today promote requires **daemon restart**. MCP tools are **static at build time**. That breaks:

- **J04** — Alex updates contract; agents keep old tool schema until someone restarts
- **J10/J11** — Maya approves breaking promote; connected agents don't see new states until restart
- **J16** — Dev typos `ui-prod`; we need reject **before** mount, not after partial apply
- **J09/J17** — Sarah finds Liam's token has `space:admin`; MCP still exposes tools his grant shouldn't see

**Versus alternatives:** LangGraph/CrewAI leave tool auth to you. Cursor exposes whatever the server registers. Studio must **rebuild catalog on grant + live mount** and **push rebind** without restart.

---

## Who

| Persona | Role in this layer |
|---------|-------------------|
| Alex / Théo | Promotes capability; expects agents to pick up without ops ticket |
| Dev (builder) | Installs to sandbox; promotes after J10 gate |
| Sarah | Audits that prod install policy blocks agents (J16) |
| Agent operator | IDE reconnects after sleep; must replay missed `tools_changed` (J13) |

---

## User story — promote without restart (J10 + J13)

1. Dev installs feature-spec **1.0.0** to `ui-sandbox`, validates, tests
2. Maya approves breaking promote to `ui-production`
3. Admin hits **Apply live** — routes mount, MCP catalog rebuilds
4. Dev's Cursor (connected, laptop was closed during promote) handshakes with `last_ack_seq`
5. Client receives replayed `tools_changed` + full `server_tools[]` — picks up `add_context_ref` from 1.1.0
6. Dev invokes new tool without restarting daemon or IDE

**Failure story (J16):** Dev's agent calls apply on `ui-prod` (`human_only`) → `403 INSTALL_POLICY_VIOLATION` with hint — not raw JSON.

---

## Requirements (from journeys + hub validation)

| ID | Requirement | Source |
|----|-------------|--------|
| CR-R1 | Live apply mounts routes without process restart | J10 |
| CR-R2 | `human_only` space rejects non-human actor at apply | J16 |
| CR-R3 | Agent without `capability:install` → `403 SCOPE_ENFORCEMENT_FAILURE` | J16 |
| CR-R4 | `tools/list` and `/v1/mcp/catalog` identical grant filter | J09 |
| CR-R5 | Unauthorized invoke → `TOOL_NOT_AUTHORIZED` + hint | J09 |
| CR-R6 | Outbox keyed by `{ space_id, token_id, client_id }`, monotonic `seq` | J13 |
| CR-R7 | Handshake v2: mandatory `control.handshake_ack` + full tool list | J13 |
| CR-R8 | `tools_changed` within 2s of live apply | J04 |
| CR-R9 | Rollback unmounts; removed tools not invokable | J11 |
| CR-R10 | `mcp_wake` by `wake_label` — no catalog lookup | TR prerequisite |

---

## CR0 — Mount registry + live apply

**Add to `studio-hub-daemon`:**

- `MountRegistry` — `packages/studio-hub-daemon/src/mount-registry.ts`
- `POST /v1/spaces/{id}/capabilities/{install_id}/apply` → `evolution.live.apply`
- `GET /v1/spaces/{id}/capabilities/live`
- On apply: policy check → upsert mount → `app.route(prefix, handler)` → journal `capability.live_applied`
- Rollback/supersede → unmount + route 404

**DoD:**

- [ ] Apply live without restart (CR-R1)
- [ ] `install-policy-violation.json` (CR-R2, CR-R3)
- [ ] `rollback-live-mount.json` (CR-R9, c01-J11)
- [ ] `promote-tool-refresh.json` HTTP apply steps (CR-R1)

---

## CR1 — Grant-filtered MCP catalog

- `McpToolRegistry.rebuild(space_id)` on apply/unmount
- Honor `mcp_tools_by_version` in manifest (J11 minor bump strips unknown fields)
- Pre-invoke: tool ∈ catalog; Zod per capability

**DoD:**

- [ ] `grant-scoped-tool-list.json` (CR-R4, CR-R5)
- [ ] ACL excludes package tools for narrow grant

---

## CR2 — Control bus + handshake v2 + mcp_wake

- Outbox TTL 24h; push `tools_changed` / `contract_updated`
- `McpWakeDispatcher`: route by `wake_label`
- Pending wake queue per space when no session

**DoD:**

- [ ] `promote-tool-refresh.json` — tools_changed within 2s (CR-R8)
- [ ] `reconnect-outbox-replay.json` (CR-R6, CR-R7)
- [ ] mcp_wake without catalog tool for wake_label (CR-R10)
- [ ] Rollback → removed tools not invokable (CR-R9) — `rollback-live-mount.json`

**Commit order:** CR0 → CR1 → CR2
