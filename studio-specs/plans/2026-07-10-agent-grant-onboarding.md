# Plan — Participant connection onboarding (research + simplify)

**Date:** 2026-07-10  
**Status:** Planned — **Phase 0 (research) not started**  
**Goal:** Make “connect an agent or tool” understandable, low-friction, and harness-agnostic without defining agents as Murrmure entities. Users should not need to learn grant theory, invent labels, hand-pick capability strings, or manually translate setup into each integration context's MCP/skills/install conventions. Define a **default connection profile**, one neutral connection descriptor, and adapter-driven setup for any supported context.

**Trigger:** Tutorial 1 v3 + [agents-mcp.md](../../../apps/docs/guide/agents-mcp.md) feedback — `grant mint`, `--label "cursor-agent"`, and `--capabilities` feel abstract; mint vs `grant use` is unclear.

**Tutorial stance (2026-07-10):** [Tutorial 1 v3 Part 1](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/01-launch-and-create-space.md) no longer has a separate “Connect your agent” section — agent setup is **`mrmr setup` wizard-only** on the happy path (Grant step). Implementation must make that step self-contained (or automatic).

**Related (do not merge):** [2026-07-10-desktop-mcp-bridge-exposure.md](./2026-07-10-desktop-mcp-bridge-exposure.md) (bundled bridge path only).

---

## Problem statement

Today onboarding exposes **implementation concepts** too early:

| Concept | What users see | What they think it means |
|---------|----------------|--------------------------|
| Grant | `mrmr grant mint` | ??? |
| Label | `--label "cursor-agent"` | A Cursor setting? |
| Capabilities | `space:read,flow:run,step:resolve,…` | OAuth scopes? copy-paste lottery |
| Mint vs use | Two commands in docs | Redundant? which one for MCP? |
| Token export | `export MURRMURE_HUB_TOKEN=…` | Separate from mcp.json? |

The **setup wizard** already does something simpler (mint with defaults, print MCP snippet, label `"Worker agent"`), but **manual docs** show the low-level CLI shape. Tutorial 1 Grant step and `agents-mcp.md` are not aligned on vocabulary or defaults.

**Target:** First space connect feels like “**Allow tools on this computer to access this space?** → choose one or more integration contexts → configure MCP/skills → reload/verify” with **no required flags** on the happy path. Setup creates one persistent local connection for the computer/trust boundary; every selected local adapter reuses it.

---

## Phase 0 — Research & definition (blocking)

**No implementation until Phase 0 deliverables are reviewed.** Output: a short **decision doc** section at the bottom of this plan (or `2026-07-10-agent-grant-onboarding-decisions.md`) that answers every open question with one chosen option.

### 0.1 — Map current flows

Document each path end-to-end (commands, hub API, stored files, MCP client inputs):

| Path | Entry | Grant created? | Capabilities source | Label default | MCP written? |
|------|-------|----------------|---------------------|---------------|--------------|
| `mrmr setup` wizard Grant step | Desktop first link | Yes | `AGENT_GRANT_CAPABILITIES` in `wizard/capabilities.ts` | `"Worker agent"` | Snippet only (optional write) |
| `mrmr grant mint` (manual) | agents-mcp.md | Yes | User `--capabilities` | User `--label` (required) | Optional confirm write |
| `mrmr grant use` | docs / doctor fixes | No | N/A | N/A | N/A |
| Desktop **Copy MCP config** | desktop UI | ? | ? | ? | ? |

**Code anchors:** `packages/cli/src/wizard/grant.ts`, `commands/space/grant.ts`, `wizard/capabilities.ts`, `lib/grant-store.js`, `hub-core/handlers/config.ts` `mintGrant`, `studio-specs/current/cli/spec.md`.

### 0.2 — Vocabulary & UX targets

Propose **user-facing words** (not necessarily CLI renames in v1):

| Internal | Candidate user phrase |
|----------|----------------------|
| Grant | “Agent access” / “Connection for your coding agent” |
| Mint | “Create connection” / “Generate agent token” |
| Label | “Name (for you)” — e.g. “Coding agent on laptop” |
| Capabilities | Hidden on default path; “Advanced permissions” when needed |
| `grant use` | Removed; `connection activate <connection-id>` selects an existing local connection |

**Deliverable:** one paragraph “what we say in Tutorial 1 Part 1” + one paragraph for `agents-mcp.md` intro.

### 0.3 — Default capabilities research

**Question:** What should every new space get **by default** so Tutorial 1 Part 3 (agent step) works without the user specifying scopes?

Audit:

1. **Wizard list today** (`AGENT_GRANT_CAPABILITIES`): `space:read`, `flow:run`, `flow:read`, `action:invoke`, `gate:resolve`, `journal:read` — **missing `step:resolve`** (required for `murrmure_resolve_step`).
2. **Docs list** (`agents-mcp.md`): includes `step:resolve`, omits `action:invoke` / `gate:resolve` in places.
3. **Tutorial 1b** (`02-setup-wizard.md`): mixed `step:resolve` + `gate:resolve`.
4. **MCP registry** (`mcp-tool-registry.ts`): which tools map to which capability for Tutorial 1 minimal flow?

**Deliverable:** table **Tutorial 1 minimal flow** → required MCP tools → required capabilities → **proposed `DEFAULT_SPACE_AGENT_CAPABILITIES`**.

**Locked default profile (2026-07-14):**

```text
space:read
flow:read
flow:run
step:resolve
```

`flow:read` lets the agent inspect the run graph and understand its current position. `action:invoke`, `gate:resolve`, and `journal:read` are not defaults; raw journal access remains advanced. Obsolete action/gate capability and tool paths must be removed in the clean cutover when no nonlegacy use remains.

The setup-created profile is space-wide: it has no flow ACL restriction and applies to current and future flows in that space. Advanced `connection create` may restrict a new connection to selected already-applied canonical flow identities.

Options to decide (not pre-decided):

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Defaults only on **wizard mint** / `grant mint` with no flags | Small change | Manual `grant mint` still confusing |
| **B** | Defaults stored on **space record** at init/link; mint inherits | “Space knows its agent profile” | Hub/schema change |
| **C — selected with confirmation** | At the end of `mrmr setup`, ask whether tools on this computer may access the space; create one local connection and configure selected MCP/skills adapters to reuse it | Simple, space-scoped, and harness-neutral | Separate machines/CI require separate connections |
| **D** | Desktop **Connect agent** button mints using space defaults | No terminal for agents | Desktop UI work |

### 0.4 — Connect vs activate — single story

- `mrmr connection create` creates, stores, configures, and automatically activates a new connection.
- `mrmr connection activate <connection-id>` only switches the already-stored connection used by local CLI/MCP; it performs no Hub mutation.
- Remove `grant use` without an alias.
- Store tokens only in the OS credential store, keyed by Hub + connection ID. MCP config and the local active pointer contain the connection ID, never token material.
- Remove `MURRMURE_HUB_TOKEN` exports/references from the happy path, generated MCP config, project files, and normal local activation.
- Local credential lookup fails closed when the OS store is missing or locked; there is no plaintext file fallback.
- Headless/CI is the explicit exception: a CI provider secret manager may inject `MURRMURE_HUB_TOKEN` into the process environment at runtime. It is never generated into files, arguments, or logs.

**Deliverable:** sequence diagram for **one-space Tutorial 1** with minimal steps.

### 0.5 — Integration-context adapters

- Hub requires a non-empty operator label. Setup derives editable `Local tools on <hostname>` for a local machine connection; headless/CI creation derives or requires a trust-boundary label such as `GitHub Actions`.
- Keep harness identity as optional internal/audit metadata, never as a core execution assumption.
- Define one adapter contract that can detect a target context, install/update MCP configuration, install Murrmure skills/instructions in the target's native location, perform any required reload/restart handoff, and verify the connection.
- Wizard core produces a neutral descriptor (Hub ID, connection ID, bundled bridge command, skill bundle/version, requested profile) and contains no target-specific path/config logic.
- Supported adapters consume that descriptor. An always-available generic adapter writes nothing and returns portable MCP + skill installation instructions.
- Setup presents detected contexts as a multi-select. One detected context is preselected but still confirmed; several allow one or many selections; none selects the generic no-write adapter. Never silently prefer a vendor.
- Adapter selection is installation only. All selected local contexts receive the same machine/trust-boundary connection ID and credential.
- Create another persistent connection only for another machine, CI runner/secret boundary, team member, or intentionally separate trust boundary.
- A space handler may spawn any user-owned harness. The child receives an ephemeral run/step-scoped execution credential and never inherits or requires the persistent local connection.

### 0.6 — Stakeholder review

Review with:

- Tutorial 1 v3 narrative (Part 1 Grant step)
- `agents-mcp.md` rewrite outline
- `studio-specs/current/cli/spec.md` + `product/spec.md` § grants
- Security: default capability set must not exceed “Tutorial 1 agent” needs; document how to tighten for production spaces

**Phase 0 exit criteria:**

- [ ] Chosen option(s) for default capabilities + when they apply (A/B/C/D)
- [ ] Canonical capability list with `step:resolve` / `gate:resolve` resolved
- [ ] User vocabulary locked
- [ ] Mint vs use story ≤ 3 bullets for Tutorial 1
- [ ] Open questions list empty or explicitly deferred

---

## Phase 1 — Product & CLI (after Phase 0)

Indicative slices (refine after research):

| ID | Work |
|----|------|
| **GO-1** | Replace `grant mint` with `connection create`; wizard + command use the single default profile when advanced permissions are omitted |
| **GO-2** | Sensible default `--label` (optional flag); improve help text |
| **GO-3** | Wizard: explicitly ask whether tools on this computer may access the space; create/activate one local trust-boundary connection; decline creates no credential |
| **GO-4** | Fix `step:resolve` gap in wizard defaults if audit confirms |
| **GO-5** | `mrmr doctor` messages use user vocabulary, not grant jargon |
| **GO-6** | Support adding another integration context without replacing existing connections; list/rotate/revoke each token independently |
| **GO-7** | Replace `grant use` with local-only `connection activate <connection-id>`; create auto-activates; remove old command/help/tests without an alias |
| **GO-8** | Add OS credential-store persistence keyed by Hub + connection ID; MCP/CLI resolve tokens at runtime; delete generated env-token/project-file paths |
| **GO-9** | Add explicit headless/CI auth mode using runtime environment injection from a CI secret manager; local mode rejects env fallback |
| **GO-10** | Add integration-context adapter contract and registry for detect, MCP install, skill install, reload handoff, and verification; keep wizard core target-neutral |
| **GO-11** | Add generic no-write adapter producing portable MCP/skill instructions and adapter conformance tests |
| **GO-12** | Add neutral multi-select target picker with one-target preselection/confirmation, multiple selection, and generic fallback |
| **GO-13** | Make setup connections space-wide; advanced creation may resolve selected applied flow aliases to canonical ACL identities |
| **GO-14** | Remove `space onboard` implementation/registration/help; route documentation to `setup`, granular space commands, and `connection create` with no alias |
| **GO-15** | Reuse one local connection across every selected adapter; create separate connections only for separate trust boundaries |
| **GO-16** | Keep shell-spawned harnesses off persistent connections; issue ephemeral run/step-scoped execution credentials |

---

## Phase 2 — Docs & tutorial (after Phase 0)

| ID | Work |
|----|------|
| **GO-D1** | Rewrite `agents-mcp.md` — concept first, one happy path, advanced section for manual mint |
| **GO-D2** | Tutorial 1 v3 Part 1 — match wizard words; no raw capability string on default path |
| **GO-D3** | Sweep `quick-start`, `configuration`, `troubleshooting` for jargon alignment |
| **GO-D4** | Update `studio-specs/current/cli/spec.md` grant section |
| **GO-D5** | `docs-proof` or skill-eval guard: agents-mcp must not require `--label` on happy-path example |
| **GO-D6** | Document the neutral descriptor/adapter contract and a support matrix without presenting one agent as the product default |

---

## Phase 3 — Optional hub / Desktop (if Phase 0 chooses B or D)

- Space-level `default_agent_capabilities` in hub persistence
- Desktop **Connect agent** uses space defaults
- Only if Phase 0 justifies schema/UI cost

---

## Acceptance criteria (final)

| ID | Criterion |
|----|-----------|
| **GA-1** | New user following Tutorial 1 v3 connects agent **without** typing capability strings or inventing a label |
| **GA-2** | `agents-mcp.md` explains grant/mint/label in plain language in first screen |
| **GA-3** | Default capability set is exactly `space:read`, `flow:read`, `flow:run`, `step:resolve`; it supports status, graph/current-position context, run start, handler discovery, and step resolve |
| **GA-4** | `connection create` auto-activates; `connection activate <connection-id>` is advanced local selection only; `grant use` is absent |
| **GA-5** | Phase 0 decision doc committed; no ambiguous `gate:resolve` vs `step:resolve` in defaults |
| **GA-6** | A space supports multiple independently labeled, scoped, rotated, and revoked trust-boundary connections; no stored Murrmure agent entity exists |
| **GA-7** | Desktop shows revoked connections only in collapsed read-only history, never exposes tokens, and reconnects by creating a new connection |
| **GA-8** | `mrmr connection create` is the only public creation command; `grant mint` and `agent connect` are absent from command registration, help, docs, tests, and skills |
| **GA-9** | Local tokens exist only in the OS credential store; generated MCP config, local environment instructions, active pointers, logs, and project files contain connection IDs but no token |
| **GA-10** | Local credential-store failure is closed; only explicit headless/CI mode accepts a runtime environment token, never files, arguments, generated config, or logs |
| **GA-11** | Setup core contains no agent-specific paths/config shapes; every adapter passes one MCP/skills/install/verify conformance suite |
| **GA-12** | Unknown contexts use the generic no-write adapter and receive complete portable instructions rather than a misleading target-specific snippet |
| **GA-13** | Detected contexts are presented without vendor preference; users may configure one or several in one setup run |
| **GA-14** | Setup connections can read/run/resolve future flows in their space; advanced flow-restricted connections match only selected canonical applied identities |
| **GA-15** | `mrmr space onboard` is absent from command registration, implementation, help, docs, tests, and skills |
| **GA-16** | Selecting multiple local adapters creates one credential/actor ID; another machine or CI gets a distinct connection |
| **GA-17** | Spawned handlers receive only ephemeral run/step-scoped credentials and can execute any harness without a persistent connection |

---

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-14 | `mrmr space init` remains offline and creates no credential. `mrmr setup` asks whether tools on this computer may access the space; acceptance creates one local connection and configures selected contexts, while decline creates nothing. | Avoid silent credential creation without defining an agent entity. |
| 2026-07-14 | Murrmure stores connections, not agents. One persistent connection represents a machine/trust boundary and may be installed into several local contexts. Separate machines, CI, team members, or trust boundaries receive separate connections. | Keep authorization space-scoped and harness-neutral while preserving meaningful rotation/revocation boundaries. |
| 2026-07-14 | Desktop keeps revoked connections in a collapsed read-only history showing connection ID, label, permissions, creation/last-use/revocation timestamps, with no token and no reactivation. Reconnecting creates a new connection. | Preserve audit and troubleshooting value without cluttering the tutorial path or reviving revoked credentials. |
| 2026-07-14 | Initial connections receive exactly `space:read`, `flow:read`, `flow:run`, and `step:resolve`. `flow:read` provides graph/current-position context; `journal:read` is advanced, while legacy `action:invoke`/`gate:resolve` are excluded and removed if no clean-system use remains. | Support autonomous flow participation without granting raw audit access or legacy execution powers. |
| 2026-07-14 | Replace public `mrmr grant mint` with `mrmr connection create`; do not retain `grant mint` or `agent connect` aliases. Keep grant terminology internal/advanced. | Name the resource Murrmure actually owns instead of implying an agent entity. |
| 2026-07-14 | Replace `mrmr grant use` with `mrmr connection activate <connection-id>` and retain no alias. Creation auto-activates; activation changes only the local stored-connection pointer. | Separate Hub credential creation from local selection using precise vocabulary. |
| 2026-07-14 | Store connection tokens only in the OS credential store keyed by Hub + connection ID. MCP config and activation state carry IDs only; remove normal env exports and project-file token paths. | Prevent accidental secret disclosure while letting the bundled bridge resolve credentials at launch. |
| 2026-07-14 | Local credential-store access fails closed with no plaintext/env fallback. Explicit headless/CI mode may receive `MURRMURE_HUB_TOKEN` only from a CI secret manager at process runtime. | Preserve secure local defaults while supporting runners without an OS credential service. |
| 2026-07-14 | Connection setup is adapter-driven and harness-agnostic. Core emits one neutral connection/skills descriptor; context adapters own detection, MCP config, skills install, reload handoff, and verification. Unknown contexts use a generic no-write adapter. | Murrmure owns connection protocol, not agent-specific configuration or a privileged vendor path. |
| 2026-07-14 | Setup uses a neutral multi-select for detected integration contexts. One result may be preselected but requires confirmation; multiple results allow one or many; no result uses generic no-write instructions. | Support mixed environments without silently privileging one vendor. |
| 2026-07-14 | Setup-created connections are space-wide for their capabilities and cover current/future flows. Advanced connections may restrict access to selected already-applied canonical flow identities. | Setup occurs before tutorial flows exist; fake future flow aliases would be ambiguous and brittle. |
| 2026-07-14 | Remove `mrmr space onboard` without redirect or alias. Use `mrmr setup`, granular `space init/link/apply`, and `connection create`. | One guided entry point and one precise set of advanced primitives avoid overlapping setup flows. |
| 2026-07-14 | Adapter selection installs one local connection; it does not mint one credential per tool. Shell-spawned harnesses receive ephemeral run/step-scoped execution credentials instead of persistent access. | Separate installation, persistent trust boundaries, and space-owned execution. |

---

## Related

- [agents-mcp.md](../../../apps/docs/guide/agents-mcp.md)
- [Tutorial 1 v3 Part 1](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/01-launch-and-create-space.md)
- `packages/cli/src/wizard/capabilities.ts`
- [bridges/grants-migration.md](../current/bridges/grants-migration.md)
