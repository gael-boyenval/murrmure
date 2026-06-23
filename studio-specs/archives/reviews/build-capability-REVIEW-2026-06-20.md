# CDK — architecture, UX, and spec review

**Date:** 2026-06-20  
**Scope:** [build-capability/](./) (all docs) cross-checked against studio-v2 hub, capability-runtime, config, cloud-shell, P5  
**Method:** Three parallel high-thinking reviews — architecture, developer UX/XD, spec completeness — synthesized here.

---

## Executive summary

The CDK direction is **coherent and aligned with the product model**. P0 items addressed in specs 05–12 (2026-06-20 hardening).

**Verdict: Go (controlled risk) for BC0–BC2** — see [Post-hardening update](#post-hardening-update-2026-06-20) at end of doc.

| Question | Answer |
|----------|--------|
| Is CDK direction correct? | **Yes** |
| Ready to implement BC0–BC2? | **Yes** — P0 addressed in 05–09, 06, 12; config spec aligned |
| Ready for BC3–BC4? | **Yes with security implementation** — worker + iframe normative |
| Prototype BC0 offline only? | **Yes** |

**Closed P0 items:** ARCH-01/02 → [09-security-execution-boundaries.md](./09-security-execution-boundaries.md); SPEC-01 → [12-migration](./12-migration-from-bundled-catalog.md); UX-01 → BC2a in [03-shell-host.md](./03-shell-host.md); UX-02 → [02-sdk.md](./02-sdk.md) push-state.

| Priority | Theme | Count |
|----------|-------|-------|
| **P0** | Security (untrusted code in hub/shell), spec contradictions (catalog vs CDK), builder entry dead-end | 5 |
| **P1** | Wire contracts, manifest freeze, install_id UX, rollback semantics | 12 |
| **P2** | Dev loop protocol, Configure handoff polish, conformance matrix | 10 |

---

## What works well

**Architecture**

- Clean three-way split: user project / CDK / platform ([cdk.md](./cdk.md) invariants CDK-1–3).
- Reuses evolution FSM instead of inventing a parallel install path ([plan.md](./plan.md) P5).
- Staging under `~/.studio/capabilities/` keeps git source separate from immutable blobs ([01-local-layout.md](./01-local-layout.md)).
- Mount contracts (`mount` + `mountRoutes`) minimize coupling — only two integration points.
- Live apply + static UI serve fits capability-runtime CR0 model ([04-hub-ingest.md](./04-hub-ingest.md)).

**Developer UX**

- CLI-first builder loop matches Dev/agent personas (`capability:install` = push bundles).
- Configure correctly scoped to evolution orchestration, not domain UI design ([plan.md](./plan.md) SDK vs Configure table).
- `studio capability init` + templates lower time-to-first-draft.
- Same CDK surface for human, agent, and CI ([cdk.md](./cdk.md) agent section).
- Journey-14 mental model (New Capability → validate → promote) maps cleanly once entry gaps are fixed.

**Spec structure**

- Phased BC0–BC6 with tiered CDK-min/standard/dev.
- Acceptance scenarios in [acceptance.md](./acceptance.md) anchor E2E proof.
- Explicit non-goals (no catalog, no shell domain UI).

---

## P0 — must fix before implementation

### ARCH-01 — Server bundle runs in hub process (security)

**Problem:** [04-hub-ingest.md](./04-hub-ingest.md) dynamic `import()` of user `mount.mjs` into the hub daemon executes **untrusted code** with hub DB, tokens, and all spaces.

**Improvement:** Add [09-security-execution-boundaries.md](./09-security-execution-boundaries.md) (proposed):

- v1 options: subprocess worker per capability, `vm` + allowlist (weak), or separate capability sidecar process with IPC
- Document trust model: who may push (`capability:install`), signing (future), sandbox space only for agent push
- Hub never `import()` user code in main process without isolation

**Effort:** L

---

### ARCH-02 — User UI runs in shell origin (security)

**Problem:** [03-shell-host.md](./03-shell-host.md) dynamic `import()` of user `entry.js` into shell origin; shadow DOM does **not** isolate script — user bundle can access session cookies, hub proxy tokens, DOM outside canvas.

**Improvement:** Specify **iframe sandbox** or **origin-isolated subframe** for capability canvas:

```text
Shell origin ──► iframe src={hub}/capabilities/.../ui/shell.html?sandbox=...
                 sandbox="allow-scripts allow-same-origin" (minimal)
                 postMessage bridge for CapabilityHostContext
```

Update [03-shell-host.md](./03-shell-host.md) + security doc.

**Effort:** M

---

### SPEC-01 / ARCH-11 — Catalog model contradicts CDK

**Problem:** [../config/spec.md](../config/spec.md) + CS-ADR-03 define bundled `review-loop` catalog and catalog-shaped install body. CDK Invariant CDK-3 forbids this. First-run wizard step 3 installs bundled review — dead wrong for local-first CDK.

**Improvement:** Supersession ADR (when allowed to edit other specs): local-first CDK replaces bundled catalog. Until then, add [12-migration-from-bundled-catalog.md](./12-migration-from-bundled-catalog.md) stating CDK docs **supersede** CS-ADR-03 for new work.

**Effort:** M (doc) / L (platform migration)

---

### UX-01 — Configure “New Capability” is BC6 but Journey-14 uses it Day 1

**Problem:** [plan.md](./plan.md) puts Configure handoff at BC6 (last). Journey-14: `Configure → Capabilities → New Capability` is the builder entry. Builders hitting Configure before BC6 get a dead end.

**Improvement:**

- Split BC6: **BC2a** static Configure page (npm install, `init`, link to docs) ships with push
- **BC6b** path picker + registered projects in `shared.json` later
- Update phase table in [plan.md](./plan.md)

**Effort:** S (spec) / S (UI stub)

---

### UX-02 — No recovery for `install_id` after push

**Problem:** `push` returns `install_id`; all evolution commands need `--install ins_…`. ID exists only in HTTP response — scrollback loss breaks the loop.

**Improvement:** Specify in [02-sdk.md](./02-sdk.md):

- On push: write `~/.studio/capabilities/{id}/{ver}/.push-state.json` with `{ install_id, space_id, pushed_at }`
- Add `studio capability status [path]` and `studio capability list --space <id>`
- Idempotent re-push updates same install row when semver unchanged

**Effort:** S

---

## P1 — architecture gaps

| ID | Issue | Recommended change | Effort |
|----|-------|-------------------|--------|
| **ARCH-03** | `contract_ref_id` in manifest is user-supplied; hub should derive from `(package_id, contract digest)` | Hub assigns `cref_*` at ingest; manifest field optional or read-only post-push | M |
| **ARCH-04** | `bundle_digest` + `local-path` ingest — client claims digest, hub reads path (TOCTOU) | Hub computes digest after read; reject client digest mismatch; never trust path outside allowlist roots | M |
| **ARCH-05** | Rollback leaves instances pinned to superseded `contract_ref_id` | Document `finish_current` + in-flight instance behavior in [04-hub-ingest.md](./04-hub-ingest.md); add acceptance row | M |
| **ARCH-06** | MCP tool name collision across live capabilities underspecified | Validate at Lens A: unique `(space_id, tool_name)` before apply; error code `MCP_TOOL_COLLISION` | S |
| **ARCH-07** | `push --target live` vs principle P5 “no shortcut pipeline” | Remove from general CLI; reserve for CI route with mandatory validate+test prechecks only | S |
| **ARCH-08** | `mcp_tools` flat list vs runtime `mcp_tools_by_version` | Freeze in [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md): semver-keyed tool map + JSON schemas in bundle | M |
| **ARCH-09** | P5 `mount_export` string vs CDK `server.mount_module` path | Canonical manifest v1; migration table from P5 | S |
| **SPEC-04** | Install API v2 undefined (digest, multipart, local-path) | [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md) | L |
| **SPEC-05** | CLI → HTTP → hub command mapping missing | Same doc: table for validate/test/promote/apply/push | M |
| **SPEC-06** | MCP declaration + grant-filter rebuild underspecified | [07-mcp-tool-model-and-catalog-rebuild.md](./07-mcp-tool-model-and-catalog-rebuild.md) | M |
| **SPEC-08** | Local token vs cloud BFF vs CI deploy token | [08-auth-profiles-local-cloud-ci.md](./08-auth-profiles-local-cloud-ci.md) | M |
| **UX-03** | Validate errors not spec'd (Lens A messages, `--json` output) | Error catalog in [02-sdk.md](./02-sdk.md): code, message, hint, file:line | M |

---

## P1 — developer UX / XD

### Journey map (current spec) + pain

| Step | Action | Pain |
|------|--------|------|
| 0 | Discover CDK exists | No onboarding doc in kit; Configure empty until BC6 |
| 1 | `npm i -D @studio/capability-sdk` | Auth env vars undocumented priority order |
| 2 | `init` | Template choice (`default` vs `minimal` vs example) not guided |
| 3 | Author contract/UI/server | No `studio capability edit` helpers; contract JSON easy to break |
| 4 | `validate` | Errors not structured; no `--fix` hints |
| 5 | `build` | UI framework choice entirely on user; no default Vite preset doc |
| 6 | `push` | `install_id` ephemeral (UX-02); auth failures opaque |
| 7 | Configure evolution | Configure doesn't show linked source path or staged digest |
| 8 | `apply` + open Runtime | Canvas load failures (`404`, CSP) not spec'd for user-facing errors |

### UX improvements (selected)

| ID | Title | User story | Spec change | Effort |
|----|-------|------------|-------------|--------|
| **UX-04** | First-run builder card | As Alex, I see Configure steps without reading repo docs | BC2a static page in [03-shell-host.md](./03-shell-host.md) | S |
| **UX-05** | Linked source in Configure | As Dev, I see which local path/digest matches this install | Capability detail shows `source_path`, `bundle_digest`, `built_at` from push metadata | M |
| **UX-06** | `studio capability doctor` | As builder, I verify hub reachable, token scopes, space policy before push | New CLI command in [02-sdk.md](./02-sdk.md) | M |
| **UX-07** | Canvas error states | As Priya, I see actionable message when user UI fails to load | Expand [03-shell-host.md](./03-shell-host.md) error table + link to Configure apply | S |
| **UX-08** | Config schema mismatch warning | As Dev, I'm warned when live config doesn't match new `config.schema.json` on promote | Lens B warning + Configure banner | M |
| **UX-09** | Agent push recipe | As agent, I have a documented minimal loop: edit contract → validate → push | Section in [cdk.md](./cdk.md): agent grant template + command sequence | S |
| **UX-10** | Monorepo multi-capability | As platform team, I init multiple capabilities in one repo | Document workspace layout in [01-local-layout.md](./01-local-layout.md) (OD1) | S |

### Configure ↔ CDK handoff gaps

| Gap | Owner | Fix |
|-----|-------|-----|
| New Capability entry | Configure | UX-01 / UX-04 at BC2a |
| Source path + digest on install detail | Hub + Configure | UX-05 metadata on `CapabilityInstall` |
| `LIVE_APPLY_FAILED` in Configure | Configure | Show rollback hint, link to hub logs, retry apply |
| Contract diff read-only | Configure | Already planned — ensure diff uses blob-stored contract not repo |

### Agent + human parity

| ID | Recommendation |
|----|----------------|
| **PAR-01** | Same evolution HTTP for agent MCP tool `capability_push` (future) and CLI — no agent-only shortcuts |
| **PAR-02** | Agent edits source in git; never edits blob store directly |
| **PAR-03** | Sandbox-only `capability:install` for agents; prod promote human-only (already in journeys — restate in CDK) |
| **PAR-04** | CLI `--json` output for all commands so agents parse `install_id`, errors, evolution_state |

---

## P2 — spec completeness

### Coverage gaps (concern → missing doc)

| Concern | Status |
|---------|--------|
| Canonical manifest + bundle ABI | Partial — need **05-manifest-and-bundle-schema.md** |
| Install/push/apply HTTP | Partial — need **06-install-push-apply-http-contract.md** |
| MCP tool model | Partial — need **07-mcp-tool-model-and-catalog-rebuild.md** |
| Auth profiles | Missing — **08-auth-profiles-local-cloud-ci.md** |
| Security boundaries | Missing — **09-security-execution-boundaries.md** |
| Route/canvas collision | Missing — **10-routing-collision-and-canvas-resolution.md** |
| Dev watch/reload protocol | Light — **11-dev-loop-reload-protocol.md** |
| Cross-spec fixtures | Outline only — **13-conformance-fixtures-matrix.md** |

### Contradictions register

| ID | Conflict | Resolution |
|----|----------|------------|
| C-01 | Bundled catalog vs CDK-3 | SPEC-01 supersession |
| C-02 | P5 DoD `packages/review-core/manifest` | P5 marked historical; CDK acceptance replaces |
| C-03 | Manifest shape P5 vs CDK vs runtime | SPEC-02 freeze v1 |
| C-04 | config install body vs push protocol | SPEC-04 install v2 |
| C-05 | Setup wizard bundled review | Replace with SDK init + push example |
| C-06 | Apply route scattered across docs | SPEC-05 mapping table |
| C-07 | MCP rebuild details in runtime only | SPEC-06 |
| C-08 | Cloud session cookie vs direct token | SPEC-08 |
| C-09 | `push --target live` vs P5 | ARCH-07 |

---

## Unified improvement backlog (implementation order)

```
Phase 0 — Spec hardening (before code)
  SPEC-01 supersession note (12-migration)
  SPEC-02 manifest v1 freeze (05-manifest)
  SPEC-04/05 install + CLI map (06)
  ARCH-01/02 security model (09)
  UX-01/02 entry + install_id (02-sdk, plan phases)

Phase 1 — CDK-min (BC0–BC2)
  BC0 validate/build/stage
  BC2 push + BC2a Configure stub
  UX-02 push-state, UX-06 doctor

Phase 2 — CDK-standard (BC3–BC4)
  ARCH-02 iframe canvas
  ARCH-01 server isolation (minimal subprocess)
  BC3 shell host + UX-07 errors
  BC4 live apply + SPEC-06 MCP

Phase 3 — CDK-dev + polish (BC5–BC6)
  11-dev-loop-reload-protocol
  UX-05 Configure metadata
  BC6b path picker
```

---

## Proposed new spec files (this directory)

| File | Purpose |
|------|---------|
| [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md) | Canonical manifest v1, bundle tree, hash algorithm |
| [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md) | Install v2, CLI↔HTTP map, errors |
| [07-mcp-tool-model-and-catalog-rebuild.md](./07-mcp-tool-model-and-catalog-rebuild.md) | Schemas in bundle, ACL, semver tools |
| [08-auth-profiles-local-cloud-ci.md](./08-auth-profiles-local-cloud-ci.md) | Token/session/CI matrix |
| [09-security-execution-boundaries.md](./09-security-execution-boundaries.md) | Server isolation + UI iframe sandbox |
| [10-routing-collision-and-canvas-resolution.md](./10-routing-collision-and-canvas-resolution.md) | `routes_prefix`, `canvas_route` rules |
| [11-dev-loop-reload-protocol.md](./11-dev-loop-reload-protocol.md) | Watch, SSE reload, idempotency |
| [12-migration-from-bundled-catalog.md](./12-migration-from-bundled-catalog.md) | Supersession + review-* move to examples |
| [13-conformance-fixtures-matrix.md](./13-conformance-fixtures-matrix.md) | Cross-link CDK + runtime + config fixtures |

---

## Open product decisions

| ID | Question | Options |
|----|----------|---------|
| **OD-S1** | Server isolation v1 | Subprocess vs sidecar vs trusted-builder-only (dev laptop) |
| **OD-S2** | UI isolation | iframe (lean) vs separate origin subdomain per capability |
| **OD-S3** | Who computes `contract_ref_id` | Hub-only (recommended) vs builder-supplied |
| **OD-S4** | CI `target live` | Allowed with attestations vs always manual apply |
| **OD-S5** | Example templates in kit | Ship review-loop example in npm tarball vs separate `studio-examples` repo |
| **OD-S6** | Contract editing UX v1 | JSON in IDE only vs minimal Configure graph viewer |

---

## Review agents

| Lens | Agent | Key contribution |
|------|-------|----------------|
| Architecture | [opus review](1267921a-a920-46cc-9d1f-c7edc08490d9) | P0 security, mount/import risks, rollback, collisions |
| UX / XD | [sonnet review](8896cfde-1994-4ed6-aed1-7eaf8c09b0c4) | Journey friction, install_id, Configure entry, PAR parity |
| Spec completeness | [codex review](fd00b685-f9ad-4eb6-9a77-c95742bf9c01) | Coverage matrix, C-01–C-09, SPEC-01–13, No-Go verdict |

---

## Verdict

| Question | Answer |
|----------|--------|
| Is CDK direction correct? | **Yes** — aligns with user-created, local-first, thin shell |
| Ready to implement BC0–BC4? | **No** — P0 security + install API + manifest freeze block |
| Safe to prototype BC0 offline validate/build? | **Yes** — provisional, no hub import yet |
| Next spec work | **05, 06, 09** + **UX-01/02** + **12-supersession note** |

**Go criteria:** P0 closed + SPEC-02 + SPEC-04/05 drafted → re-review → **Go (controlled risk)** for BC0–BC2.

---

## Post-hardening update (2026-06-20)

Specs **05–13** created; **02–04**, **cdk**, **acceptance**, **plan**, **config/spec**, **CS-ADR-03** updated. See README index. Verdict upgraded to **Go for BC0–BC2**.
