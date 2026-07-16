# Plan review — Architecture & zero compatibility debt (deep pass)

**Reviewer:** architecture agent
**Date:** 2026-07-09
**Plan reviewed:** [2026-07-09-mcp-reliability-plan.md](./2026-07-09-mcp-reliability-plan.md)
**Sibling reviews:** [testability](./2026-07-09-mcp-reliability-plan-review-testability.md) · [docs/product](./2026-07-09-mcp-reliability-plan-review-docs-product.md)
**Method:** Full read of plan + prior review, then live code audit of every file in the mandate (CLI `src/mcp/*`, hub `routes/mcp/`, `mcp-handlers.ts`, `mcp-tool-registry.ts`, `mcp-wake-dispatcher.ts`, `control-bus.ts`, `auth.ts`, `space-doctor-mcp.ts`, `package.json`, `tsup.config.ts`, `dev-hmr-cli.ts`, `space-scaffold.ts`, templates, specs, and the repo's own live `.cursor/mcp.json`).

---

## Summary verdict

**FAIL — CANNOT SHIP AS WRITTEN.** Not because the target architecture is wrong (it is correct: hub owns protocol, thin stdio adapter, discovery over config, token-only identity), but because **the plan describes the target and stops** — it does not contain a normative package decision, a single hard-cutover milestone, or an instruction to fix the parts of the codebase that are *actively working against* the target right now.

The gap between "today" and "target" is worse than the prior review captured, because **new compatibility debt was added to the tree in this very diff**, in the opposite direction the plan wants:

1. `packages/cli/templates/space/.cursor/mcp.json` is a **brand-new, currently-untracked file** (`??` in git status) that scaffolds the fat, three-env-var, `murrmure mcp` shape into every new space repo — the exact shape the plan calls "to be replaced." It is wired live through `space-scaffold.ts`.
2. `packages/cli/test/space-doctor-mcp.test.ts` has a test literally named **"flags deprecated murrmure-mcp binary"** and another named **"accepts canonical murrmure mcp config"** that asserts the fat 3-env shape produces **zero warnings**. The test suite actively encodes the inverse of the plan's target and will regress-test against the correct fix.
3. `studio-specs/current/cli/spec.md` (a normative spec, not a draft) states: *"Separate binary: `murrmure-mcp` / `mrmr-mcp` — MCP stdio server (**unchanged**)."* This is a standing product commitment to keep two bin aliases and to treat the current fat/absent-bin state as correct. The plan does not touch this document, so shipping Phase 2 leaves the spec self-contradicting the code.
4. The repo's own root `.cursor/mcp.json` (dogfooding config) uses the fat shape today (`command: murrmure`, `args: ["mcp"]`, three env vars) — confirming this is not a hypothetical legacy path, it is the **currently exercised** path for this very session's tools.
5. `packages/cli/package.json` has **no `murrmure-mcp` bin at all** today — despite `dev-hmr-cli.ts` symlinking `murrmure-mcp`/`mrmr-mcp` → `dist/mcp.js` and specs referencing it. The thin bin the plan requires does not exist as a package artifact anywhere; only the fat `dist/mcp.js` (built from `src/mcp.ts` → `src/mcp/main.ts`) exists under that build entry name.

The plan's phases are individually sound but are written as **additive milestones with soft, non-blocking language** ("Delete fat CLI MCP" appears as a bullet inside Phase 2's *work* list, not as an exit gate; Phase 3 says "stop scaffolds from auto-committing" without naming the specific file to delete; Phase 5 explicitly keeps the thin bin as a **"legacy fallback"** with no sunset date). Without a hard, single-PR cutover gate and an explicit kill list, this plan will ship Phase 1 schemas correctly and then let the fat CLI, the inverted doctor, the fat scaffold template, and the two-bin spec commitment coexist indefinitely — which is precisely the "compatibility debt forever" failure mode the mandate asks to prevent.

**Verdict detail:** target architecture = **PASS**. Plan-as-executable-spec for zero compatibility debt = **FAIL**. Requires the amendments in this document before implementation starts.

---

## Architecture principles scorecard

| Principle | Embedded in plan? | Evidence (plan) | Gap (live code) | Fix |
|---|---|---|---|---|
| **Hub owns protocol** | Yes | Layer diagram §Target architecture; catalog/invoke/handshake all in `hub-daemon` | `mcp-handlers.ts` implements every platform tool as a **loopback HTTP call to itself** (`hubUrl() = http://127.0.0.1:${config.port}`) instead of calling hub-core/route logic directly in-process. This is hub-internal, not CLI-facing, but it violates "hub owns protocol" at the boundary the plan draws — protocol logic is scattered across an HTTP self-call instead of one code path. | Phase 2 or later: `mcp-handlers.ts` calls the same in-process functions the HTTP routes call (extract handler bodies to shared functions), not `fetch()` against its own port. Not blocking for MCP-1/2/3 but is real "hub owns protocol" debt the plan should log even if deferred. |
| **Thin adapter (stdio↔HTTP only)** | Yes | "~50–100 line bin... no catalog rebuild, no wake logic" | `packages/cli/src/mcp/main.ts` + `control-session.ts` + `wake-prompt.ts` + `pending-wake.ts` = **~460 lines** of catalog caching, handshake polling, ack-seq persistence, prompt templating, and MCP `Server` sampling calls (`createMessage`). None of this is "proxy"; it is a second protocol implementation. | Package must not just be "smaller" — it must be re-architected so the **hub returns pre-rendered, ready-to-forward payloads** (tool list with schemas, wake text already formatted) and the bin does zero decision-making beyond stdio↔HTTP framing + writing the one local file it uniquely can write (see Wake cutover spec below). |
| **Discovery over config** | Yes | No `MURRMURE_HUB_URL` / port in target snippet; `shared.json` is source of truth | `packages/cli/src/mcp/env.ts::readHubUrl()` defaults to hardcoded `http://127.0.0.1:8787` and reads `MURRMURE_HUB_URL`/`MURRMURE_API_URL` from env — **discovery file is never read** by the fat bridge today. Doctor's `buildMcpConfigSnippet()` also hardcodes `8787` as its fallback. | New bridge package must read `~/.murrmure/hubs/shared.json` exclusively; delete `readHubUrl()`/`MURRMURE_HUB_URL`/`MURRMURE_API_URL` entirely, not "deprioritize" them. |
| **Token-based auth (space from token)** | Yes | No `MURRMURE_SPACE_ID` in target snippet; `TokenContext.space_id` from bearer | `env.ts::readSpaceId()` + `main.ts` **hard-requires** `MURRMURE_SPACE_ID` (`throw` if absent) and sends it as `?space_id=` on every catalog/invoke/handshake call. Hub's `requireToken()` already supports token-only resolution (space comes from `token.space_id` when no `pathSpaceId` given) — the **client-side requirement is pure legacy**, the server already does the right thing. | Delete `readSpaceId()` and all `space_id` query params from the new bridge. This is the single easiest, highest-value deletion in the entire plan — the hub-side work is *already done*. |
| **No fat CLI for MCP runtime** | Yes (success criteria #1) | "murrmure mcp removed; packages/cli/src/mcp/ deleted" | Not just present but **actively growing**: new fat-shape template (`templates/space/.cursor/mcp.json`) added in this diff; `commands/root.ts` description string still advertises `` `mrmr mcp` `` in the CLI's own `--help` banner. | Add explicit negative-space CI gate (see Post-plan checklist) so this can never silently regrow. |
| **Single responsibility / package boundaries** | Partial | CLI keeps setup+doctor; hub keeps protocol; bin location left as 3 options | `space-doctor-mcp.ts` is 472 lines doing **five** jobs: config discovery, snippet generation, static validation (inverted), live catalog probing, and space-mismatch checks. `packages/cli/package.json` still exports `"./mcp": "./dist/mcp.js"` as a programmatic entrypoint alongside the `mcp` subcommand — two public surfaces for one thing that should not exist as a CLI surface at all. | Normative single package choice below; split doctor file into `mcp-config-scan.ts` (static) + `mcp-live-probe.ts` (network) + delete `buildMcpConfigSnippet`'s fat-shape default. |
| **Breaking changes handled cleanly (delete, not shim)** | Stated in success criteria, not enforced in phases | "No fat CLI MCP layer" | Phase 5 text: *"thin bin documented as legacy fallback only"* — this is a shim-by-another-name with no deprecation date, contradicting the plan's own success criterion #1 in spirit (a "legacy fallback" that is never scheduled for removal is a permanent second path). | Give Phase 5 a hard deprecation date policy (see Anti-patterns #12) or drop the "legacy fallback" framing entirely and call it "current default, HTTP MCP experimental" until Cursor OAuth ships. |
| **Grant-scoped discovery/catalog filtering (SRP: hub decides visibility, bin never decides)** | Implicit | Catalog is "grant-filtered" | Confirmed correctly implemented hub-side (`McpToolRegistry.listForToken` gates on capability + harness). **But** `PLATFORM_TOOLS` in `mcp-tool-registry.ts` has `inputSchema` for **exactly one tool** (`murrmure_emit_event`); the other 18 tools — including every one in the plan's Phase 1 "minimum schema set" — have **no `inputSchema` at all**. This is the direct, currently-reproducible cause of MCP-2. | Phase 1 as scoped is correct; just confirming it targets the right file and the gap is real and total (0/18, not partial). |

---

## Complete compatibility-debt inventory

Every row must be **deleted or rewritten to target shape**. "Plan mentions?" reflects the *current* plan text, not this review's amendments.

| Path / symbol | Role today | Plan mentions deletion? | Verdict | Risk if kept |
|---|---|---|---|---|
| `packages/cli/src/mcp/main.ts` | Fat stdio server: catalog fetch, tool invoke, synthetic `murrmure_get_pending_wake` tool, wires control session | Yes (Phase 2) | **DELETE** (logic moves to new package, rewritten thin) | Two MCP runtime implementations forever |
| `packages/cli/src/mcp/control-session.ts` | Handshake polling, ack-seq file persistence, `resolveMcpClientId`, `createMessage` sampling calls | Yes ("move to hub"), but hub cannot own client-side sampling (see Wake spec) | **REWRITE into new package**, not "move to hub" verbatim | Vague "move to hub" instruction gets implemented as a no-op copy, keeping two copies |
| `packages/cli/src/mcp/env.ts` | `readHubUrl`/`readHubToken`/`readSpaceId`; hardcoded `:8787`; `MURRMURE_API_URL`/`MURRMURE_API_TOKEN`/`MURRMURE_TOKEN`/`MURRMURE_SPACE_ID` aliases | Partial ("delete dir") | **DELETE** — replace with discovery-file reader + single `MURRMURE_HUB_TOKEN` read, no aliases, no space id | Port drift; alias surface never shrinks; space_id duplicated vs token |
| `packages/cli/src/mcp/pending-wake.ts` | Writes `.murrmure/pending-wake.json` in **cwd** | No | **KEEP CAPABILITY, MOVE FORMAT UPSTREAM** — the file write is the one thing only a local process can do; the *text* it writes must come pre-rendered from hub (see Wake spec) | If deleted outright, breaks `.cursor/rules/murrmure-feedback-wake.mdc` which is a live, always-applied workspace rule that reads this exact file today |
| `packages/cli/src/mcp/wake-prompt.ts` | Formats `invoke_action`/`wake_pending` payloads into prompt text, client-side | No | **DELETE from CLI; hub renders equivalent text into the handshake message body** | Two prompt-formatting implementations drift as new control-bus message types are added (already 4 message kinds in `control-bus.ts`) |
| `packages/cli/src/commands/mcp.ts` (`mrmr mcp` / `murrmure mcp`) | Registers `mcp` subcommand | Yes | **DELETE** | Two ways to start MCP forever; doctor can never "error, not warn" while this exists |
| `packages/cli/src/mcp.ts` (`dist/mcp.js` tsup entry) | Thin re-export of `startMcpServer()` | Implicit | **DELETE tsup entry**; new package gets its own build | `dev-hmr-cli.ts` currently symlinks `murrmure-mcp`/`mrmr-mcp` → this exact fat file — dev environment currently runs the wrong binary under the "right" name |
| `packages/cli/src/commands/root.ts` → `mcpCommand` wiring + help string `"...and MCP (\`mrmr mcp\`)."` | Registers subcommand; advertises it in `--help` | No | **DELETE** both the registration and the help string | `murrmure --help` keeps teaching the fat path even after the command is gone from docs |
| `packages/cli/package.json` → `exports["./mcp"]`, `dependencies["@modelcontextprotocol/sdk"]` | Programmatic import surface; only consumer of the SDK in the whole CLI package | No | **DELETE both** | Hidden second entrypoint; SDK stays a CLI dependency for zero reason once the subcommand is gone (confirmed: `@modelcontextprotocol/sdk` has exactly 2 importers, both under `src/mcp/`) |
| `packages/cli/tsup.config.ts` → `entry.mcp` | Builds `dist/mcp.js` | No | **DELETE entry** | Dead build artifact shipped in every CLI publish |
| **`packages/cli/templates/space/.cursor/mcp.json`** | Scaffolded into every new space via `space-scaffold.ts` | Phase 3 ("stop scaffolds") names the *behavior*, not this *file* | **DELETE file + the `scaffoldMurrmureDir` block that copies it (`space-scaffold.ts` lines ~72–79)** | **Actively regressing today** — this file is untracked/new in the current diff and still emits `command: murrmure, args: ["mcp"]` + 3 env vars + placeholder token/space. Every space scaffolded between now and the fix commits new compatibility debt into user repos. Highest-priority single fix in this review. |
| `packages/cli/src/lib/space-doctor-mcp.ts::buildMcpConfigSnippet()` | Emits fat 3-env snippet (also used as the "canonical" fixture in tests) | Phase 3 ("rewrite") | **REWRITE** to emit `{ command: "murrmure-mcp", env: { MURRMURE_HUB_TOKEN } }` only | Every "fix" suggestion doctor prints today teaches the wrong shape |
| `packages/cli/src/lib/space-doctor-mcp.ts::validateMurrmureServer()` / `commandLooksLegacy()` | Flags `murrmure-mcp`/`mrmr-mcp` as **deprecated**; treats `command: murrmure, args: ["mcp"]` as canonical | No — **inverted vs. plan** | **REWRITE / invert the rule set** | Doctor actively fights the migration; a user who correctly installs the future thin bin gets a warning telling them to switch back to the fat command |
| `packages/cli/test/space-doctor-mcp.test.ts` | Test `"flags deprecated murrmure-mcp binary"` asserts `MCP_LEGACY_COMMAND` on `murrmure-mcp`; test `"accepts canonical murrmure mcp config"` asserts **zero warnings** on the fat 3-env shape | No | **REWRITE test bodies**, don't just add new ones alongside | If old assertions are left in place "for coverage," CI will fail the moment the rule set is corrected — or worse, someone "fixes" the new code to satisfy the old (wrong) test |
| `packages/cli/test/mcp-control-session.test.ts`, `mcp-session.test.ts`, `mcp-wake-prompt.test.ts`, `mcp-attach.test.ts` | Test the fat CLI's control-session/wake internals | No | **DELETE or port to new package's test suite** | Tests block deletion of the source files without a migration decision; currently these tests are the only thing exercising wake logic end-to-end |
| `apps/desktop/scripts/dev-hmr-cli.ts` → `CLI_BINARIES` (`mrmr-mcp`, `murrmure-mcp` → `mcp.js`) | Symlinks dev binaries | No | **REWRITE** to point at new package's build output; **drop `mrmr-mcp` entirely** | Dev parity with a binary name/alias that must not exist in production |
| `studio-specs/current/cli/spec.md` line 113 | Normative: *"Separate binary: `murrmure-mcp` / `mrmr-mcp` — MCP stdio server (unchanged)"* | No | **REWRITE** — remove `mrmr-mcp`, remove "(unchanged)," point at new package | This is a **spec document**, not a draft; leaving it contradicts shipped code the moment Phase 2 lands, and nothing in the plan assigns anyone to fix it |
| `.cursor/mcp.json` (repo root, live) | This exact repo's dogfood MCP config, fat shape, real token | No | **REWRITE** as part of cutover dogfooding | If the team's own daily-driver config isn't migrated in the cutover PR, the fix is "proven" only in tests, not in practice — and this file is committed with what appears to be a real bearer token, which is its own separate finding (see below) |
| Hub `GET/POST /v1/mcp/*` → `space_id` query/body param | Used by fat CLI on every call; also the only way bootstrap tokens pick a space | No | **KEEP for bootstrap tokens only; the bug is the fat CLI sending it, not the hub accepting it** | Correcting the record vs. prior review: `requireToken()` already rejects a non-bootstrap token whose `space_id` doesn't match — this is not a live security hole. The debt is 100% client-side (thin bin must simply never send it) |
| `packages/hub-daemon/src/mcp-handlers.ts::hubUrl()` loopback fetch | Every platform tool handler calls its own hub via `fetch("http://127.0.0.1:<port>/...")` | No | **REWRITE (non-blocking)** — call shared in-process functions instead of self-HTTP | Extra hop, port coupling, doubles the surface that must have `inputSchema`/auth logic kept in sync |
| `MURRMURE_TOKEN`, `MURRMURE_API_URL`, `MURRMURE_API_TOKEN`, `MURRMURE_DEPLOY_TOKEN` env aliases | Present in **both** `packages/cli/src/mcp/env.ts` (MCP-specific) and `packages/cli/src/auth.ts` / `auth-source.ts` (general CLI auth, wider blast radius) | No | **DELETE from MCP scope now; flag general-CLI aliases as separate follow-up** | Config surface never shrinks; multiple valid names for the same secret invite the exact "token differs from expected" class of bug (ISSUE-07) the plan is trying to fix |
| `.cursor/rules/murrmure-feedback-wake.mdc` | Always-applied workspace rule instructing agents to read `.murrmure/pending-wake.json` **or** call `murrmure_get_pending_wake` | No | **UPDATE, don't delete** — this rule is a live product surface (it is literally injected into this very agent's system prompt), and it must keep working post-cutover | If the fat CLI's pending-wake file write disappears without the new bridge replacing it, this rule silently breaks for every agent session that relies on it |
| `packages/cli/skill/reference/mcp.md` (HTTP fallback doc) | Interim curl fallback | Marked "interim" | **DELETE at MCP-CUTOVER**, not "when thin bin + schemas ship" (vague) | Permanent escape hatch if no explicit trigger commit removes it |

---

## Dual-path migration analysis + hard cutover strategy

### Why "phase-shaped" delivery creates debt here specifically

Each phase in the plan is useful in isolation, but MCP has a property most feature work doesn't: **the config file lives outside the repo** (`~/.cursor/mcp.json`, per-repo `.cursor/mcp.json`, `~/.murrmure/credentials`). Every day Phase 1 ships without Phase 2, users/scaffolds keep writing more fat configs into the wild that someone will have to migrate later. The plan needs to minimize the *number of days* the fat shape is being actively written, not just the number of phases.

| Window | Dual path that exists | Who is actively affected | Hard cutover requirement |
|---|---|---|---|
| Phase 1 shipped, Phase 2 not started | Schemas fixed; fat CLI still the only way to reach Cursor | Nobody regresses; low risk | Acceptable, but cap at one release; do not let Phase 1 sit indefinitely because "it already fixed MCP-2" |
| Phase 2 mid-flight (new bin exists, fat command still registered) | Two binaries, two config shapes, doctor still endorses the old one | **Every new `mrmr setup` / space scaffold run during this window ships broken-by-design config** | **Must not exist as an observable window.** New bridge package, deletion of `mcpCommand`, and doctor flip must land in **one PR** (see MCP-CUTOVER below) |
| Phase 2 done, Phase 3 not started | Bin is correct; `space-scaffold.ts` and `buildMcpConfigSnippet()` still emit the fat shape | Every space `mrmr space init` creates in this window needs manual fixing later | Fold "stop scaffold" + "rewrite snippet builder" into the **same milestone** as Phase 2, not Phase 3 |
| Phase 4 after 2–3 | Old per-repo `mcp.json` files already in the wild (including this repo's own `.cursor/mcp.json`) | Existing users silently stuck on fat shape with no signal | Doctor's `MCP_CONFIG_SHAPE`-equivalent must be **error**, not warning, immediately upon cutover — not deferred to Phase 4 |
| Phase 5 (optional HTTP MCP) | stdio bin **and** HTTP URL both "supported" | Docs/tutorials risk presenting both as equally valid forever | Pick one documented default; stdio bin gets an explicit deprecation-eligible date once HTTP MCP + OAuth ships, not indefinite "legacy fallback" |
| Bin aliasing | `mrmr-mcp` proposed nowhere explicitly, but `dev-hmr-cli.ts` and `space-scaffold-doctor` regexes already treat it as real | Confusion about which name is canonical persists from day one if not explicitly killed | Ship **one** bin, `murrmure-mcp`. Remove every `mrmr-mcp` reference in the same PR (dev-hmr, doctor regex, spec doc) |

### MCP-CUTOVER milestone (mandatory single PR, end of Phase 2)

This PR must be **atomic** — it cannot be split across releases without recreating the dual-path window above:

```text
MCP-CUTOVER (single PR):
  1. New package `packages/mcp-bridge` (@murrmure/mcp-bridge) ships, bin "murrmure-mcp", no "mrmr-mcp".
  2. packages/cli:
     - delete src/mcp/ (main.ts, control-session.ts, env.ts, pending-wake.ts, wake-prompt.ts)
     - delete src/mcp.ts, src/commands/mcp.ts
     - remove mcpCommand from root.ts + help string
     - remove exports["./mcp"], dependencies["@modelcontextprotocol/sdk"]
     - remove tsup entry "mcp"
  3. packages/cli/templates/space/.cursor/mcp.json: DELETE FILE.
     packages/cli/src/lib/space-scaffold.ts: remove the mcp.json copy block.
  4. packages/cli/src/lib/space-doctor-mcp.ts:
     - buildMcpConfigSnippet() → new minimal shape (murrmure-mcp + MURRMURE_HUB_TOKEN only)
     - validateMurrmureServer() rules inverted: command "murrmure-mcp" = canonical;
       command "murrmure"+args:["mcp"] = MCP_LEGACY_COMMAND error (not warning)
     - any MURRMURE_SPACE_ID / MURRMURE_HUB_URL present in mcp.json = warning (should not be there)
  5. packages/cli/test/space-doctor-mcp.test.ts: rewrite "canonical" and "deprecated" cases to match #4.
     Delete packages/cli/test/mcp-control-session.test.ts, mcp-session.test.ts, mcp-wake-prompt.test.ts,
       mcp-attach.test.ts OR port their assertions into packages/mcp-bridge/test/.
  6. apps/desktop/scripts/dev-hmr-cli.ts: point murrmure-mcp at @murrmure/mcp-bridge build output;
       delete mrmr-mcp entry entirely.
  7. studio-specs/current/cli/spec.md line ~113: rewrite ("unchanged" claim removed, mrmr-mcp removed).
  8. .cursor/mcp.json (repo root, and any other live dogfood configs): rewritten to new shape as part of this PR,
       not left for a follow-up.
  9. CI gate (new): `rg -n '"murrmure",\s*\n?\s*"args":\s*\[\s*"mcp"' packages/cli` and
       `rg "mrmr-mcp"` across the repo both return zero matches outside CHANGELOG/archives.
```

If items 1–9 cannot land together, the plan should explicitly say so and define an interim gate (e.g., feature-flag the new bin, but doctor must still error on the old shape from day one of the window) — silence on this point is itself the defect.

---

## Package & deployment: normative recommendation (one choice)

**Decision: new workspace package `packages/mcp-bridge`, published as `@murrmure/mcp-bridge`, single bin `murrmure-mcp`.**

This is not "one of three options" — it is the only choice consistent with how this monorepo already draws boundaries (`packages/hub-core`, `packages/runtime-contracts`, `packages/executors` are all small, single-purpose workspace packages consumed by name, not folders nested inside a bigger package). Rejected alternatives and why:

| Rejected option | Why not |
|---|---|
| Keep bridge inside `@murrmure/cli` (`src/mcp-bridge/`) | Reintroduces exactly the coupling being removed: CLI would still ship `@modelcontextprotocol/sdk` as a dependency, and "no fat CLI MCP layer" becomes a naming exercise, not a package-boundary fact. `npm i -g @murrmure/cli` would still pull MCP SDK weight even for users who never touch Cursor. |
| `apps/mcp-bridge/` | `apps/*` in this workspace are deployables with their own lifecycle (`apps/desktop`, `apps/docs`) — a stdio bin published to npm is a **library-shaped package**, not an app. Using `apps/` blurs that convention for every future contributor. |
| Two bins (`murrmure-mcp` + `mrmr-mcp`) | Explicitly forbidden by the plan's own text ("no `mrmr-mcp` alias") and by this review's anti-patterns list. The CLI's `murrmure`/`mrmr` dual-bin precedent is for a *user-typed* command; the bridge is *never typed by a human*, it's only ever invoked by Cursor from `mcp.json` — there is no UX reason to alias it, only inertia. |

**Concrete package shape:**

```text
packages/mcp-bridge/
  package.json        name: "@murrmure/mcp-bridge", bin: { "murrmure-mcp": "./dist/main.js" }
  src/
    main.ts            entrypoint: discovery → token → stdio server → connect
    discovery.ts        read ~/.murrmure/hubs/shared.json only (no port fallback, no MURRMURE_HUB_URL)
    hub-client.ts        GET /v1/mcp/catalog, POST /v1/mcp/tools/call, POST /v1/mcp/session/handshake
    wake-relay.ts        forward hub-provided prompt text verbatim; write .murrmure/pending-wake.json;
                         attempt server.createMessage(); this is the ONLY "logic" allowed to remain client-side
  test/
```

- **CLI dependency:** `@murrmure/cli` does **not** import `@murrmure/mcp-bridge`. Doctor probes by (a) checking `which murrmure-mcp` / PATH, and (b) hitting the hub's HTTP catalog directly with the user's token — never by requiring the bridge package. This keeps the "CLI = setup + health, not MCP runtime" boundary real, not aspirational.
- **Versioning:** lockstep-minor with hub `/v1/mcp/*` schema surface (bump bridge minor whenever hub adds a required catalog field the bridge must forward, e.g. adding `inputSchema` was such a change).
- **Publish:** `npm i -g @murrmure/mcp-bridge` documented as its own install step until (if ever) `@murrmure/cli` ships it as an optional dependency with a postinstall bin link — do not promise bundling in this plan; state it as future work only.
- **Global install verification:** `which murrmure-mcp` must succeed after `npm i -g @murrmure/mcp-bridge`. Doctor checks PATH for this exact binary name — never shells out to `npx murrmure mcp` as a fallback.

---

## Hub ownership completeness

What should be hub-owned but the plan doesn't fully specify, ranked by how much client-side logic it currently forces:

| Gap | Current owner | Target owner | Why it matters |
|---|---|---|---|
| **`inputSchema` for 18/19 platform tools** | Nobody (only `murrmure_emit_event` has one) | `PLATFORM_TOOLS` table in `mcp-tool-registry.ts` | This is the entire root cause of MCP-2. Phase 1 targets the right file; confirm the fix is "every tool in `PLATFORM_TOOLS` gets a schema," not just the 8 named in the plan's table — the other 10 (`murrmure_apply_space`, `murrmure_grant_mint`, `murrmure_list_sessions`, `murrmure_get_run_graph`, `murrmure_attach_orchestration`, `murrmure_cancel_run`, `murrmure_list_emittable_events`) will reproduce MCP-2 if skipped. |
| **Wake prompt rendering** | `packages/cli/src/mcp/wake-prompt.ts` (client) | Hub should render final prompt text into the handshake message body (e.g. add a `prompt` field alongside existing `params` in `murrmure/control.invoke_action` / `wake_pending` messages in `control-bus.ts`) | The bin currently re-derives instruction text from raw params; if hub adds a new wake message kind, both `control-bus.ts` and the client's `formatControlWake()` switch statement must be updated in lockstep. Rendering server-side removes that duplication permanently. |
| **`murrmure_get_pending_wake` tool semantics** | Synthetic tool defined client-side in `main.ts`, backed by client-local `ControlSession` state | Bridge still exposes the tool (Cursor needs *a* tool to call), but its implementation should be "return the last handshake message the bridge relayed," with **zero decision logic** — no formatting, no filtering | Today the tool's behavior depends on `control-session.ts`'s internal `pendingWake` variable and `deliverWake()`'s success/failure branching. That branching (did `createMessage` succeed?) is orchestration logic that constitutes "business logic in a thin bin," which is exactly what's forbidden. |
| **`.murrmure/pending-wake.json` write** | Client (`pending-wake.ts`), keyed off `process.cwd()` | **Must remain client-side** (only the local process running in the actual repo cwd can write into that repo's `.murrmure/`), but content must be the hub-rendered text, not client-templated text | This is the one piece of "wake ownership" that is correctly thin-bin-shaped already — the plan should say so explicitly instead of blanket "move wake to hub," which risks someone deleting the one file write that `.cursor/rules/murrmure-feedback-wake.mdc` depends on. |
| **Handshake `space_id` in body** | Required field sent by fat CLI (`control-session.ts::performHandshake`) even though hub derives space from token for non-bootstrap tokens | Bridge should **omit `space_id` from handshake body entirely** for normal grants; hub already falls back to `auth.space_id` when body lacks it | Today's client sends it "just in case," which is exactly the kind of belt-and-suspenders duplication the plan wants gone. Hub code already supports omission (`body.space_id ?? c.req.query("space_id") ?? ""` → empty string → `requireToken` skips the path-space check for non-bootstrap tokens since it only enforces the check `if (pathSpaceId)`). Confirm with a test, don't just assume. |
| **Catalog refresh / `tools/list_changed`** | CLI refetches catalog on `control.tools_changed`, then calls `server.sendToolListChanged()` | This is legitimately bridge-appropriate (only the connected `Server` instance can notify *its* client) — but the *decision* of what changed is 100% hub's (`ControlBus.publishToolsChanged`). No change needed beyond porting this one callback into the new package verbatim. | Correctly scoped already in the plan; call it out as "keep as-is in new package" so nobody "fixes" it unnecessarily. |
| **Global `~/.cursor/mcp.json` in doctor** | `discoverMcpConfigPaths()` only walks `<project>/.cursor/mcp.json` and ancestors under the project root — never `~/.cursor/mcp.json` | Doctor must scan both locations | Plan's own target architecture defaults to **global** config; doctor cannot validate the plan's primary supported path today. Sibling testability review flags this as the single biggest doctor blind spot — concur. |
| **`mrmr grant use --space`** | Does not exist | Needed once multi-space + global config is the default (switching spaces = switching active token per the plan) | Undefined storage format risks becoming another ad hoc file next to `~/.murrmure/credentials` and `~/.murrmure/hubs/shared.json`. Define `~/.murrmure/grants/<space>.token` (or similar) in the plan text, not just as an example CLI invocation. |
| **`mcp-handlers.ts` self-HTTP loopback** | Every handler does `fetch(hubUrl() + ...)` against its own running port | Direct in-process function calls | Lower priority (doesn't block MCP-1/2/3) but is the one place inside `hub-daemon` itself that violates "hub owns protocol" as a single code path — worth a Phase 2/3 follow-up ticket even if not blocking. |

---

## Wake / control-bus cutover spec

### Today (fat CLI owns too much)

```text
Cursor ── stdio ──> packages/cli/src/mcp/main.ts (fat)
                        │
                        ├─ control-session.ts: setInterval poll every 5s
                        │     resolveMcpClientId()  → ~/.murrmure/mcp-sessions/<space>.client-id
                        │     readPersistedLastAckSeq() → ~/.murrmure/mcp-sessions/<space>.last-ack-seq
                        │     POST /v1/mcp/session/handshake { space_id, client_id, last_ack_seq }
                        │            ▼
                        │     hub-daemon: control-bus.ts drain() → messages[]
                        │            ▼
                        ├─ wake-prompt.ts: formatControlWake(method, params) → prompt text  [CLIENT LOGIC]
                        ├─ pending-wake.ts: write .murrmure/pending-wake.json                [CLIENT LOGIC — keep]
                        └─ server.createMessage(...) sampling call to Cursor                 [CLIENT-ONLY, must stay]
```

### Target (bridge is dumb relay; hub renders content)

**Sequence:**

```text
1. Cursor spawns murrmure-mcp (bridge). Bridge reads shared.json → hub endpoint. Reads MURRMURE_HUB_TOKEN.
2. Bridge connects stdio Server, waits for client capabilities.
3. Bridge POSTs /v1/mcp/session/handshake { client_id, last_ack_seq }  (NO space_id)
4. Hub: requireToken() resolves space from bearer. controlBus.registerPrincipal(). mcpWakeDispatcher.connect().
   Hub drains queued ControlMessage[]; for wake-kind messages, hub now includes a pre-rendered `prompt` string
   in params (new hub responsibility — currently only main.ts renders this).
5. Bridge receives messages:
   - tools_changed  → refetch /v1/mcp/catalog, call server.sendToolListChanged()      [bridge-appropriate]
   - invoke_action / wake_pending (has params.prompt from hub) →
        write .murrmure/pending-wake.json with hub's prompt verbatim               [bridge-appropriate: local fs]
        try server.createMessage({ messages: [{ text: params.prompt }] })          [bridge-appropriate: client-only API]
        on success or failure, ack the seq back via next handshake's last_ack_seq
6. murrmure_get_pending_wake tool call from agent → bridge returns last relayed prompt (or hub-fallback text
   if bridge restarted and lost in-memory state — bridge may re-derive from the last drained message it
   still has via next handshake, or simply say "no in-memory wake; call again after next poll").
7. Bridge never formats, filters, or interprets message semantics — it relays params.prompt and forwards
   structural fields (run_id, session_id) only for display, not decision-making.
```

**What moves to hub (write access required in Phase 2):**
- `control-bus.ts` message shapes gain a `prompt: string` field for `wake_pending` and `invoke_action`-sourced messages (wherever those are published — trace the publisher of `murrmure/control.invoke_action`, likely `hub-core`'s action-invoke path or `hub-daemon`'s dispatch, and add rendering there using the same content `formatInvokeActionWake`/`formatWakePendingWake` produce today).
- Equivalent of `wake-prompt.ts`'s two format functions ported into hub-core or hub-daemon, single source of truth.

**What the bridge keeps (must stay client-side, do not delete):**
- `resolveMcpClientId()` / ack-seq persistence — the hub is stateless about "what has this client seen," by design (`ControlBus.drain(principal, afterSeq)` requires the caller to supply `afterSeq`). This is correct thin-adapter behavior, not business logic.
- `.murrmure/pending-wake.json` file write — only a process running with the repo as cwd can do this.
- `server.createMessage(...)` sampling call and `server.sendToolListChanged()` — these are calls against *this specific* MCP `Server` object connected to *this specific* Cursor session; hub has no handle to it.

**What gets deleted outright:**
- `wake-prompt.ts`'s formatting logic (superseded by hub-rendered `prompt` field).
- `space_id` in handshake body.
- Any retry/backoff logic duplicated between CLI and a hypothetical hub-side push (there is none today — confirm no one adds one; poll-based drain is fine and matches `ControlBus`'s TTL-based outbox design).

---

## Anti-patterns forbidden list

Implementers must **NOT**:

1. Keep `murrmure mcp` / `mrmr mcp` as an alias, hidden subcommand, or doctor-suggested fallback after MCP-CUTOVER.
2. Register **both** `murrmure-mcp` and `mrmr-mcp` bins for the bridge — one bin, one name, no hard link, no alias.
3. Leave `commandLooksLegacy()`/`validateMurrmureServer()` accepting the fat shape with only a warning after MCP-CUTOVER — it must be an **error**.
4. Scaffold or commit `.cursor/mcp.json` with `MURRMURE_HUB_URL`, `MURRMURE_SPACE_ID`, or a hardcoded port — including in `templates/space/`, docs, skill files, or this repo's own root `.cursor/mcp.json`.
5. Add a "compat layer" in the bridge that reads `MURRMURE_SPACE_ID` / `MURRMURE_HUB_URL` "for migration" or "just in case" — delete the env vars from the bridge's vocabulary entirely, don't make them optional-but-supported.
6. Leave `packages/cli/src/mcp/` on disk with re-exports, `@deprecated` JSDoc stubs, or a README pointing elsewhere — delete the directory.
7. Keep `exports["./mcp"]` in `packages/cli/package.json` for "programmatic" access after the subcommand is deleted — there is no legitimate consumer once `src/mcp/` is gone (confirmed only 2 importers of the MCP SDK, both being deleted).
8. Document the curl/HTTP fallback (`skill/reference/mcp.md`) as an equally valid path after MCP-CUTOVER — delete the doc section on the same PR that ships the bridge, not "when things stabilize."
9. Layer new doctor validation alongside old rules ("accept `murrmure mcp` OR `murrmure-mcp`") — replace the rule set, don't union it. The old rule set's *tests* must be rewritten, not left passing alongside new tests.
10. Move wake orchestration to hub but leave `control-session.ts` in the CLI "for edge cases" or "in case the bridge isn't ready" — there is no edge case that justifies two handshake pollers.
11. Add a hub-catalog shim that synthesizes `{ additionalProperties: true }` as a fake `inputSchema` for tools that don't have a real one yet — this masks MCP-2 instead of fixing it, and once shipped nobody will notice the real schemas are still missing.
12. Use "Phase 5 — legacy fallback" language for the stdio bridge without a published deprecation trigger (e.g., "stdio bridge is deprecated N days after Cursor ships stable HTTP MCP + OAuth for loopback URLs, tracked in issue X") — undated "legacy fallback" is a permanent second path by another name.
13. Let the bridge decide *how* to render a wake prompt (string templating, conditional instruction text) — that is business logic; the bridge forwards hub-rendered text only.
14. Ship the new package as a nested folder under `packages/cli/src/` — the whole point of the package-boundary decision is an independent `package.json`/`bin`/dependency graph; a folder is not a boundary.
15. Let `mcp-handlers.ts`-style self-HTTP loopback patterns spread to new hub-side MCP work — new platform tool handlers should call shared in-process logic, matching "hub owns protocol" as a single code path, not hub-calls-hub-over-HTTP.

---

## Recommended plan amendments (with phase assignments)

| Addition | Phase | Detail |
|---|---|---|
| **Name the scaffold-template file explicitly for deletion** | Phase 2 (MCP-CUTOVER) | Plan currently says "stop scaffolds from auto-committing old fat snippet" (Phase 3) without naming `packages/cli/templates/space/.cursor/mcp.json` or the `space-scaffold.ts` copy block. This file is newly added in the current diff and must not survive the plan. |
| **MCP-CUTOVER milestone as a literal, atomic PR checklist** | End of Phase 2 | Use the 9-item checklist in this review's "Dual-path" section verbatim as the plan's Phase 2 acceptance criteria, replacing the current loose "Acceptance" bullets. |
| **Flip doctor validation rules, not add to them** | Phase 2, not Phase 4 | Explicitly: rewrite `commandLooksLegacy()` and `validateMurrmureServer()` in the same PR the bridge ships; rewrite (not append to) `space-doctor-mcp.test.ts`. |
| **Fix `studio-specs/current/cli/spec.md`** | Phase 2 (cutover PR) | Line ~113's "unchanged" / `mrmr-mcp` claim must be corrected in the same PR — specs are normative, and this plan currently doesn't touch any spec file. |
| **Fix the repo's own `.cursor/mcp.json`** | Phase 2 (cutover PR) | Dogfood the new shape immediately; don't let the team's daily driver lag the shipped fix. Also flag: this file currently contains what looks like a real bearer token committed to the repo — rotate it regardless of this plan. |
| **Pick the package — one row, not a choice** | Phase 2 design | `packages/mcp-bridge` / `@murrmure/mcp-bridge` / bin `murrmure-mcp`. Update the plan's "Code map" table to remove the "or apps/ or cli/src/mcp-bridge/" hedge. |
| **Wake cutover: hub renders prompt text, bridge relays only** | Phase 2 | Add explicit work item: `control-bus.ts` message payloads gain rendered `prompt` field; port `formatInvokeActionWake`/`formatWakePendingWake` logic into hub-core/hub-daemon; delete `wake-prompt.ts` from CLI (not "move to hub" as a vague instruction). |
| **Keep `.murrmure/pending-wake.json` write in the bridge, explicitly** | Phase 2 | Call out in the plan that this file write is intentionally retained client-side (only a local process can do it) and is depended on by `.cursor/rules/murrmure-feedback-wake.mdc` — do not delete it while deleting the rest of `pending-wake.ts`'s siblings. |
| **Remove `space_id` from handshake/catalog/invoke bodies sent by the bridge** | Phase 2 | The hub already supports omission for non-bootstrap tokens; add a hub-side test proving this, then delete `readSpaceId()`/`MURRMURE_SPACE_ID` from the bridge with confidence instead of leaving it "just in case." |
| **Schema coverage: all 19 `PLATFORM_TOOLS`, not just the 9 named in Phase 1's table** | Phase 1 | Plan's minimum schema set lists 9 tools; `mcp-tool-registry.ts` defines 19. The other 10 will reproduce MCP-2 for any agent workflow that calls them (e.g., `murrmure_grant_mint`, `murrmure_cancel_run`). |
| **Doctor scans `~/.cursor/mcp.json` in addition to project-level** | Phase 4 (or pulled into Phase 2 given it's the plan's own stated default path) | `discoverMcpConfigPaths()` today only walks the project tree. The plan's target default is global config; doctor must be able to see it. |
| **Define `mrmr grant use --space` storage format** | Phase 3 | Plan references the command in prose (`export MURRMURE_HUB_TOKEN=…   # or: mrmr grant use --space spc_…`) without specifying where the active-token pointer or per-space token cache lives. Propose `~/.murrmure/grants/<space>.token` + `~/.murrmure/grants/active` pointer file, or fold into existing `~/.murrmure/credentials` with a space-keyed map — pick one now, not during implementation. |
| **CI negative-space gate for regrowth** | Phase 2 exit, permanent | Add a repo-wide grep-based CI check (see Post-plan checklist) that fails the build if the fat shape or `mrmr-mcp` reappears anywhere, including new scaffolds/docs. This is the only way to make "no compatibility debt" durable rather than a one-time cleanup. |
| **`mcp-handlers.ts` self-HTTP loopback follow-up ticket** | Phase 2 or 3, non-blocking | Log as tracked debt even if not required for MCP-1/2/3 exit — it's real "hub owns protocol" debt inside the hub itself. |
| **Phase 5 deprecation trigger, not "legacy fallback"** | Phase 5 | Replace "thin bin documented as legacy fallback only" with a concrete trigger condition (Cursor HTTP MCP + OAuth GA + N-day notice) before any doc says the bridge is deprecated. |

---

## Post-plan architecture validation checklist

Run this after MCP-CUTOVER lands, before closing the plan:

**Deletion / regrowth gates**
- [ ] `rg -n '"murrmure"' packages/cli/templates/ apps/docs/ packages/cli/skill/` shows no `args: ["mcp"]` sibling anywhere.
- [ ] `rg "mrmr-mcp"` across the entire repo returns zero matches (code, docs, specs, dev scripts).
- [ ] `rg "MURRMURE_SPACE_ID" packages/cli/src apps/desktop/scripts` returns zero matches (env var fully retired from MCP paths).
- [ ] `packages/cli/src/mcp/` does not exist. `packages/cli/src/mcp.ts` does not exist. `packages/cli/src/commands/mcp.ts` does not exist.
- [ ] `packages/cli/package.json` has no `exports["./mcp"]`, no `@modelcontextprotocol/sdk` dependency, no `mcp` tsup entry.
- [ ] `murrmure --help` does not mention `mcp` as a subcommand.

**New package correctness**
- [ ] `packages/mcp-bridge/package.json` exists with `bin: { "murrmure-mcp": ... }` and no second bin name.
- [ ] `npm i -g @murrmure/mcp-bridge && which murrmure-mcp` succeeds in a clean environment.
- [ ] Bridge source contains no hardcoded port and no `MURRMURE_HUB_URL` read — discovery file only.
- [ ] Bridge sends no `space_id` in any request body/query for non-bootstrap tokens.

**Hub correctness**
- [ ] `GET /v1/mcp/catalog` returns non-empty `inputSchema` for all 19 `PLATFORM_TOOLS` entries (not just `murrmure_emit_event`).
- [ ] Handshake response for a wake-kind message includes a rendered `prompt` string; bridge test asserts it writes that string verbatim to `.murrmure/pending-wake.json`.
- [ ] `requireToken()` behavior confirmed via test: omitting `space_id` from handshake/catalog/tools-call body for a non-bootstrap token resolves space from the token, not from an empty override.

**Doctor correctness**
- [ ] `scanMcpConfig` flags `command: "murrmure", args: ["mcp"]` as **error**, not warning.
- [ ] `scanMcpConfig` flags any `MURRMURE_SPACE_ID`/`MURRMURE_HUB_URL` key present in mcp.json as a warning (should not exist).
- [ ] Doctor discovers and scans `~/.cursor/mcp.json`, not only project-level config.
- [ ] `space-doctor-mcp.test.ts` "canonical" fixture uses the new minimal shape; no test asserts the fat shape is warning-free.

**Product-surface continuity**
- [ ] `.cursor/rules/murrmure-feedback-wake.mdc`'s described flow (`.murrmure/pending-wake.json` or `murrmure_get_pending_wake`) still works end-to-end with only the bridge running (no fat CLI process anywhere).
- [ ] This repo's own `.cursor/mcp.json` uses the new shape and its previously-committed token has been rotated.
- [ ] `studio-specs/current/cli/spec.md` no longer claims the MCP bin is "unchanged" or lists `mrmr-mcp`.

**Tutorial exit (manual, per plan's own success criteria)**
- [ ] Tutorial 1 Part 2 completes with non-empty tool args and no curl fallback, using only global `~/.cursor/mcp.json` + `murrmure-mcp`.

---

## Top-line differences from the prior review pass

For traceability, this deep pass **adds** (beyond the prior review):
- Discovery that `templates/space/.cursor/mcp.json` is newly-added, untracked, actively-wired compatibility debt — not just "old code left behind."
- Direct quote/citation of the inverted test names and the normative spec line contradicting the plan.
- Correction: the hub's `space_id` query/body param is **not** an unguarded override for non-bootstrap tokens (already gated by `requireToken`); the real debt is 100% client-side (the fat CLI sending it unnecessarily).
- A concrete, evidence-based Wake cutover spec that distinguishes what the bridge **must** keep (ack-seq persistence, local file write, `createMessage`/`sendToolListChanged` calls) from what must move to hub (prompt rendering) — the prior review said "move wake to hub" without this split, which risks either breaking the pending-wake file (depended on by a live, always-applied workspace rule) or leaving all the client-side logic in place under a new file name.
- Normative package decision resolved to a single named path with rationale grounded in this repo's existing package conventions, not three options.
- Full schema-coverage count (19 platform tools, 1 with a schema) vs. the plan's 9-tool "minimum set," showing the minimum set under-covers the real gap.
