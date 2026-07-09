# Plan — MCP reliability for agent workflows

**Date:** 2026-07-09 (updated after deep review pass)  
**Status:** Implemented — Phases 0–4 + 6 complete; Phase 5 deferred (HTTP MCP OAuth spike)  
**Goal:** Agents running Murrmure shell steps (Tutorial 1, preview-review, feature-build) can **reliably** call hub protocol tools (`murrmure_resolve_step`, `murrmure_get_run`, `murrmure_wait_for_run`, …) from Cursor without falling back to raw `curl`.

**Reviews:** [docs/product](./2026-07-09-mcp-reliability-plan-review-docs-product.md) · [architecture](./2026-07-09-mcp-reliability-plan-review-architecture.md) · [testability](./2026-07-09-mcp-reliability-plan-review-testability.md) — all three verdicts: target architecture correct, plan under-specified for breaking-change sweep until amendments below are implemented.

---

## Executive summary

Murrmure v2 core is shipped (B1–B10 closed, step contracts VS-8 shipped). The **remaining agent-loop blocker** is MCP integration between Cursor and the local hub.

We have **three distinct failure modes**:

| ID | Symptom | Root cause class | Severity |
|----|---------|------------------|----------|
| **MCP-1** | Cursor catalog shows only `mcp_auth`; hub tools invisible | Stdio bridge / post-auth catalog refresh / server naming | P0 in some envs |
| **MCP-2** | Tools callable but every invoke sends `{}` args → hub validation errors | Missing `inputSchema` in `/v1/mcp/catalog` (18/19 tools today) | P0 in tutorial build |
| **MCP-3** | `mrmr space doctor` passes while MCP is broken at runtime | Doctor scans files only, not live catalog; rules inverted | P1 DX |

**Agreed target architecture (2026-07-09):**

1. **Hub owns MCP protocol** — catalog, schemas, tool invoke, wake prompt rendering, control-bus delivery live in `hub-daemon` / `hub-core`.
2. **Remove the fat CLI MCP layer entirely** — delete `murrmure mcp`, `packages/cli/src/mcp/*`; no business logic in CLI for MCP runtime.
3. **Thin bridge package** — `@murrmure/mcp-bridge` publishes bin `murrmure-mcp`: discovery + token forwarding + stdio↔HTTP proxy + **client-only wake relay** (handshake poll, `createMessage`, `.murrmure/pending-wake.json` write). Not a stateless 50-line proxy — wake push requires a connected stdio process.
4. **Simple MCP config shape** — same minimal snippet whether Cursor loads it globally or per-project; tutorials default to global, **project-level remains supported**.
5. **Bearer grant token is the only secret** — space identity, capabilities, and `flow_acl` come **from the token**, not from separate env vars in config.
6. **Hub endpoint from discovery** — bridge reads `~/.murrmure/hubs/shared.json`; never hardcode `:8787` in snippets.
7. **Atomic cutover** — MCP-CUTOVER is a single milestone at end of Phase 2; no dual-path window where fat CLI and thin bridge coexist in doctor/scaffold/docs.

---

## Target architecture (normative for this plan)

### Layer diagram

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Cursor IDE                                                                │
│   CallMcpTool → murrmure MCP server (global or project mcp.json)          │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ stdio (MCP protocol)
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ murrmure-mcp (@murrmure/mcp-bridge)                                       │
│   • Read ~/.murrmure/hubs/shared.json → hubs[0].endpoint                 │
│   • Read MURRMURE_HUB_TOKEN from env (only user-supplied credential)      │
│   • Proxy tools/list + tools/call → hub HTTP                              │
│   • Handshake poll → relay hub-rendered wake prompt verbatim              │
│   • Write .murrmure/pending-wake.json (local cwd only)                    │
│   • createMessage / sendToolListChanged (client-only MCP APIs)              │
│   • No catalog rebuild, no prompt formatting, no space_id                 │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ HTTP (loopback, discovered URL)
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Hub daemon (inside Murrmure Desktop)                                      │
│   GET  /v1/mcp/catalog      — grant-filtered tools + inputSchema (all)    │
│   POST /v1/mcp/tools/call   — authorize + invoke                          │
│   POST /v1/mcp/session/handshake — control bus; wake prompt pre-rendered  │
│   Writes ~/.murrmure/hubs/shared.json on start                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Package boundary (normative — not optional)

| Package | Role |
|---------|------|
| `@murrmure/mcp-bridge` (`packages/mcp-bridge/`) | Stdio bridge; bin `murrmure-mcp` only — **no** `mrmr-mcp` alias |
| `@murrmure/cli` | Setup, grant mint/use, doctor, snippet writers — **does not** import or ship MCP SDK |
| `@murrmure/hub-daemon` | Protocol owner: catalog, invoke, handshake, wake prompt rendering |

Install: `npm i -g @murrmure/mcp-bridge` (documented separately from CLI until optional bundling is decided).

### Cursor config: global vs project-level (both valid)

| Location | Scope | Typical use |
|----------|-------|-------------|
| `~/.cursor/mcp.json` | All projects | Default onboarding — one `murrmure-mcp` entry, switch token per space |
| `<repo>/.cursor/mcp.json` | This workspace only | Per-space grant when you routinely open that repo in its own Cursor window |

**Both use the same snippet shape.** The plan does not forbid project-level config — it avoids **requiring** it in every space repo (tutorial drift, committed tokens, hardcoded ports).

**Product default:** `mrmr setup` / `mrmr grant mint` writes `~/.cursor/mcp.json` first. Optionally also write `<repo>/.cursor/mcp.json` when `--local`.

### What is global vs per-space (auth)

| Shared / discovered (not in mcp.json) | Per-space (via grant token) |
|---------------------------------------|----------------------------|
| `~/.murrmure/hubs/shared.json` — hub URL/port | `space_id` on the token record |
| `murrmure-mcp` binary on PATH | `capabilities` (scopes) |
| Bridge reads discovery | `flow_acl` (optional flow restrictions) |

**MCP config = plumbing (where Cursor finds `murrmure-mcp`). Bearer token = identity + authorization.**

### Target `mcp.json` snippet (global or project-level)

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure-mcp",
      "env": {
        "MURRMURE_HUB_TOKEN": "${env:MURRMURE_HUB_TOKEN}"
      }
    }
  }
}
```

- **No** `MURRMURE_HUB_URL` — bridge reads discovery file.
- **No** `MURRMURE_SPACE_ID` — space from token.
- **No** hardcoded port.

**Do not put in mcp.json:** `MURRMURE_HUB_URL`, `MURRMURE_SPACE_ID`, hardcoded `:8787`.

### Wake / control-bus cutover (normative)

Hook-driven wake (feedback agent, Tutorials 2 & 3) uses MCP server→client APIs (`createMessage`, `sendToolListChanged`) that **only the stdio-connected process can issue**. The hub cannot push directly into Cursor.

**Target split:**

| Responsibility | Owner |
|----------------|-------|
| Wake prompt text rendering (`formatInvokeActionWake`, `formatWakePendingWake`) | **Hub** — add `prompt` field to control-bus message payloads |
| Handshake poll, ack-seq persistence, `client_id` | **Bridge** — stateless w.r.t. business logic, stateful w.r.t. delivery cursor |
| `.murrmure/pending-wake.json` write | **Bridge** — only local process with repo cwd can write this file |
| `createMessage` / `sendToolListChanged` | **Bridge** — client-only MCP APIs |
| `murrmure_get_pending_wake` tool | **Bridge** — returns last relayed hub prompt; zero formatting logic |

**Sequence:**

```text
1. Cursor spawns murrmure-mcp. Bridge reads shared.json + MURRMURE_HUB_TOKEN.
2. Bridge POSTs /v1/mcp/session/handshake { client_id, last_ack_seq } — NO space_id.
3. Hub resolves space from bearer; drains control bus; wake messages include pre-rendered prompt.
4. Bridge: write .murrmure/pending-wake.json with hub prompt verbatim; try createMessage.
5. Agent may call murrmure_get_pending_wake → bridge returns last relayed prompt.
```

Update `.cursor/rules/murrmure-feedback-wake.mdc` and skill `reference/mcp.md` to match shipped wake model.

### CLI role after this plan (setup + health, not MCP runtime)

| CLI keeps | CLI removes |
|-----------|-------------|
| `mrmr grant mint` — mint space grant, print/export token | `murrmure mcp` / `mrmr mcp` subcommand |
| Write MCP snippet (`~/.cursor/mcp.json` default; optional `--local`) | `packages/cli/src/mcp/*` entire directory |
| `mrmr grant use --space` — switch active token (`~/.murrmure/grants/`) | `exports["./mcp"]`, `@modelcontextprotocol/sdk` dep |
| `mrmr space doctor` — live MCP health checks | Fat `dist/mcp.js` build entry |
| Probe `GET /v1/mcp/catalog` + test invoke | `mrmr-mcp` bin alias everywhere |

---

## Evidence — consolidated from feedback + live forensics

### Feedback files (still open)

| File | Type | What it reports |
|------|------|-----------------|
| [`feedbacks/2026-07-07-failure-cursor-mcp-bridge-callmcptool.md`](../../feedbacks/2026-07-07-failure-cursor-mcp-bridge-callmcptool.md) | Failure | Catalog stuck on `mcp_auth`; server name mismatch; HTTP works |
| [`feedbacks/2026-07-07-improvement-mcp-discovery.md`](../../feedbacks/2026-07-07-improvement-mcp-discovery.md) | Improvement | Catalog refresh; HTTP fallback |
| [`feedbacks/2026-07-07-improvement-cli-doctor.md`](../../feedbacks/2026-07-07-improvement-cli-doctor.md) | Improvement | `MCP_CATALOG_LIVE` check missing |

### Forensic session — `ses_01KX2PTD5D4ZZSZKAA5J8S1F65` (2026-07-09)

**Space:** `spc_murrmuretuto` · **Run:** `run_01KX2PTD5HNWR4FV78XNCSFZB3` · **Step:** `build`

MCP-2: tools reachable, args `{}` → hub validation errors. Agent recovered via `curl`. Catalog had no `inputSchema` for `murrmure_resolve_step`.

### Phase A findings — ISSUE-07 (token space mismatch)

agentStudio global MCP used grant for `spc_murrmure` while tutorial ran in `spc_murrmuretuto`. Doctor must compare **token space** (from `mrmr whoami` / hub) vs **link space** (`.murrmure/link.json` in cwd).

### Live codebase debt (verified 2026-07-09)

- `packages/cli/templates/space/.cursor/mcp.json` scaffolds fat shape into every new space.
- `space-doctor-mcp.ts` flags `murrmure-mcp` as **deprecated** and fat `murrmure mcp` as **canonical** — inverted vs target.
- `package.json` has **no** `murrmure-mcp` bin; `dev-hmr-cli.ts` symlinks it to fat `mcp.js`.
- `mcp-tool-registry.ts`: 19 platform tools, **1** has `inputSchema` (`murrmure_emit_event`).
- Repo `/.cursor/mcp.json` contains a live grant token — rotate immediately (Phase 0).

---

## Remediation phases

### Phase 0 — Immediate hygiene (before any code)

**Work:**

1. Revoke/rotate any live grant token committed in tracked files (repo `/.cursor/mcp.json`).
2. Migrate dogfood config to thin shape or gitignore + document; no `tok_` literals in tree.

**Acceptance (CI):**

- `rg "tok_[0-9A-Z]{20,}" -- ':!*.md'` returns no live grant in tracked files.

---

### Phase 1 — Hub input schemas (MCP-2) — **do first**

**Work:**

1. Add `inputSchema` builders in hub (`mcp-tool-schemas.ts` or inline in `mcp-tool-registry.ts`).
2. Attach schemas in `listForToken()` for **all 19 `PLATFORM_TOOLS`** — not just the tutorial subset. The 9-tool minimum set is the P0 gate; the other 10 (`murrmure_grant_mint`, `murrmure_cancel_run`, `murrmure_apply_space`, etc.) must also get schemas or MCP-2 recurs.
3. Hub tests: per-tool schema matrix; `murrmure_resolve_step` has `required: [run_id, step_id, branch]`.
4. Hub: add pre-rendered `prompt` field to control-bus wake messages (port `wake-prompt.ts` logic from CLI).

**P0 schema set (minimum for Tutorial 1 exit):**

| Tool | Required args |
|------|---------------|
| `murrmure_resolve_step` | `run_id`, `step_id`, `branch` |
| `murrmure_get_run` | `run_id` |
| `murrmure_wait_for_run` | `run_id` |
| `murrmure_list_step_contracts` | `run_id` |
| `murrmure_get_session` | `session_id` |
| `murrmure_create_run` | `session_id` |
| `murrmure_invoke_action` | `action_name` (+ dispatch context) |
| `murrmure_journal_query` | optional filters |
| `murrmure_space_status` | optional `space_id` (bootstrap only) |

**Acceptance (CI):**

- `packages/hub-daemon/test/http/mcp/catalog-schema.test.ts` — all 19 tools have non-empty `inputSchema`; P0 tools have correct `required` arrays.
- Handshake wake message includes `prompt` string; test asserts hub renders it.

**Acceptance (manual):**

- Tutorial `feature_build` stream-json shows `murrmure_resolve_step` with non-empty args; no curl fallback.

---

### Phase 2 — Bridge package + MCP-CUTOVER (atomic single PR)

Phase 2 ends with **one atomic merge** — no observable window where fat CLI and thin bridge coexist in doctor/scaffold/help.

#### 2a — Create `@murrmure/mcp-bridge`

**Package:** `packages/mcp-bridge/`

```text
packages/mcp-bridge/
  package.json     name: "@murrmure/mcp-bridge", bin: { "murrmure-mcp": "./dist/main.js" }
  src/
    main.ts        entrypoint
    discovery.ts   read ~/.murrmure/hubs/shared.json only (no port fallback, no MURRMURE_HUB_URL)
    hub-client.ts  catalog, tools/call, handshake
    wake-relay.ts  relay hub prompt verbatim; write pending-wake.json; createMessage
  test/
    discovery.test.ts
    stdio-proxy.integration.test.ts   MCP SDK client over stdio, no Cursor
    error-surface.test.ts
```

**Bridge must NOT:** read `MURRMURE_SPACE_ID`, `MURRMURE_HUB_URL`, or env aliases; format wake prompts; send `space_id` on requests for non-bootstrap tokens.

#### 2b — MCP-CUTOVER checklist (all items in one PR)

```text
MCP-CUTOVER (single PR):
  1. Ship packages/mcp-bridge with bin "murrmure-mcp" only (no mrmr-mcp).
  2. DELETE packages/cli/src/mcp/ (main, control-session, env, pending-wake, wake-prompt)
     DELETE packages/cli/src/mcp.ts, packages/cli/src/commands/mcp.ts
     REMOVE mcpCommand from root.ts + help string mentioning mrmr mcp
     REMOVE exports["./mcp"], @modelcontextprotocol/sdk dep, tsup entry "mcp"
  3. DELETE packages/cli/templates/space/.cursor/mcp.json
     REMOVE mcp.json copy block from space-scaffold.ts
  4. REWRITE space-doctor-mcp.ts:
     - buildMcpConfigSnippet() → thin shape only
     - validateMurrmureServer() inverted: murrmure-mcp = canonical; murrmure+args:mcp = ERROR
     - probeMcpCatalog() sends no space_id
     - discoverMcpConfigPaths() includes ~/.cursor/mcp.json
  5. REWRITE space-doctor-mcp.test.ts (not append — replace inverted cases)
     DELETE or port mcp-control-session.test.ts, mcp-session.test.ts, mcp-wake-prompt.test.ts
  6. REWRITE apps/desktop/scripts/dev-hmr-cli.ts → murrmure-mcp points at bridge build; drop mrmr-mcp
  7. REWRITE snippet generators: McpSnippetCard, ConnectPage, menus.ts → thin shape (shared snapshot test)
  8. REWRITE studio-specs/current/cli/spec.md (remove "unchanged", remove mrmr-mcp)
  9. REWRITE repo /.cursor/mcp.json to thin shape (token rotated in Phase 0)
 10. CI gate: rg '"murrmure".*"args".*"mcp"' packages/cli apps/desktop returns 0 outside CHANGELOG
     CI gate: rg "mrmr-mcp" repo returns 0 outside archives
```

**Acceptance (CI):**

- `packages/cli/src/mcp/` does not exist.
- `murrmure --help` shows no `mcp` subcommand.
- `which murrmure-mcp` succeeds after `npm i -g @murrmure/mcp-bridge`.
- Thin-bin stdio integration: `tools/list` parity with hub catalog; `tools/call` for `murrmure_space_status` succeeds.
- Thin-bin errors: missing discovery, hub down → actionable stderr, non-zero exit.
- Doctor: fat shape = error; thin shape = pass; scans global `~/.cursor/mcp.json`.
- Hub handshake replay test: invoke dispatch appears without CLI subprocess.
- Token never printed to stdout/stderr in bridge or doctor errors.

**Acceptance (manual):**

- Hook wake E2E: Tutorial 3 `mcp_wake` delivers to agent with only `murrmure-mcp` + Desktop (no `murrmure mcp`).

---

### Phase 3 — CLI onboarding + docs/skills/specs sweep

**Work:**

1. `mrmr grant mint` → print `export MURRMURE_HUB_TOKEN=…` + offer to write `~/.cursor/mcp.json`; `--local` for project-level.
2. `mrmr grant use --space spc_…` — storage: `~/.murrmure/grants/<space>.token` + `~/.murrmure/grants/active` pointer; updates `mrmr whoami` effective token.
3. `mrmr space init` — no default `.cursor/mcp.json`; README pointer to `mrmr grant mint` instead.
4. **Docs sweep** (~17 pages): `agents-mcp.md`, `installation.md`, `cli.md`, `how-it-fits-together.md`, `troubleshooting.md`, `quick-start.md`, `introduction.md`, `desktop.md`, `configuration.md`, `multi-agent-feature-spec.md`, `reference/environment.md`, `reference/mcp-tools.md`, `known-gaps.md`, all tutorial connect steps. Remove `studio-hub-mcp`, fat `murrmure mcp`, three-env snippets.
5. **Skill sweep:** `packages/cli/skill/SKILL.md`, `reference/{mcp,cli,wizards,actions-executors,troubleshooting,known-gaps}.md`; update `skill-eval/mcp-setup.json`.
6. **Spec reconciliation:** `cli/spec.md`, `hub/contracts.md`, `product/spec.md` §10.9, `bridges/flow-runtime.md`, `bridges/action-invoke.md` (split executor-env vs MCP-agent-env), `build-capability/02-sdk.md`, `build-capability/07-mcp-tool-model.md`, `overview.md`.
7. **environment.md:** two tables — "CLI/executor env" (keeps `MURRMURE_SPACE_ID`) vs "MCP agent env (token only)".
8. **docs-proof.test.ts:** ban `"args": ["mcp"]`, `MURRMURE_SPACE_ID` in MCP examples; require `murrmure-mcp`.
9. **Examples:** update `examples/flows/*/README.md`, `agent.md` connect sections.
10. **CHANGELOG** breaking entry: removed `murrmure mcp`, fat MCP config shape, new `@murrmure/mcp-bridge`.
11. **Delete** interim HTTP-fallback section from `packages/cli/skill/reference/mcp.md` (same release as MCP-CUTOVER or immediately after).
12. Optional: `mrmr space doctor --fix` rewrites detected fat `mcp.json`.

**Acceptance (CI):**

- `rg 'murrmure mcp|args.*\["mcp"\]|MURRMURE_SPACE_ID.*mcp|studio-hub-mcp' apps/docs` = 0 outside archive.
- `docs-proof.test.ts` config-shape guard passes.
- `space-init.test.ts` asserts no default `.cursor/mcp.json`.
- `wizard/setup.test.ts`, `space-grant.test.ts` assert thin snippet + global/`--local` write targets.
- No `studio-specs/current/**` spec requires `MURRMURE_SPACE_ID` in MCP config.
- Shared snapshot test: CLI doctor, wizard, shell-web Connect, Desktop menu emit byte-identical thin snippet.

**Acceptance (manual):**

- Tutorial 1 works with global config only.
- Multi-space Tutorials 2/3: token-switch (global) and `--local` per-repo both documented and exercised.

---

### Phase 4 — Doctor live health (MCP-3)

Most doctor shape-flip work moves to Phase 2 (MCP-CUTOVER). Phase 4 adds live probes and fix-plan wiring.

**Work:**

1. `MCP_DISCOVERY` — `shared.json` exists, `GET /v1/health` OK, endpoint matches live hub.
2. `MCP_CONFIG_SHAPE` — already flipped in Phase 2; extend to warn on `MURRMURE_HUB_URL`/`MURRMURE_SPACE_ID` keys in mcp.json.
3. `MCP_TOKEN_SET` — `MURRMURE_HUB_TOKEN` in env, credentials, or mcp.json `${env:…}` ref.
4. `MCP_TOKEN_SPACE_MATCH` — `mrmr whoami` token `space_id` vs cwd `.murrmure/link.json` (ISSUE-07).
5. `MCP_CATALOG_LIVE` — catalog includes `murrmure_resolve_step`, `murrmure_space_status` for current grant.
6. `MCP_SCHEMA_PRESENT` — `murrmure_resolve_step` has non-empty `inputSchema` with `required`.
7. `MCP_PROBE_INVOKE` — `murrmure_space_status` succeeds; 401/403 on revoked/wrong grant.
8. Wire all checks into `buildSpaceDoctorFixPlan` with actionable remediation per code.
9. Top-level `mrmr doctor` includes MCP checks (today `runDoctor` may skip them).
10. Fix `runSpaceDoctor` auth path: hub checks must use resolved auth, not only `options.auth` (false-negative bug).

**Acceptance (CI):**

- `space-doctor-mcp-live.test.ts` — all 7 checks with fixtures; revoked-token and ISSUE-07 mismatch cases.
- `space-doctor.test.ts` — fix-plan mapping per MCP issue code; auth-path regression.

**Acceptance (manual):**

- `mrmr space doctor` catches wrong-token-for-linked-space before agent run.

---

### Phase 5 — Hub HTTP MCP + OAuth (long-term, optional)

**Work:**

1. Spike Cursor streamable HTTP MCP against hub loopback endpoint.
2. Hub MCP OAuth / "Connect" flow (token in Cursor credential store, not env).
3. Target config: `{ "url": "<discovered>/v1/mcp" }` only.

**Deprecation policy:** stdio bridge is **current default** until Cursor HTTP MCP + OAuth for loopback is GA. Once GA, publish deprecation notice with N-day sunset (tracked in issue). Do **not** document both paths as equally valid in tutorials.

**Acceptance (manual):** Figma-like UX spike checklist only. Phase 5 is non-blocking for plan exit.

---

### Phase 6 — Shell UI observability (optional)

- MCP failures in executor stream shown as errors (not success-wrapped text).
- `mcpToolCall` one-liner with tool name + param glimpse in `AgentStreamView`.
- Component tests: `AgentStreamView.test.tsx`, `McpSnippetCard` snippet shape.

---

## Anti-patterns — implementers must NOT

1. Keep `murrmure mcp` as alias, hidden subcommand, or doctor-suggested fallback.
2. Register both `murrmure-mcp` and `mrmr-mcp` bins.
3. Accept fat MCP config with only a warning after cutover — must be **error**.
4. Scaffold or commit mcp.json with `MURRMURE_HUB_URL`, `MURRMURE_SPACE_ID`, or hardcoded port.
5. Add bridge "compat layer" reading legacy env vars "for migration."
6. Leave `packages/cli/src/mcp/` with re-exports or `@deprecated` stubs.
7. Keep `exports["./mcp"]` in CLI package.json.
8. Document curl HTTP fallback as equally valid after MCP-CUTOVER.
9. Layer new doctor rules alongside old ("accept both shapes") — **replace**, don't union.
10. Move wake to hub but leave `control-session.ts` in CLI "for edge cases."
11. Ship fake `{ additionalProperties: true }` schemas to mask MCP-2.
12. Call stdio bridge "legacy fallback" without a dated deprecation trigger.
13. Let bridge format wake prompts — hub renders, bridge relays verbatim.
14. Ship bridge as nested folder under `packages/cli/src/` — must be independent package.
15. Let `mcp-handlers.ts` self-HTTP loopback spread to new hub work (follow-up debt ticket).

---

## CI gates (per phase)

| Phase | Must pass before merge |
|-------|------------------------|
| 0 | No live `tok_` in tracked files |
| 1 | Hub catalog-schema matrix; handshake prompt field test |
| 2 | Thin-bin stdio integration; fat deletion static gates; doctor flip; MCP-CUTOVER rg gates |
| 3 | docs-proof shape guard; scaffold/wizard/skill-eval tests; spec grep |
| 4 | Doctor live probe suite; fix-plan mapping |
| 5 | Manual only |
| 6 | Shell-web component tests |

**Permanent regrowth gates (post-cutover):**

```bash
rg '"murrmure".*"args".*"mcp"' packages/cli apps/desktop packages/cli/templates  # must be 0
rg "mrmr-mcp" .  # must be 0 outside archives/CHANGELOG
test ! -d packages/cli/src/mcp
```

---

## Success criteria (plan exit)

Split into **CI-automatable** and **manual sign-off**.

### CI-automatable

1. No fat CLI MCP layer — `murrmure mcp` removed; `packages/cli/src/mcp/` deleted; no `exports["./mcp"]`.
2. `@murrmure/mcp-bridge` ships `murrmure-mcp` bin; discovery + token-only config.
3. Bearer grant encodes space; no `MURRMURE_SPACE_ID` in any MCP snippet generator or doc example.
4. No hardcoded `:8787` in snippets; endpoint from `shared.json`.
5. All 19 platform tools have `inputSchema` in catalog.
6. Doctor: live catalog probe, schema check, token↔link space match, global + project config scan.
7. `rg` regrowth gates pass.
8. docs-proof + skill-eval + scaffold tests green.

### Manual sign-off

9. Tutorial 1 Part 2 + `feature_build` pass without curl fallback (global thin config).
10. Hook wake E2E (Tutorial 3) with bridge only.
11. Three MCP feedback files closed with PR links.

---

## Product integrity checklist (ship-blocking)

- [ ] No live grant token in tracked files
- [ ] `packages/cli/src/mcp/` deleted; `murrmure mcp` gone from help
- [ ] `@murrmure/mcp-bridge` published; `which murrmure-mcp` works
- [ ] MCP-CUTOVER landed atomically (doctor flipped, scaffold stopped, snippets rewritten)
- [ ] Wake E2E passes; `.cursor/rules/murrmure-feedback-wake.mdc` matches shipped model
- [ ] All snippet generators emit identical thin shape
- [ ] Docs/skills/specs sweep complete; docs-proof enforces shape
- [ ] `mrmr grant use` implemented and tested
- [ ] Hub ignores `space_id` for non-bootstrap tokens (bridge never sends it)
- [ ] CHANGELOG breaking entry present
- [ ] Interim HTTP-fallback doc deleted

---

## Out of scope

| Item | Notes |
|------|-------|
| MCP Apps (chat iframes) | Human UI = ViewCanvasHost |
| Desktop intake `token_denied` | Shipped |
| view-sdk ETARGET | Separate feedback |
| Remote/cloud MCP | Local hub only in v1 |
| `mcp-handlers.ts` in-process refactor | Follow-up debt; non-blocking |

---

## Code map (target)

| Component | Path | Role |
|-----------|------|------|
| Hub MCP routes | `packages/hub-daemon/src/routes/mcp/index.ts` | Catalog, invoke, handshake |
| Tool registry + schemas | `packages/hub-daemon/src/mcp-tool-registry.ts` | Grant-filtered catalog, all 19 schemas |
| Wake prompt rendering | `packages/hub-daemon/src/` or `hub-core` | Pre-rendered `prompt` in control-bus messages |
| Tool handlers | `packages/hub-daemon/src/mcp-handlers.ts` | Protocol tool impl |
| Discovery write | `packages/hub-daemon/src/ops.ts` | `shared.json` on hub start |
| Token auth | `packages/hub-daemon/src/auth.ts` | Bearer → space + flow_acl |
| **Bridge (new)** | `packages/mcp-bridge/` | `@murrmure/mcp-bridge`, bin `murrmure-mcp` |
| **Delete** | `packages/cli/src/mcp/*`, `commands/mcp.ts`, `mcp.ts` | Fat CLI MCP |
| Snippet + doctor | `packages/cli/src/lib/space-doctor-mcp.ts` | Split: config scan + live probes |
| Product snippets | `shell-web/McpSnippetCard`, `desktop/menus.ts` | Thin shape only |
| **Delete** | `packages/cli/templates/space/.cursor/mcp.json` | Fat scaffold template |

---

## Test file map

| File | Action | Asserts |
|------|--------|---------|
| `hub-daemon/test/http/mcp/catalog-schema.test.ts` | New | All 19 tools schema + P0 required fields |
| `hub-daemon/test/http/mcp/handshake-replay.test.ts` | New/extend | Wake prompt field; invoke replay |
| `mcp-bridge/test/discovery.test.ts` | New | Discovery parse/fail modes |
| `mcp-bridge/test/stdio-proxy.integration.test.ts` | New | Stdio list/call parity, errors |
| `cli/test/space-doctor-mcp.test.ts` | Rewrite | Thin canonical; fat = error; global scan |
| `cli/test/space-doctor-mcp-live.test.ts` | New | All 7 live checks |
| `cli/test/space-init.test.ts` | Modify | No default local mcp.json |
| `cli/test/docs-proof.test.ts` | Modify | MCP config shape guard |
| `shell-web/.../AgentStreamView.test.tsx` | New | MCP failure rendering |

---

## References

- [ADR-002: Desktop single-URL](../ADR/ADR-002-desktop-single-url.md)
- [`studio-specs/current/product/spec.md`](../current/product/spec.md) § MCP
- [`studio-specs/current/bridges/flow-runtime.md`](../current/bridges/flow-runtime.md)
- [Cursor MCP docs](https://cursor.com/docs/mcp)
- Tutorial: [`apps/docs/guide/tutorials/01-local-preview-review/`](../../apps/docs/guide/tutorials/01-local-preview-review/)
- Plan reviews: [docs/product](./2026-07-09-mcp-reliability-plan-review-docs-product.md) · [architecture](./2026-07-09-mcp-reliability-plan-review-architecture.md) · [testability](./2026-07-09-mcp-reliability-plan-review-testability.md)
