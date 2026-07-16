# Doc, skill & MCP update tracker (every phase)

**Status:** living checklist — update when a phase completes  
**Normative MCP catalog:** rev-1 §10.9  
**Agent skill package:** `packages/cli/skill/` (`@murrmure/skill`)

> **Rule:** Each phase updates docs/skills **in the same PR** as its code. Phase 16 promotes and reconciles — it does not introduce first-time v2 agent guidance.

---

## Cross-cutting artifacts

| Artifact | Role | Owner phases |
|----------|------|--------------|
| `packages/cli/skill/SKILL.md` | Cursor agent index | 02, 05, 06, 08, 10, 13, 16 |
| `packages/cli/skill/reference/*.md` | Deep dives (one level) | per table below |
| `apps/docs/guide/agents-mcp.md` | Human MCP setup | 02, 05, 06, 07, 10 |
| `apps/docs/guide/agent-skill.md` | Human skill install | 02, 08, 16 |
| `apps/docs/reference/mcp-tools.md` | MCP tool reference | 05, 07, 10, 12 |
| `studio-specs/current/cli/spec.md` | CLI commands | 02, 05, 06, 08, 12, 13 |
| `studio-specs/current/build-capability/07-mcp-tool-model*.md` | MCP model spec | 05, 10 |

---

## Per-phase updates

### Phase 01 — Foundation

- [x] `studio-contracts/README.md` — entity inventory
- [x] Architecture §2.3 + §3 cross-links to schema files

### Phase 02 — Space index & CLI

- [x] **CLI:** `mrmr grant mint`, `mrmr grant list`, `mrmr grant revoke` in [cli/spec.md](../../../current/cli/spec.md)
- [x] **Docs:** [agents-mcp.md](../../../../apps/docs/guide/agents-mcp.md) — grant mint via CLI (replaces Configure UI)
- [x] **Skill:** `reference/space-directory.md` *(new)* — `murrmure/` layout, init/link/apply
- [x] **Skill:** `reference/grants.md` *(new)* — capability model §9.1, mint examples
- [x] **MCP:** `murrmure_grant_mint`, `murrmure_space_status`, `murrmure_apply_space` stubs in catalog (implement handlers minimal OK)

### Phase 03 — Executor & invoke

- [x] **MCP:** `murrmure_invoke_action` → action invoke route (see §10.9)
- [x] v1 shim: `mcp_wake` routes to invoke

### Phase 04 — Artifacts

- [x] **Docs:** [cross-space/spec.md](../../../current/cross-space/spec.md), `bridges/artifacts.md`
- [x] User-facing: `.mrmr.temp` in CLI space template

### Phase 05 — Session & Run

- [x] **MCP:** platform tools §10.9 batch 1: `murrmure_create_session`, `murrmure_list_sessions`, `murrmure_get_session`, `murrmure_create_run`, `murrmure_get_run`, `murrmure_cancel_run`
- [x] **Docs:** [mcp-tools.md](../../../../apps/docs/reference/mcp-tools.md) — v2 session/run tools; deprecate `instance_id` wording
- [x] **Skill:** replace Instance → Run in SKILL.md platform model section
- [x] **Skill:** `reference/mcp.md` — v2 tool table + scope mapping
- [x] **Bridge:** `studio-specs/current/bridges/grants-migration.md` — v1 scope → v2 capability map

### Phase 06 — Shell foundation

- [x] **Docs:** [agents-mcp.md](../../../../apps/docs/guide/agents-mcp.md) — `/spaces/new` + `/connect` replace `/setup` Configure path
- [x] **Shell spec:** [shell/spec.md](../../../current/shell/spec.md) — observer mode, CLI instruction pages, SSE auth
- [x] **Skill:** Configure UI retired; grants via `mrmr grant mint`

### Phase 07 — Notifications, gates, logs

- [x] **MCP:** batch 2: `murrmure_wait_for_gate`, `murrmure_resolve_gate`, `murrmure_wait_for_run`, `murrmure_journal_query`
- [x] **Docs:** mcp-tools.md gate/wait tools; shell notifications/gates in shell spec
- [x] **Skill:** `reference/mcp.md` — wait/resolve patterns for agents operating flows

### Phase 08 — Flow engine

- [x] **Skill:** **rewrite flow change checklist** — space directory + `mrmr space apply` replaces FDK push/promote/apply as primary path
- [x] **Skill:** `reference/flow-authoring.md` — `murrmure/flows/`, start conditions, no per-space install UX
- [x] **Docs:** [agent-skill.md](../../../../apps/docs/guide/agent-skill.md) — v2 authoring model
- [x] **CLI spec:** `mrmr flow run`, index refresh via apply

### Phase 09 — Flowchart, matrix, hooks

- [x] **Docs:** [triggers/spec.md](../../../current/triggers/spec.md) hook normalization; shell spec flowchart sections
- [x] **MCP:** none new (uses batch 1/2)

### Phase 10 — MCP attach

- [x] **MCP:** `murrmure_attach_orchestration`, `murrmure_get_run_graph`
- [x] **Skill:** when to file-push (`space apply`) vs MCP attach (ephemeral orchestration)
- [x] **Docs:** §13.2 Cursor scenario in guide

### Phase 11 — Custom views

- [x] **Skill:** `reference/views.md` *(new)* — view-sdk, `requires_view`, form fallback
- [x] **Docs:** view rule — not a hub entity (shell spec + view-sdk README)

### Phase 12 — Queue poll

- [x] **MCP:** none required (HTTP poll API for workers)
- [x] **Skill:** `reference/workers.md` *(new)* — external poll worker deployment
- [x] **Docs:** executor poll API in bridges

### Phase 13 — Federation

- [ ] **Skill:** cross-space invoke, virtual space bindings, federated run visibility limits
- [ ] **Docs:** cross-space spec promotion

### Phase 14 — Flow-call composition

- [ ] **Docs:** flow authoring guide (flow-call vs duplicate steps); example orchestrator flow
- [ ] Promote §5.5 to normative in phase 16 spec promotion

### Phase 15 — Out-of-shell notifications

- [ ] **Docs:** [desktop/spec.md](../../../current/desktop/spec.md) native notification bridge; SMTP ops note

### Phase 16 — Promotion

- [x] Promote rev-1 → `current/product/spec.md`
- [x] Remove v1 shim docs (`transition`, `wait_for_state`, `instance_id`, Configure)
- [x] `mrmr skill update` ships final SKILL.md
- [x] CHANGELOG Murrmure v2

---

## v1 → v2 MCP mapping (shim period)

| v1 tool | v2 replacement | Removed |
|---------|----------------|---------|
| `get_space_state` | `murrmure_get_space_state` | phase 16 |
| `transition` | `murrmure_invoke_action` + run lifecycle | phase 16 |
| `wait_for_state` | `murrmure_wait_for_run` / `murrmure_wait_for_gate` | phase 16 |
| `emit_event` | journal via invoke/hook (or `murrmure_invoke_action`) | phase 16 |
| `contract_versions` | `murrmure_space_status` (indexed digests) | phase 16 |

Both catalogs exposed during phases 05–15; v1 tools log deprecation warning.

---

*End of tracker.*
