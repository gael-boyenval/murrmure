# Plan review — Docs, product integrity & CLI commands (deep)

**Reviewer:** senior product architect (docs + product-integrity pass)
**Date:** 2026-07-09
**Plan reviewed:** [2026-07-09-mcp-reliability-plan.md](./2026-07-09-mcp-reliability-plan.md)
**Sibling reviews:** [architecture](./2026-07-09-mcp-reliability-plan-review-architecture.md) · [testability](./2026-07-09-mcp-reliability-plan-review-testability.md)
**Method:** full-repo `rg` sweep of every old-MCP token + read of every product surface (CLI runtime, doctor, scaffold, wizards, hub routes, shell-web Connect, Desktop menu, wake rule, docs, skills, specs, examples). Every claim below was verified against source, not inferred.

---

## Summary verdict

**PASS WITH GAPS** (blocking gaps identified; plan is implementable once the amendments in this review are folded into Phases 2–4).

The plan's target architecture is correct and matches the product north star (hub owns protocol; humans work in ViewCanvasHost, not chat-embedded MCP). Phases 1–4 cover the core code paths. But the plan **under-specifies the breaking-change blast radius**: today roughly the entire onboarding + agent surface — scaffold, doctor, both setup wizards, shell-web Connect, Desktop menu, ~17 docs pages, the bundled agent skill, 7 normative specs, the dogfood repo config, and the hook-wake rule — **emit, teach, or validate the fat shape** (`command: murrmure` + `args: ["mcp"]` + `MURRMURE_HUB_URL` + `MURRMURE_SPACE_ID` + hardcoded `:8787`). Doctor and scaffold are **actively inverted** vs the target (they treat `murrmure-mcp` as *deprecated* and the fat snippet as *canonical*). If the plan ships Phase 1 + Phase 2 without the product sweep, the hub gets schemas and a thin bin while every human-facing path still hands users the broken config the plan set out to kill.

Two findings the prior reviews under-weighted, both **blocking**:

1. **The dogfood repo commits a live grant token.** `/.cursor/mcp.json` contains `MURRMURE_HUB_TOKEN: tok_01KWH3JAHMX02C0N69TSX0GSP6` for `spc_murrmure` — a real, non-placeholder secret in version control. This is the exact "committed tokens" failure the plan cites as motivation, present in the plan's own repo, and it also reproduces ISSUE-07 (agentStudio grant = `spc_murrmure` while Tutorial 1 runs `spc_murrmuretuto`).
2. **The wake path cannot live in a "stateless ~50-line thin bin."** Hook-driven wake (`murrmure_get_pending_wake`, feedback agent, Tutorials 2 & 3) is delivered today via MCP **`createMessage` sampling** + `sendToolListChanged` + `sendLoggingMessage` from `control-session.ts`. Those are **server→client** MCP requests that only the process holding the stdio connection can issue — the hub physically cannot. The plan's "thin bin = discovery + token forwarding, no wake logic" is architecturally impossible **as written** without either (a) keeping a stateful control-session in the bin, or (b) changing the wake contract to poll-only. This must be resolved in Phase 2 design, not discovered during implementation.

---

## Executive synthesis — what breaks if the plan ships as-is

Assume Phase 1 (schemas) + Phase 2 (thin bin + delete fat CLI) merge without the product sweep:

| Surface | Failure at runtime |
|---------|--------------------|
| `mrmr space init` | Still writes `.cursor/mcp.json` from the fat template → committed token + `:8787` + `space_id` in every new space (plan's stated anti-goal). |
| `mrmr space doctor` | `validateMurrmureServer()` flags the **correct** `murrmure-mcp` config as `MCP_LEGACY_COMMAND` and demands `MURRMURE_HUB_URL`/`MURRMURE_SPACE_ID` be present → doctor tells users to *un-migrate*. Passes obsolete fat configs. |
| `mrmr setup` / `mrmr space setup` / grant wizard | `buildMcpConfigSnippet()` emits the fat 3-env snippet → onboarding perpetuates the old shape. |
| shell-web `/connect` (`buildMcpSnippet`) | Copy button hands out fat JSON; primary human onboarding surface contradicts the token-only default. |
| Desktop "Copy MCP config" menu | `menus.ts` copies fat JSON with `space_id` placeholder. |
| Hook wake (feedback agent, Tutorials 2 & 3) | Deleting `packages/cli/src/mcp/*` removes `control-session.ts` → **no more `createMessage` auto-wake, no `.murrmure/pending-wake.json` writes, no `sendToolListChanged`**. `.cursor/rules/murrmure-feedback-wake.mdc` still tells agents to call `murrmure_get_pending_wake`, which no longer exists unless re-homed. Hook-driven tutorials silently stop waking agents. |
| `mrmr mcp` / `murrmure mcp` | `root.ts` still wires `mcp: mcpCommand` and advertises it in help → resurrects the fat path even after files are "deleted." |
| Docs / tutorials (~17 pages) | Teach `murrmure mcp` + 3 env vars; Tutorial 1 `02-install-and-connect.md:103` still shows the pre-rebrand `studio-hub-mcp`. New users reproduce MCP-1/MCP-3. |
| Bundled skill | Agents follow `packages/cli/skill/` as normative → misconfigure MCP + miss wake handling. |
| Specs | 7 normative specs still require `MURRMURE_SPACE_ID` in MCP config → implementers + doc-proof tests re-drift. |
| `murrmure-mcp` bin | **Does not exist in `package.json` `bin`.** Only `dev-hmr-cli.ts` symlinks it (→ fat `mcp.js`). `npm i -g @murrmure/cli` gives users no `murrmure-mcp` at all → the plan's default config points at a missing binary. |

Net: hub is fixed, humans and hooks are broken, and the migration is impossible to complete because doctor/scaffold fight it and the target bin isn't published.

---

## What the plan covers well

- Correct normative target: hub owns catalog/schemas/invoke/handshake; CLI = setup + health; token-only secret; discovery via `shared.json`; global default with project-level opt-in. Aligns with north star (no chat-embedded MCP Apps; humans in ViewCanvasHost).
- Phase 1 `inputSchema` directly kills MCP-2 with a concrete tool list and a measurable acceptance (`feature_build` sends non-empty args, no curl).
- Phase 4 doctor checks (`MCP_CATALOG_LIVE`, `MCP_SCHEMA_PRESENT`, `MCP_TOKEN_SPACE_MATCH`, `MCP_PROBE_INVOKE`) map 1:1 to the open feedback (ISSUE-07, `improvement-cli-doctor`).
- Explicit deletion list for the fat CLI MCP dir + `murrmure mcp` command in success criteria.
- Interim HTTP fallback documented with an explicit sunset note and discovery-URL usage (no hardcoded port).
- Config-inventory table ("what lives where") is genuinely clarifying and should be lifted verbatim into `agents-mcp.md` and `studio-specs/current/cli/spec.md`.
- Out-of-scope table correctly parks MCP Apps and remote/cloud MCP.

---

## Gaps by category

### A. Docs & tutorials

| # | Gap | Files (verified) | Plan phase? |
|---|-----|------------------|-------------|
| A1 | ~17 human docs teach fat `murrmure mcp` + 3 env vars | `apps/docs/guide/agents-mcp.md`, `installation.md`, `cli.md`, `how-it-fits-together.md`, `troubleshooting.md`, `quick-start.md`, `introduction.md`, `desktop.md`, `configuration.md`, `multi-agent-feature-spec.md`, `reference/environment.md`, `reference/mcp-tools.md` | Phase 3 names only `agents-mcp.md` |
| A2 | Tutorial 1 `02-install-and-connect.md:103` still shows **`studio-hub-mcp`** (pre-rebrand, doubly stale) | `apps/docs/guide/tutorials/01-local-preview-review/02-install-and-connect.md`, `02-setup-wizard.md` | Not named |
| A3 | Multi-agent tutorials require **per-repo** `.cursor/mcp.json` with distinct `MURRMURE_SPACE_ID` per window — legitimate multi-space case, but must be reframed as token-only `--local` opt-in, not fat 3-env snippets | `tutorials/02-multi-agent-brief/03-connect-agents.md`, `tutorials/03-daily-brief-trigger/03-connect-agent.md`, `guide/multi-agent-feature-spec.md` | Not named |
| A4 | No doc guardrail test for config **shape** — `docs-proof.test.ts` VS-8 only bans removed *tool names*, not `"args": ["mcp"]` / `MURRMURE_SPACE_ID` in MCP examples | `packages/cli/test/docs-proof.test.ts` (VS-8 block, lines 183–190) | Not named |
| A5 | `known-gaps.md` (human + skill, kept in sync by 10-U4 test) has no MCP-reliability track note | `apps/docs/guide/known-gaps.md`, `packages/cli/skill/reference/known-gaps.md` | Not named |

### B. Skills & rules

| # | Gap | Files (verified) | Plan phase? |
|---|-----|------------------|-------------|
| B1 | Bundled agent skill teaches old env model + per-repo paste | `packages/cli/skill/SKILL.md` (`MURRMURE_SPACE_ID`), `reference/cli.md`, `reference/wizards.md`, `reference/actions-executors.md`, `reference/mcp.md`, `reference/troubleshooting.md` | Phase 3 partial (`reference/mcp.md` HTTP only) |
| B2 | Feedback-wake rule instructs `murrmure_get_pending_wake` + `.murrmure/pending-wake.json` — both owned by the fat CLI today; will dangle after deletion | `.cursor/rules/murrmure-feedback-wake.mdc` | Not named |
| B3 | Skill-eval fixture encodes fat setup expectations | `packages/cli/test/skill-eval/mcp-setup.json` | Not named |

### C. Specs (normative)

| # | Gap | Files (verified) | Plan phase? |
|---|-----|------------------|-------------|
| C1 | `cli/spec.md` describes `murrmure-mcp` as "(unchanged)" separate binary and wizards emitting the MCP snippet | `studio-specs/current/cli/spec.md` | Cited, not scheduled |
| C2 | `hub/contracts.md` lists `MURRMURE_SPACE_ID` as "Yes (MCP)" | `studio-specs/current/hub/contracts.md` | Not named |
| C3 | `bridges/action-invoke.md` requires `MURRMURE_SPACE_ID` (executor env — correct) but doesn't split executor-env vs MCP-config-env | `studio-specs/current/bridges/action-invoke.md` | Not named |
| C4 | `product/spec.md` §10.9 "agents connect via `@murrmure/cli` stdio bridge" | `studio-specs/current/product/spec.md` | Cited, not scheduled |
| C5 | `bridges/flow-runtime.md` — MCP stdio handshake v2 needs thin-bin ownership note | `studio-specs/current/bridges/flow-runtime.md` | Cited, not scheduled |
| C6 | `build-capability/02-sdk.md` documents `murrmure mcp` (BC7) | `studio-specs/current/build-capability/02-sdk.md` | Not named |
| C7 | `build-capability/07-mcp-tool-model-and-catalog-rebuild.md` — "mcp_wake (unchanged)" + platform-tools table; needs a note that wake delivery re-homes to thin bin/hub in this track (and stale `@studio/`/`get_space_state` scope names should be flagged, low-pri) | `studio-specs/current/build-capability/07-mcp-tool-model-and-catalog-rebuild.md` | Not named |
| C8 | `overview.md` MCP path wording | `studio-specs/current/overview.md` | Not named |
| C9 | Product-plan tracker + docs-proof plan have no MCP-reliability section | `studio-specs/plans/product/plan/00-doc-skill-mcp-tracker.md`, `.../10-docs-and-proof.md`, `.../08-cli-setup-wizards.md` | Not named |

### D. CLI commands (all commands audited)

| # | Command / lib | Current behavior (verified) | Required change | Plan phase? |
|---|---------------|-----------------------------|-----------------|-------------|
| D1 | `mcp` subcommand | `commands/mcp.ts`; wired in `root.ts` (`mcp: mcpCommand`) + advertised in root help string | **Delete** subcommand, import, help text | Phase 2 (import/help not named) |
| D2 | `space doctor` / `doctor` | `space-doctor-mcp.ts` `buildMcpConfigSnippet()` emits fat 3-env; `validateMurrmureServer()` (lines 342–370) treats `murrmure`+`["mcp"]` as **canonical** and flags `murrmure-mcp` as **deprecated**; requires `MURRMURE_HUB_URL` (`MCP_MISSING_HUB_URL`) + `MURRMURE_SPACE_ID` (`MCP_MISSING_SPACE_ID`) | **Invert**: canonical = `murrmure-mcp` + token env only; error on fat shape; drop URL/space_id requirements; keep only real placeholder/token checks. `probeMcpCatalog()` should stop sending `space_id` query. | Phase 4 (must move earlier — see amendments) |
| D3 | `setup` / `space setup` | Mint grant + print project-local paste target | Output `export MURRMURE_HUB_TOKEN=…`; default write `~/.cursor/mcp.json`; `--local` opt-in | Phase 3 partial |
| D4 | grant wizard | `wizard/grant.ts` calls `buildMcpConfigSnippet({hubUrl, token, spaceId})` | New minimal snippet (token only) | Phase 3 partial |
| D5 | `grant mint` | Mints token; snippet output fat | Print export + offer global write | Phase 3 |
| D6 | `grant use` | **Does not exist** | New command + `~/.murrmure/grants/` storage + `whoami` integration | Proposed only — unscoped |
| D7 | `space init` | `space-scaffold.ts` copies `templates/space/.cursor/mcp.json` (fat) into every new repo; test asserts it | Stop writing repo `mcp.json` (or write README pointer); update test | Phase 3 "stop scaffolds" (test not named) |
| D8 | env resolution | `mcp/env.ts` accepts aliases `MURRMURE_API_URL`, `MURRMURE_API_TOKEN`, `MURRMURE_TOKEN` + hardcoded `:8787` fallback | Thin bin: token env only, discovery for URL; **do not** re-import the alias fallbacks ("compat layer" anti-pattern) | Not named |

### E. Product surfaces (shell-web, Desktop, examples, dogfood)

| # | Surface | Current (verified) | Plan phase? |
|---|---------|--------------------|-------------|
| E1 | shell-web `/connect` | `McpSnippetCard.tsx` `buildMcpSnippet()` + `ConnectPage.tsx` emit fat JSON (`command: murrmure`, `args:["mcp"]`, 3 env) | Not named |
| E2 | shell-web stories/snapshots | `stories/pages/ConnectPrototype.tsx`, `stories/pages.stories.snapshots/connect-agent-setup.critique.md` | Not named |
| E3 | Desktop menu | `apps/desktop/src/menus.ts` `buildMcpConfigSnippet()` copies fat JSON | Not named |
| E4 | Dev tooling / bin | `dev-hmr-cli.ts` maps `murrmure-mcp`/`mrmr-mcp` → fat `mcp.js`; `package.json` has **no** `murrmure-mcp` bin; `exports["./mcp"]` + `tsup` build fat `dist/mcp.js` | Not named |
| E5 | **Dogfood repo config commits a live token** | `/.cursor/mcp.json` → `tok_01KWH3JAHMX02C0N69TSX0GSP6`, `spc_murrmure`, `:8787` | Not named |
| E6 | Examples reference tree | `examples/flows/preview-review-v2/{README.md,agent.md}` (Tutorial 1 reference), `team-brief-v2`, `daily-brief-v2` READMEs; `actions.yaml` `--approve-mcps`; `hooks.yaml` `mcp_wake` | Not named (runtime unaffected; connect docs need note) |

### F. Hooks / wake path (blocking product integrity)

| # | Gap | Files (verified) |
|---|-----|------------------|
| F1 | Wake delivery uses MCP **`createMessage` sampling** + `sendToolListChanged` + `sendLoggingMessage` + writes `.murrmure/pending-wake.json` + persists ack-seq/client-id under `~/.murrmure/mcp-sessions/`. This is a **stateful MCP-server session**, not stateless proxying. Deleting `control-session.ts` without re-homing this breaks hook auto-wake. | `packages/cli/src/mcp/control-session.ts`, `main.ts` (PENDING_WAKE_TOOL, server `instructions`), `pending-wake.ts`, `wake-prompt.ts` |
| F2 | Hub has the handshake route but no `murrmure_get_pending_wake` tool and cannot issue `createMessage` (server→client) | `packages/hub-daemon/src/routes/mcp/index.ts`, `mcp-wake-dispatcher.ts` |
| F3 | Feedback rule + skill instruct the tool/file that will dangle | `.cursor/rules/murrmure-feedback-wake.mdc`, `packages/cli/skill/reference/mcp.md` |

**Design decision the plan must make explicit (Phase 2):** either
- **(a) Thin bin keeps a control-session** (handshake poll + `createMessage` + `sendToolListChanged` + pending-wake file). Then "thin" ≈ 200–300 lines and the "~50-line, no wake logic" framing in the plan is wrong and must be rewritten; or
- **(b) Move to poll-only wake**: hub exposes `murrmure_get_pending_wake` as a real hub tool, thin bin forwards it, agents must **proactively poll** (the rule/skill already say "call on connect"), and auto-`createMessage` push is dropped. This is simpler and truly stateless but **weakens hook-driven auto-wake** — a product regression that must be signed off, and the wake rule/tutorials updated to say "poll, we no longer push."

The plan currently implies (b)'s simplicity with (a)'s behavior expectations. Pick one and write the acceptance test.

### G. Hub API shims

| # | Gap | Files (verified) |
|---|-----|------------------|
| G1 | `routes/mcp/index.ts` reads `space_id` from query/body/header on catalog + tools/call. For non-bootstrap tokens it already uses `auth.space_id` (line 28: `auth.space_id === "bootstrap" ? space_id : auth.space_id`), so the token-only model is *mostly* enforced — but the param is still accepted, and the fat bin + doctor + `probeMcpCatalog` still send it, keeping the ISSUE-07 mismatch surface alive. | `packages/hub-daemon/src/routes/mcp/index.ts` |
| G2 | `mcp-handlers.ts` loopback `hubUrl()` self-fetch + `MURRMURE_SPACE_ID` fallback | `packages/hub-daemon/src/mcp-handlers.ts` |

---

## Breaking changes matrix

| Change | Surfaces affected | Plan covers? | Phase to add | Acceptance criterion |
|--------|-------------------|--------------|--------------|----------------------|
| Remove `murrmure mcp` / `mrmr mcp` subcommand | `commands/mcp.ts`, `root.ts` (wire + help), docs, skill | Partial (files, not wiring) | **Phase 2** | `rg "mcp: mcpCommand\|mrmr mcp" packages/cli/src` = 0; `mrmr --help` shows no `mcp` |
| Delete `packages/cli/src/mcp/*` | `exports["./mcp"]`, `tsup`, `dist/mcp.js` | Partial | **Phase 2** | dir gone; `package.json` `exports` has no `./mcp`; `tsup.config.ts` builds no fat mcp entry |
| Publish `murrmure-mcp` bin (thin) | `package.json` `bin`, npm, `dev-hmr-cli.ts` | Partial | **Phase 2** | `which murrmure-mcp` succeeds after `npm i -g`; `dev-hmr-cli.ts` points at bridge output |
| MCP config → token only | scaffold template, `space-scaffold`, `McpSnippetCard`, `ConnectPage`, stories, `menus.ts`, doctor snippet, wizard | Partial (Phase 3, list incomplete) | **Phase 2/3** | every generator emits `{command:"murrmure-mcp", env:{MURRMURE_HUB_TOKEN}}`; no URL/space_id/port anywhere |
| Stop scaffolding repo `.cursor/mcp.json` | `space-scaffold.ts`, `templates/space/.cursor/mcp.json`, `space-init.test.ts` | Mentioned | **Phase 3** | `mrmr space init` creates no `.cursor/mcp.json`; test updated |
| Invert doctor canonical shape | `space-doctor-mcp.ts`, `space-doctor-mcp.test.ts` | **No (inverted today)** | **Phase 2** (before Phase 4 live checks) | doctor errors on `args:["mcp"]`; accepts only `murrmure-mcp`+token; tests rewritten |
| `MURRMURE_SPACE_ID` out of MCP config (kept for CLI/executor) | 17 docs, doctor, `environment.md`, specs | Mentioned | **Phase 3** | `environment.md` splits "CLI/executor env" vs "MCP agent env (token only)" |
| Re-home wake (`get_pending_wake`, createMessage, pending-wake.json) | fat CLI, hub, thin bin, wake rule, hook tutorials | Partial | **Phase 2** | hook wake E2E passes with only `murrmure-mcp` + Desktop (no `murrmure mcp`); rule/skill updated |
| `inputSchema` on catalog tools | hub registry, agents | **Yes** | Phase 1 | catalog has non-empty `inputSchema.properties.run_id` for `resolve_step` |
| `mrmr grant use` (new) | CLI, `~/.murrmure/grants/`, multi-space docs | Proposed only | **Phase 3** | switch `spc_murrmuretuto`↔`spc_murrmure` changes effective token with no `mcp.json` edit |
| Drop hub `space_id` param for agent grants | `routes/mcp/index.ts`, `hub/contracts.md`, `flow-runtime.md` | No | **Phase 2/3** | non-bootstrap tokens ignore query/body `space_id`; documented bootstrap-only exception |
| Rotate + un-commit dogfood token | `/.cursor/mcp.json` | No | **Phase 0 (immediate)** | token revoked/rotated; repo config migrated or gitignored; no live `tok_` in tree |
| Close MCP feedback files | `feedbacks/2026-07-07-*.md` | Yes (exit) | exit | 3 files closed with PR links |

---

## Complete file inventory

Legend — **State**: `FAT` = emits/teaches/validates old shape; `INVERTED` = actively opposes target; `RUNTIME` = fat runtime code; `SECRET` = committed credential; `OK` = correct; `MISSING` = target artifact absent.

### CLI — runtime, commands, onboarding

| Path | State | Plan mentions? | Required action |
|------|-------|----------------|-----------------|
| `packages/cli/src/mcp/main.ts` | RUNTIME | Yes (delete) | Delete; move wake semantics to thin bin/hub |
| `packages/cli/src/mcp/control-session.ts` | RUNTIME | Yes (delete) | **Decide (a)/(b) wake model first** — this holds createMessage/handshake |
| `packages/cli/src/mcp/env.ts` | FAT (aliases + `:8787`) | Partial | Replace with token-only reader; no alias fallbacks |
| `packages/cli/src/mcp/pending-wake.ts` | RUNTIME | No | Re-home to thin bin (option a) or delete (option b) |
| `packages/cli/src/mcp/wake-prompt.ts` | RUNTIME | No | Re-home with wake path or move formatting to hub |
| `packages/cli/src/mcp.ts` | RUNTIME entry | No | Replace with thin-bridge entry or delete |
| `packages/cli/src/commands/mcp.ts` | RUNTIME | Yes | Delete |
| `packages/cli/src/commands/root.ts` | FAT (`mcp: mcpCommand`, help) | No | Remove import, wiring, help text |
| `packages/cli/package.json` | MISSING `murrmure-mcp` bin; `exports["./mcp"]` | Partial | Add thin bin; drop `./mcp` export |
| `packages/cli/tsup.config.ts` | builds fat `mcp.js` | No | Point at thin entry / drop fat |
| `packages/cli/src/lib/space-doctor-mcp.ts` | INVERTED | Yes | Invert canonical/deprecated; drop URL/space_id checks; split snippet-writer vs probes |
| `packages/cli/src/lib/space-doctor.ts` | FAT scan paths | Partial | Scan global + project `mcp.json`; token↔link match |
| `packages/cli/src/lib/space-doctor-print.ts` | FAT print | No | Print thin snippet; global vs project |
| `packages/cli/src/lib/space-scaffold.ts` | FAT (writes mcp.json) | Partial | Stop writing repo `.cursor/mcp.json` |
| `packages/cli/templates/space/.cursor/mcp.json` | FAT (untracked new file) | No | Remove or replace with README pointer |
| `packages/cli/src/wizard/grant.ts` | FAT snippet | Partial | New snippet shape |
| `packages/cli/src/commands/setup.ts` | FAT paste UX | Partial | Export token + global write + `--local` |
| `packages/cli/src/commands/space/setup.ts` | FAT paste UX | Partial | Same |
| `packages/cli/src/commands/space/grant.ts` | FAT mint output | Partial | Mint output + `grant use` |
| `packages/cli/src/commands/doctor.ts` | no MCP checks | Partial | Wire MCP live checks or cross-link |
| `packages/cli/src/auth.ts`, `src/lib/space-id.ts`, `src/lib/auth-source.ts` | uses `MURRMURE_SPACE_ID` (CLI — correct) | No | Keep; document as CLI-only, not MCP |

### CLI — tests

| Path | State | Action |
|------|-------|--------|
| `packages/cli/test/space-doctor-mcp.test.ts` | INVERTED (asserts fat canonical, murrmure-mcp legacy) | Rewrite canonical → thin |
| `packages/cli/test/space-init.test.ts` | expects `.cursor/mcp.json` | Remove expectation |
| `packages/cli/test/wizard/setup.test.ts` | fat snippet asserts | New snippet asserts |
| `packages/cli/test/mcp-control-session.test.ts` | tests fat control session | Migrate with wake decision |
| `packages/cli/test/skill-eval/mcp-setup.json` | fat setup expectations | Update |
| `packages/cli/test/docs-proof.test.ts` | no config-shape guard | Add `args:["mcp"]`/`MURRMURE_SPACE_ID` bans + require `murrmure-mcp` |
| `packages/cli/test/wizard/onboard.test.ts`, `space-doctor.test.ts` | reference fat env | Update fixtures |

### Hub

| Path | State | Action |
|------|-------|--------|
| `packages/hub-daemon/src/mcp-tool-registry.ts` | needs schemas | Phase 1 inputSchema builders |
| `packages/hub-daemon/src/routes/mcp/index.ts` | accepts `space_id` param | Ignore for non-bootstrap; add `get_pending_wake` if option (b) |
| `packages/hub-daemon/src/mcp-handlers.ts` | loopback + space_id fallback | Direct calls; review fallback |
| `packages/hub-daemon/src/mcp-wake-dispatcher.ts` | wake source | Ensure thin-bin handshake registration; sign off push vs poll |
| `packages/hub-daemon/src/main.ts` | `MURRMURE_SPACE_ID` refs | Review |

### Docs (`apps/docs/`)

`agents-mcp.md`, `installation.md`, `cli.md`, `how-it-fits-together.md`, `troubleshooting.md`, `quick-start.md`, `introduction.md`, `desktop.md`, `configuration.md`, `multi-agent-feature-spec.md`, `agent-skill.md`, `reference/environment.md`, `reference/mcp-tools.md`, `known-gaps.md`, `tutorials/01-local-preview-review/02-setup-wizard.md`, `tutorials/01-local-preview-review/02-install-and-connect.md` (**`studio-hub-mcp`**), `tutorials/02-multi-agent-brief/03-connect-agents.md`, `tutorials/03-daily-brief-trigger/03-connect-agent.md` — all **FAT**; Phase 3 names only `agents-mcp.md`. Action: full sweep + rewrite; `ripgrep` guardrail.

### Skills & rules

`packages/cli/skill/SKILL.md`, `reference/mcp.md`, `reference/cli.md`, `reference/wizards.md`, `reference/actions-executors.md`, `reference/troubleshooting.md`, `reference/known-gaps.md`; `.cursor/rules/murrmure-feedback-wake.mdc`; `.cursor/skills/feedback-triage/SKILL.md` (if MCP referenced) — **FAT / wake-dependent**. Action: env + connect flow + wake decision.

### Specs

`studio-specs/current/cli/spec.md`, `hub/contracts.md`, `product/spec.md` (§10.9), `bridges/flow-runtime.md`, `bridges/action-invoke.md`, `build-capability/02-sdk.md`, `build-capability/07-mcp-tool-model-and-catalog-rebuild.md`, `overview.md`; plans `product/plan/00-doc-skill-mcp-tracker.md`, `08-cli-setup-wizards.md`, `10-docs-and-proof.md`. Action: spec reconciliation PR; tracker row.

### Product UI & Desktop

`packages/shell-web/src/components/McpSnippetCard.tsx`, `routes/ConnectPage.tsx`, `stories/pages/ConnectPrototype.tsx`, `stories/pages.stories.snapshots/connect-agent-setup.critique.md`, `apps/desktop/src/menus.ts`, `apps/desktop/scripts/dev-hmr-cli.ts` — **FAT / bin-mapping**. Action: thin snippet + bin repoint.

### Examples & repo config

`/.cursor/mcp.json` (**SECRET — live token**), `README.md`, `CHANGELOG.md`, `examples/flows/{preview-review-v2,team-brief-v2,daily-brief-v2}/README.md`, `examples/flows/preview-review-v2/agent.md`. Action: rotate + migrate dogfood token now; docs note on examples; CHANGELOG breaking entry.

### Feedbacks (closure)

`feedbacks/2026-07-07-failure-cursor-mcp-bridge-callmcptool.md`, `-improvement-mcp-discovery.md`, `-improvement-cli-doctor.md` — close with PR links (plan exit).

### Legacy / low-priority

`scripts/migrate-docs-murrmure.mjs`, `scripts/migrate-murrmure-rebrand.mjs`, `scripts/sync-fixture-agent.mjs`, `studio-specs/archives/**` — leave unless linked from active docs; optionally add a fat-config auto-fix codemod.

---

## Recommended plan amendments

Each is numbered with a phase assignment and a single measurable acceptance criterion. Amendments A0–A3 are **blocking**; the rest are ordered by product-integrity risk.

**A0 — Rotate & un-commit the dogfood grant token.** *Phase 0 (immediate, before any code).*
Acceptance: `tok_01KWH3JAHMX02C0N69TSX0GSP6` revoked via `mrmr grant`; `/.cursor/mcp.json` migrated to thin shape (or gitignored + documented); `rg "tok_[0-9A-Z]{20,}" -- ':!*.md'` returns no live grant in tracked files.

**A1 — Resolve the wake architecture (push vs poll) before deleting the fat CLI.** *Phase 2 design gate.*
Acceptance: plan states explicitly whether the thin bin retains a control-session (`createMessage`/`sendToolListChanged`/pending-wake writes) — option (a) — or wake becomes poll-only via a hub `murrmure_get_pending_wake` tool — option (b); an E2E test proves a `mcp_wake` hook (Tutorial 3) delivers to the agent with **only** `murrmure-mcp` + Desktop running, no `murrmure mcp` subprocess.

**A2 — MCP-CUTOVER as a single atomic milestone at end of Phase 2.** *Phase 2.*
Acceptance: one merge removes `mcp: mcpCommand` + help text, deletes `packages/cli/src/mcp/*` + `exports["./mcp"]`, ships the `murrmure-mcp` bin in `package.json`, and flips doctor to error on the fat shape — CI `rg` guard proves no `args: ["mcp"]` producer remains in `packages/cli/src`.

**A3 — Publish the `murrmure-mcp` bin and repoint dev tooling.** *Phase 2.*
Acceptance: `package.json` `bin` includes `murrmure-mcp`; `which murrmure-mcp` succeeds after `npm i -g @murrmure/cli`; `dev-hmr-cli.ts` links `murrmure-mcp` to the thin build output, not `mcp.js`.

**A4 — Flip doctor canonical shape + rewrite its tests (moved earlier than Phase 4).** *Phase 2.*
Acceptance: `space-doctor-mcp.ts` accepts only `command:"murrmure-mcp"` + `MURRMURE_HUB_TOKEN`; emits `error` for `command:"murrmure"`/`args:["mcp"]` and for `MURRMURE_HUB_URL`/`MURRMURE_SPACE_ID` in `mcp.json`; `space-doctor-mcp.test.ts` canonical case is the thin snippet; `probeMcpCatalog` sends no `space_id`.

**A5 — Stop scaffolding repo `.cursor/mcp.json`.** *Phase 3.*
Acceptance: `space-scaffold.ts` writes no `.cursor/mcp.json`; template removed or replaced with a README pointer to `mrmr grant mint`; `space-init.test.ts` asserts absence.

**A6 — Rewrite all snippet generators to the thin shape.** *Phase 2/3.*
Acceptance: `buildMcpConfigSnippet` (doctor), `wizard/grant.ts`, `McpSnippetCard.buildMcpSnippet`, `ConnectPage`, `menus.ts` all emit `{ "mcpServers": { "murrmure": { "command": "murrmure-mcp", "env": { "MURRMURE_HUB_TOKEN": "…" } } } }`; a shared snapshot test asserts byte-identical shape across CLI + shell-web + Desktop.

**A7 — Docs & tutorial sweep with a shape guardrail.** *Phase 3 (blocking for tutorial exit).*
Acceptance: `rg 'murrmure mcp|args.*\["mcp"\]|MURRMURE_SPACE_ID|MURRMURE_HUB_URL|studio-hub-mcp' apps/docs` returns zero hits outside archive/known-gaps; `docs-proof.test.ts` gains a config-shape assertion (bans `"args": ["mcp"]` in MCP examples, requires `murrmure-mcp`) mirroring the existing VS-8 block.

**A8 — Bundled skill + wake rule refresh.** *Phase 3 (paired with A1).*
Acceptance: `SKILL.md` + `reference/{mcp,cli,wizards,actions-executors,troubleshooting}.md` teach token-only global config + the chosen wake model; `.cursor/rules/murrmure-feedback-wake.mdc` matches the A1 decision; `skill-eval/mcp-setup.json` updated.

**A9 — `mrmr grant use` command + storage.** *Phase 3.*
Acceptance: `grant use --space spc_…` writes/selects `~/.murrmure/grants/…`, updates the active token surfaced by `mrmr whoami`, and switching spaces needs no `mcp.json` edit; documented in `cli.md` + skill.

**A10 — Multi-space narrative for global vs `--local`.** *Phase 3.*
Acceptance: `agents-mcp.md` + Tutorials 2/3 present token-switch (global) and `--local` per-repo (token only, no `space_id` env) as the two supported multi-space paths; three-space workflow works both ways.

**A11 — Spec reconciliation PR + tracker row.** *Phase 3/4.*
Acceptance: no spec in `studio-specs/current/**` requires `MURRMURE_SPACE_ID` in MCP config or calls `murrmure-mcp` "(unchanged)"; `00-doc-skill-mcp-tracker.md` has an "MCP reliability (2026-07-09)" section with one checkbox per artifact.

**A12 — Split executor-env vs MCP-agent-env in `environment.md`.** *Phase 3.*
Acceptance: `reference/environment.md` has two tables — "CLI/executor env" (keeps `MURRMURE_SPACE_ID`, injected by `shell-spawn.ts`) and "MCP agent env (token only)" — with a one-line "these are different" callout.

**A13 — Drop hub `space_id` param for agent grants.** *Phase 2/3.*
Acceptance: `routes/mcp/index.ts` ignores query/body `space_id` unless the token is `bootstrap`; `hub/contracts.md` documents the bootstrap-only exception; no generator or doctor sends `space_id`.

**A14 — CHANGELOG breaking-change entry + optional codemod.** *Release.*
Acceptance: `CHANGELOG.md` documents removal of `murrmure mcp` + `MURRMURE_HUB_URL`/`MURRMURE_SPACE_ID` from MCP config and the new `murrmure-mcp` bin; optionally `mrmr space doctor --fix` rewrites a detected fat `mcp.json`.

**A15 — Delete the interim HTTP-fallback doc at cutover.** *Phase 2 exit.*
Acceptance: the curl section in `packages/cli/skill/reference/mcp.md` is removed once MCP-CUTOVER (A2) lands; no doc presents curl as an equal path.

---

## Definition of done — product integrity checklist

Ship-blocking unless explicitly deferred in `known-gaps.md`.

- [ ] No live grant token in any tracked file (`/.cursor/mcp.json` rotated + migrated).
- [ ] `rg "args: \[\"mcp\"\]"` across `packages/**/src`, `apps/**/src`, templates = 0 producers.
- [ ] `which murrmure-mcp` resolves after `npm i -g @murrmure/cli`; `package.json` ships the bin.
- [ ] `murrmure mcp` / `mrmr mcp` removed from `root.ts`, help, docs, skill (no alias/hidden subcommand).
- [ ] `packages/cli/src/mcp/` deleted; no `exports["./mcp"]`; no fat `dist/mcp.js`.
- [ ] Wake model decided (A1) and an E2E hook-wake test passes with only `murrmure-mcp` + Desktop.
- [ ] `.cursor/rules/murrmure-feedback-wake.mdc` matches the shipped wake model.
- [ ] Doctor: canonical = `murrmure-mcp` + token; errors on fat shape; tests rewritten; `probeMcpCatalog` sends no `space_id`.
- [ ] `mrmr space init` creates no `.cursor/mcp.json`; template removed/repointed; test updated.
- [ ] All snippet generators (CLI doctor, wizard, shell-web Connect, Desktop menu) emit byte-identical thin snippet (shared snapshot test).
- [ ] `rg 'murrmure mcp|MURRMURE_SPACE_ID|MURRMURE_HUB_URL|studio-hub-mcp' apps/docs` = 0 outside archive; `docs-proof.test.ts` enforces config shape.
- [ ] Bundled skill teaches token-only global config + wake model; `skill-eval/mcp-setup.json` green.
- [ ] `mrmr grant use` implemented, tested, documented; multi-space works without editing `mcp.json`.
- [ ] No `studio-specs/current/**` spec requires `MURRMURE_SPACE_ID` in MCP config; tracker row added.
- [ ] `environment.md` splits executor-env vs MCP-agent-env.
- [ ] Hub ignores `space_id` for non-bootstrap tokens; `hub/contracts.md` updated.
- [ ] CHANGELOG breaking entry present.
- [ ] Tutorial 1 Part 2 + `feature_build` pass with global thin config, no curl fallback.
- [ ] Three MCP feedback files closed with PR links; interim HTTP-fallback doc deleted.

---

*End of review. Cross-check with the [architecture](./2026-07-09-mcp-reliability-plan-review-architecture.md) review (MCP-CUTOVER, package boundary, wake ownership) and [testability](./2026-07-09-mcp-reliability-plan-review-testability.md) review — this pass focuses on docs, product surfaces, CLI commands, and the wake/dogfood integrity risks those reviews touch only lightly.*
