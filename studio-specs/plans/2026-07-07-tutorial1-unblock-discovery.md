# Discovery — Tutorial 1 unblock (feedback triage)

**Date:** 2026-07-07  
**Status:** Discovery complete — Phase A plan written: [2026-07-07-tutorial1-phase-a-desktop-auth-plan.md](./2026-07-07-tutorial1-phase-a-desktop-auth-plan.md)  
**Primary goal:** Unblock Tutorial 1 end-to-end in **agentStudioTestEnv** (`spc_my_space`)

---

## Executive summary

Feedback triage on 2026-07-07 surfaced **one confirmed runtime blocker** and several secondary DX issues. The user cannot complete **Tutorial 1 Part 8** because the **intake view** in Desktop dev HMR renders raw JSON instead of the custom view:

```json
{"code":"token_denied","message":"Invalid or revoked token"}
```

Secondary blockers (MCP tool discovery in Cursor, view-sdk scaffold pin, doctor gaps) will matter once intake works and the agent loop runs — but **Phase A** targets Desktop auth recovery only.

The user reset **agentStudioTestEnv** to a pre-tutorial state; exact grant history and Part 6 build status are **unknown**. An agent performed prior setup steps autonomously — the user suspects **user grants, spaces, and agent tokens may be mixing up**.

---

## Triage session — what we did

1. Read all files under `feedbacks/`.
2. Cross-checked codebase against feedback claims.
3. **Deleted 9 feedback files** that were shipped or non-actionable (see [Cleanup](#cleanup-deleted-feedback-files)).
4. Reviewed remaining feedback with the user via conversation (not code).
5. Confirmed scope: document everything here; **implement plan for Phase A only** next.

---

## User context (from conversation)

| Question | Answer |
|----------|--------|
| Primary goal | Unblock Tutorial 1 in **agentStudioTestEnv** |
| Where does Part 8 break? | **Intake view** — `token_denied` JSON inline, not the view UI |
| Environment | **Desktop dev HMR** (`pnpm desktop:dev:hmr`) |
| Repo | **agentStudioTestEnv** (external space repo, not monorepo example) |
| Grant / connect history | **Unknown** — agent did setup; user wonders if grants/spaces/agents are conflated |
| Hub / whoami state | User **reset test env to pre-tutorial** — current auth state unknown |
| Part 6 (view build) status | **Unknown** |
| MCP in Cursor | Tools not visible in Cursor settings; CLI may be under NVM path |
| Doctor expansion | **Deferred** |
| view-sdk in scaffold | **No version pin**; docs should read as published npm (no monorepo refs, no version numbers in docs) |
| app/web vs root layout | **Not a user concern** — deprioritize |
| Next deliverable | This discovery doc → then **Phase A plan only** |

---

## Confirmed symptom (P0)

**When:** Tutorial 1 Part 8 — Desktop → space → Run **preview-review** → intake step  
**Expected:** Custom intake view (`preview-review-intake`) in ViewCanvasHost  
**Actual:** Inline JSON error:

```json
{"code":"token_denied","message":"Invalid or revoked token"}
```

**Interpretation:** View asset or gate/checkpoint API call is authenticated with an **invalid or revoked token** stored in Desktop shell `localStorage`, not the bootstrap operator token. This matches two open failure reports (see [Issue A1](#issue-a1-desktop-token_denied-blocks-intake-view)).

---

## Architecture notes (for planning)

### Desktop auth model today

```text
Desktop launch
    │
    ├─ runner.ts: bootstrapLaunchUrl(hubUrl, bootstrapToken)
    │     → shell loads with #murrmure-bootstrap=<token> hash
    │
    ├─ desktop-bootstrap.ts: reads hash once, writes localStorage, strips hash
    │
    └─ main.ts: on first dom-ready only (bootstrapped flag)
          → executeJavascript(createSessionInjectionScript(bootstrapToken))
          → overwrites murrmure_token + murrmure_hub_url in localStorage

/connect (ConnectPage.tsx): user can Save & continue
    → overwrites murrmure_token with a minted agent grant

After grant revoked or hub reset:
    → localStorage keeps stale token
    → reload does NOT re-inject bootstrap (bootstrapped = true for window lifetime)
    → API/view loads return token_denied
    → recovery: Cmd+Q cold quit or manual localStorage cleanup
```

**Relevant code:**

- `apps/desktop/src/main.ts` — one-shot `bootstrapped` flag on `dom-ready`
- `apps/desktop/src/session.ts` — injection script writes `localStorage`
- `packages/shell-web/src/desktop-bootstrap.ts` — hash bootstrap (first navigation only)
- `packages/shell-web/src/routes/ConnectPage.tsx` — persists user-supplied grants

### MCP connection model today

```text
Path 1 — Cursor stdio bridge (documented today)
    Cursor mcp.json → spawns `murrmure mcp` CLI subprocess (stdio MCP)
        → CLI fetches GET /v1/mcp/catalog, proxies POST /v1/mcp/tools/call

Path 2 — Hub HTTP MCP (already exists, used as fallback)
    GET  /v1/mcp/catalog
    POST /v1/mcp/tools/call
    POST /v1/mcp/session/handshake  (control bus / wake delivery)
```

**User confusion clarified:** “Hub-hosted MCP” does **not** mean a remote cloud service. The **hub daemon already runs locally** inside Desktop dev (`http://127.0.0.1:8787`). The question is whether Cursor should talk to that **local hub HTTP API** directly instead of spawning a **local CLI subprocess** (`murrmure mcp`) that may be missing from PATH (NVM, etc.).

**Open product question for Phase B:** Can Cursor’s MCP config point at a local HTTP/SSE endpoint on the hub, or must we keep/fix the stdio bridge? Phase A does not depend on this.

### Grants, spaces, and agents — mixing risk

The user suspects conflation between:

| Actor | Typical token | Purpose |
|-------|---------------|---------|
| Desktop operator | Bootstrap token (`tok_01JBOOTSTRAPTOKEN…`) | Human runs flows in bundled shell |
| Cursor agent | Minted grant (`mrmr grant mint …`) | MCP tools in IDE |
| Space repo | `.cursor/mcp.json` + `.murrmure/link` | Binds repo to `spc_…` |

Failure modes if mixed:

- Agent grant saved into Desktop `localStorage` via `/connect` → Desktop uses agent-scoped token for shell API → wrong capabilities or revoked grant bricks UI.
- Multiple spaces / repos sharing one hub DB but different link files.
- Tutorial assumes one space (`spc_my_space`) but Desktop or MCP points elsewhere.

**Phase A investigation should trace:** which token Desktop shell sends on view load, whether it matches bootstrap, and whether `/connect` or MCP paste overwrote it.

---

## Cleanup — deleted feedback files

Removed during triage because issues were **shipped** (see `apps/docs/guide/known-gaps.md` B1–B6) or **non-actionable**:

| File | Reason |
|------|--------|
| `2026-07-02-improvement-space-apply-validation.md` | Apply lint shipped (B5) |
| `2026-07-02-improvement-cli-scaffolding-layer-guide.md` | Duplicate of flow init |
| `2026-07-02-improvement-cli-flow-init-scaffolding.md` | `mrmr space flow init` shipped (B6) |
| `2026-07-02-improvement-flow-init-role-stubs.md` | Same |
| `2026-07-02-improvement-shell-spawn.md` | `MURRMURE_*` env shipped (B3) |
| `2026-07-02-improvement-views-mid-flow-ui.md` | ViewCanvasHost at checkpoints shipped (B4) |
| `2026-07-02-improvement-flow-engine-gate-steps.md` | Checkpoint dispatch shipped (B1) |
| `-improvement-flow-engine-step-outputs.md` | Step outputs shipped (B2) |
| `2026-07-07-failure-integration-failure-test.md` | Smoke emit, payload `"test"` only |

---

## Open issues inventory

### Phase A — Desktop auth recovery (next plan)

#### Issue A1: Desktop `token_denied` blocks intake view

| Field | Detail |
|-------|--------|
| **Priority** | P0 — confirmed user blocker |
| **Symptom** | Intake shows `{"code":"token_denied",…}` instead of view |
| **Environment** | Desktop dev HMR |
| **Feedback** | `feedbacks/2026-07-07-failure-token-denied-desktop-no-recovery.md` |
| **Related** | `feedbacks/2026-07-07-failure-desktop-revoked-grant-localstorage.md` |
| **Root cause (hypothesis)** | Stale grant in `localStorage`; bootstrap not re-injected on reload |
| **Suggested fixes (from feedback)** | Re-inject bootstrap on every `dom-ready` or on `token_denied`; global shell interceptor → recovery screen; Desktop menu “Reset session”; document recovery in `apps/docs/guide/desktop.md` |
| **Code touchpoints** | `apps/desktop/src/main.ts`, `apps/desktop/src/session.ts`, `packages/shell-web/src/desktop-bootstrap.ts`, shell API client error handling |
| **Verification** | Save grant → revoke → reload → intake view loads with bootstrap token; no raw JSON error |

#### Issue A2: No in-app recovery when auth fails

| Field | Detail |
|-------|--------|
| **Priority** | P0 (same fix surface as A1) |
| **Symptom** | User cannot reach `/connect`, paste grant, or clear token from Desktop UI |
| **Feedback** | Same two Desktop failure files |
| **Docs gap** | `apps/docs/guide/desktop.md` — no “token expired/revoked” recovery path |
| **User constraint** | Fix should work in **dev HMR** first |

#### Issue A3: Grant / space / agent identity confusion (investigation)

| Field | Detail |
|-------|--------|
| **Priority** | P0 investigation during Phase A |
| **User concern** | Agent performed setup; unclear which tokens belong to Desktop vs Cursor vs space |
| **Questions to answer in Phase A plan** | What token does view iframe request use? Did `/connect` overwrite bootstrap? Is `spc_my_space` consistent across link, MCP, Desktop? |
| **Not yet reproduced** | User reset test env — repro may need scripted setup |

---

### Phase B — MCP + agent loop (deferred)

#### Issue B1: Cursor MCP catalog empty / tools not in settings

| Field | Detail |
|-------|--------|
| **Priority** | P1 — blocks agent `murrmure_complete_action`, `murrmure_wait_for_gate` after intake |
| **Symptom** | Cursor settings show no Murrmure tools; `CallMcpTool` may only see `mcp_auth` |
| **Feedback** | `feedbacks/2026-07-07-improvement-mcp-discovery.md`, `feedbacks/2026-07-07-failure-cursor-mcp-bridge-callmcptool.md` |
| **Contributing factors** | CLI `murrmure mcp` not on PATH (NVM); post-auth catalog refresh; Cursor server name mismatch (`murrmure` vs `project-0-…-murrmure`) |
| **Hub HTTP works** | `POST /v1/mcp/tools/call` succeeds when called directly |
| **User direction** | Move away from stdio CLI bridge toward **local hub HTTP** connection from Cursor — exact Cursor config TBD |
| **Existing hub API** | `packages/hub-daemon/src/routes/mcp/index.ts` |

#### Issue B2: Tutorial Part 2 MCP connectivity step

| Field | Detail |
|-------|--------|
| **Priority** | P1 |
| **Symptom** | Tutorial asks agent to call `murrmure_space_status`; fails if MCP broken |
| **Dependency** | B1 |

---

### Phase C — Scaffold + docs hygiene (deferred)

#### Issue C1: view-sdk scaffold pin causes npm ETARGET

| Field | Detail |
|-------|--------|
| **Priority** | P1 for external repos using npm (not monorepo workspace links) |
| **Symptom** | `mrmr space view init` + `npm install` → `No matching version for @murrmure/view-sdk@^0.1.0` |
| **Feedback** | `feedbacks/2026-07-07-failure-view-sdk-etarget.md`, `feedbacks/2026-07-07-failure-dependency-mismatch-view-sdk-scaffold.md` (duplicate) |
| **Current template** | `packages/cli/templates/views/vite-react/package.json` still pins `^0.1.0` |
| **npm publishes** | `0.2.0`, `0.2.1` only |
| **User preference** | **No version pin in scaffold**; docs must not mention versions; treat as published package (no monorepo refs in docs) |

#### Issue C2: Tutorial Part 1 repo layout vs test env

| Field | Detail |
|-------|--------|
| **Priority** | Low — user not blocked on this |
| **Feedback** | `feedbacks/2026-07-07-improvement-docs-tutorial-part1-app-web-layout.md` |
| **Claim** | Docs assume root `index.html`; test env may use `app/web/` |
| **User response** | Not a current concern — skip unless repro appears |

---

### Phase D — Doctor / onboarding (explicitly deferred)

#### Issue D1: Skill name/path drift not detected

| Field | Detail |
|-------|--------|
| **Priority** | Later |
| **Feedback** | `feedbacks/2026-07-07-failure-integration-skill-name-path-drift.md` |
| **Symptom** | Legacy `.cursor/skills/murrmure-flow/` not flagged by `mrmr space doctor` |
| **User decision** | Defer |

#### Issue D2: Doctor should catch SDK pin + live MCP catalog

| Field | Detail |
|-------|--------|
| **Priority** | Later |
| **Feedback** | `feedbacks/2026-07-07-improvement-cli-doctor.md` |
| **User decision** | Defer |

---

## Proposed remediation phases

| Phase | Scope | Status |
|-------|-------|--------|
| **A** | Desktop auth recovery — fix intake `token_denied`, in-app recovery, grant identity investigation | **Next: write implementation plan** |
| **B** | MCP — local hub connection for Cursor; tutorial MCP steps | Deferred |
| **C** | view-sdk scaffold (no pin) + docs as published npm | Deferred |
| **D** | `mrmr space doctor` expansion | Deferred |

---

## Phase A — success criteria (for upcoming plan)

1. User can Run **preview-review** in Desktop dev HMR and see **intake view UI** (not JSON error).
2. After grant revoke or hub restart, Desktop **recovers without Cmd+Q or devtools**.
3. Bootstrap operator token is **canonical** for bundled Desktop; agent grants do not brick shell when revoked.
4. Repro script or manual checklist documented for agentStudioTestEnv reset → setup → Part 8 Step 2.

---

## Unknowns to resolve in Phase A plan

1. Exact token in Desktop `localStorage` at failure time (`murrmure_token`, `murrmure_hub_url`).
2. Whether agentStudioTestEnv Part 6 views were built and applied before Part 8 attempt.
3. Whether `/connect` was used and which grant was saved.
4. Whether view load failure is **shell API** auth or **view asset** fetch auth (separate code paths).
5. Hub DB state after “reset to pre-tutorial” — bootstrap token still valid?

---

## References

### Remaining feedback files (8)

- `feedbacks/2026-07-07-failure-desktop-revoked-grant-localstorage.md`
- `feedbacks/2026-07-07-failure-token-denied-desktop-no-recovery.md`
- `feedbacks/2026-07-07-failure-cursor-mcp-bridge-callmcptool.md`
- `feedbacks/2026-07-07-improvement-mcp-discovery.md`
- `feedbacks/2026-07-07-failure-view-sdk-etarget.md`
- `feedbacks/2026-07-07-failure-dependency-mismatch-view-sdk-scaffold.md`
- `feedbacks/2026-07-07-failure-integration-skill-name-path-drift.md`
- `feedbacks/2026-07-07-improvement-cli-doctor.md`
- `feedbacks/2026-07-07-improvement-docs-tutorial-part1-app-web-layout.md`

### Tutorial path

- Overview: `apps/docs/guide/tutorials/01-local-preview-review/index.md`
- Part 8 (blocked): `apps/docs/guide/tutorials/01-local-preview-review/08-run-the-loop.md`
- Troubleshooting: `apps/docs/guide/tutorials/01-local-preview-review/09-troubleshooting.md`

### Reference implementation

- `examples/flows/preview-review-v2/`

### Shipped capabilities (context — not open)

- `apps/docs/guide/known-gaps.md` — B1–B10 closed as of 2026-07-03

---

## Next step

Execute **[2026-07-07-tutorial1-phase-a-desktop-auth-plan.md](./2026-07-07-tutorial1-phase-a-desktop-auth-plan.md)** — begin with **Phase A.0** manual investigation in agentStudioTestEnv before implementing fixes.
