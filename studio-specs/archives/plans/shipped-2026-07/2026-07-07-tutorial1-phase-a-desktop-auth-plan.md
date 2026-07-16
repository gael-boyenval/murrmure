# Plan — Phase A: Desktop auth recovery (Tutorial 1 intake)

**Date:** 2026-07-07  
**Status:** Ready to execute  
**Input:** [2026-07-07-tutorial1-unblock-discovery.md](./2026-07-07-tutorial1-unblock-discovery.md)  
**Scope:** Desktop dev HMR auth + intake view `token_denied` only. MCP (Phase B), view-sdk scaffold (Phase C), doctor (Phase D) are out of scope.

---

## Goal

A human following **Tutorial 1** in **agentStudioTestEnv** can:

1. Open Desktop dev HMR (`pnpm desktop:dev:hmr` in agentStudio monorepo).
2. Run **preview-review** and see the **intake view UI** (not raw JSON).
3. Recover from auth failure **without Cmd+Q or devtools** if a grant is revoked or stale.

---

## Confirmed symptom

Part 8 — after clicking **Run** → intake checkpoint:

```json
{"code":"token_denied","message":"Invalid or revoked token"}
```

Displayed inline where the custom view should render (ViewCanvasHost / iframe).

---

## Root-cause hypotheses (to confirm via manual tests)

We do **not** know which layer fails yet. Phase A starts with a structured repro in agentStudioTestEnv to isolate the failure.

| ID | Hypothesis | If true, fix direction |
|----|------------|------------------------|
| **H1** | Stale **agent grant** in `localStorage` overwrote bootstrap; Desktop never re-injects bootstrap on reload | Re-inject bootstrap on every `dom-ready`; clear stale token on `token_denied` |
| **H2** | **View asset iframe** loads `/v1/spaces/.../views/.../dist/index.html` without `Authorization` header; hub always returns `token_denied` JSON as iframe body | Allow same-origin view asset reads for bootstrap/local hub, or serve views via authenticated shell proxy |
| **H3** | **Hub URL mismatch** in dev HMR — `murrmure_hub_url` points at `:5174` vs `:8787` inconsistently | Normalize injection + `getHubBaseUrl()` for bundled/dev |
| **H4** | **Space / grant mix-up** — Desktop bootstrap token valid but wrong `spc_…` on run or view origin | Verify link file, active space, and token `space_id` alignment |
| **H5** | **Views not built/applied** — missing `dist/` causes a different error masked as auth failure | Part 6/7 checklist before Part 8 |

Manual tests below are designed to distinguish H1–H5 **before** writing production code.

---

## Execution order

```text
Phase A.0  Manual investigation (agentStudioTestEnv + tutorial)
    │
    ├─► Findings doc (fill checklist, pick primary hypothesis)
    │
Phase A.1  Implement fix(es) for confirmed root cause(s)
    │
Phase A.2  Automated tests in agentStudio monorepo
    │
Phase A.3  Re-run manual Tutorial 1 Part 8 acceptance
    │
Phase A.4  Docs update (desktop.md + tutorial troubleshooting)
```

---

## Phase A.0 — Manual investigation protocol

**Who runs this:** Agent or human in **agentStudioTestEnv** space repo, with agentStudio monorepo Desktop dev HMR running.

**Prerequisites:**

| Item | Command / check |
|------|-----------------|
| agentStudio monorepo | `pnpm desktop:dev:hmr` — hub `:8787`, shell Vite `:5174`, Electrobun window |
| agentStudioTestEnv | Reset to pre-tutorial or clean state; note `spc_…` from `.murrmure/link` |
| CLI | `mrmr whoami` from test env root |
| Cursor | Optional for full tutorial; not required for intake-only repro |

**Record every step** in a findings table (template at end of this section).

### A.0.1 — Baseline auth (before tutorial)

Run from **agentStudioTestEnv** root:

```bash
mrmr whoami
mrmr space status 2>/dev/null || echo "not linked yet"
cat .murrmure/link 2>/dev/null || echo "no link file"
```

In Desktop (if already open): open devtools → Application → Local Storage → note:

- `murrmure_token` (first 20 chars + whether it starts with `tok_01JBOOTSTRAP`)
- `murrmure_hub_url`
- `murrmure_active_space`

**Expected (healthy):** bootstrap token in Desktop; CLI `whoami` succeeds.

| Checkpoint | Pass criteria | Actual | Notes |
|------------|---------------|--------|-------|
| CLI whoami | 200, actor present | | |
| Desktop localStorage token | Bootstrap or valid grant | | |
| Link file space id | Matches tutorial space | | |

### A.0.2 — Tutorial Part 2 (setup wizard)

Follow [02-setup-wizard.md](../../apps/docs/guide/tutorials/01-local-preview-review/02-setup-wizard.md):

```bash
cd <agentStudioTestEnv>
mrmr setup
# OR if partially done:
mrmr space onboard
mrmr skill install
mrmr grant mint --space spc_… --capabilities flow:run,flow:read,action:invoke,gate:resolve,journal:read,space:read --label cursor
```

**After setup, re-check Desktop localStorage.** Did `murrmure_token` change from bootstrap to a minted grant?

| Checkpoint | Pass criteria | Actual | Notes |
|------------|---------------|--------|-------|
| `murrmure/` exists | actions, flows dir | | |
| MCP snippet written | `.cursor/mcp.json` | | |
| Desktop token after setup | Record old → new | | H1 signal if agent grant replaced bootstrap |

**Do not paste agent grant into Desktop `/connect`** unless explicitly testing H1 — that path overwrites operator session.

### A.0.3 — Tutorial Parts 3–5 (agent layer + manifest)

Follow parts 3–5 in docs (or copy from `examples/flows/preview-review-v2/` if agent already scaffolded).

Minimum for intake repro:

- `murrmure/flows/preview-review/flow.manifest.yaml` with **intake** checkpoint + `preview-review-intake` view
- `murrmure/actions.yaml` with four feature actions

| Checkpoint | Pass criteria | Actual | Notes |
|------------|---------------|--------|-------|
| Flow manifest valid | `mrmr space apply` no strict errors | | |

### A.0.4 — Tutorial Part 6 (build views)

Follow [06-build-views.md](../../apps/docs/guide/tutorials/01-local-preview-review/06-build-views.md):

```bash
mrmr space view init preview-review-intake
cd murrmure/views/preview-review-intake
npm install && npm run build
# repeat for preview-review if needed
```

If `npm install` fails (view-sdk ETARGET), **note it** — that is Phase C, but document workaround used (workspace link, manual pin, etc.) so Part 8 isn't blocked by missing `dist/`.

| Checkpoint | Pass criteria | Actual | Notes |
|------------|---------------|--------|-------|
| `dist/index.html` exists | both views | | H5 |
| npm install | succeeds | | |

### A.0.5 — Tutorial Part 7 (apply)

```bash
mrmr space apply --strict
mrmr space status
```

Desktop: space home → **preview-review** visible with **Run**. Do not run yet.

| Checkpoint | Pass criteria | Actual | Notes |
|------------|---------------|--------|-------|
| apply --strict | exit 0 | | |
| status lists flow + 2 views + 4 actions | | | |
| Desktop shows Run | | | |

### A.0.6 — Tutorial Part 8 Step 2 (intake repro + network trace)

1. Desktop → space → **Run** **preview-review**
2. Observe intake step

**If `token_denied` JSON appears:**

Open devtools → **Network** tab. Filter `v1`. Record each failing request:

| Request | Method | Status | Response body | Auth header present? |
|---------|--------|--------|---------------|---------------------|
| e.g. `/v1/runs/...` | GET | | | yes (shell client) |
| e.g. `/v1/spaces/.../views/.../dist/index.html` | GET | 403 | token_denied | **no** (iframe) |

Also run from terminal (replace token and space):

```bash
# Bootstrap token (should work)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer tok_01JBOOTSTRAPTOKEN00000001" \
  "http://127.0.0.1:8787/v1/spaces/<spc_id>/views/preview-review-intake/dist/index.html"

# No auth (simulates iframe)
curl -s \
  "http://127.0.0.1:8787/v1/spaces/<spc_id>/views/preview-review-intake/dist/index.html"
```

| Outcome | Primary hypothesis |
|---------|-------------------|
| Shell API calls 403, iframe never loads | H1 or H4 |
| Shell API 200, iframe GET 403 without Authorization | **H2** |
| 404 VIEW_ASSET_NOT_FOUND | H5 |
| 200 with curl + Bearer, 403 without | H2 confirmed |

### A.0.7 — Optional H1 repro (grant overwrite)

Only if H1 still plausible after A.0.6:

1. Note current Desktop `murrmure_token`
2. Mint a throwaway grant: `mrmr grant mint --space spc_… --capabilities space:read --label test-revoke`
3. Paste into Desktop `/connect` → Save (or inject via devtools)
4. Revoke: `mrmr grant revoke <token_id>`
5. Reload Desktop window (not Cmd+Q)
6. Retry Run → intake

| Checkpoint | Pass criteria | Actual | Notes |
|------------|---------------|--------|-------|
| After revoke + reload | Bootstrap restored OR recovery UI | | Current bug: stays on revoked token |

### A.0.8 — Investigation exit criteria

Proceed to A.1 when:

- [ ] Primary hypothesis selected (H1, H2, H4, or combination)
- [ ] Failing HTTP requests identified (shell vs iframe)
- [ ] Findings table completed and pasted into PR / issue

---

## Phase A.1 — Implementation (after investigation)

Implement **only** what the investigation confirms. Suggested work packages:

### WP-A1 — Bootstrap re-injection (H1)

**Files:** `apps/desktop/src/main.ts`, `apps/desktop/src/session.ts`

| Change | Detail |
|--------|--------|
| Remove one-shot `bootstrapped` gate | Call `executeJavascript(injectionScript)` on **every** `dom-ready`, or at least when navigating to `/`, `/connect`, `/spaces/*` |
| Idempotent injection | Script overwrites `murrmure_token` + `murrmure_hub_url` safely |
| Dev HMR hub URL | Keep `sessionHubUrl` consistent (shell origin `:5174` in dev so API proxy works) |

### WP-A2 — Shell `token_denied` recovery (H1, A2)

**Files:** `packages/shell-web/src/providers/ShellClientProvider.tsx`, new `AuthRecoveryPage` or banner, `packages/shell-client` error mapping

| Change | Detail |
|--------|--------|
| Global interceptor | On API response `code: token_denied`, clear `murrmure_token` and trigger recovery |
| Recovery UI | Bundled Desktop: "Session expired" + **Reconnect** button (re-run bootstrap injection via hash reload or postMessage to desktop host) |
| No raw JSON in canvas | Never render hub error JSON as iframe fallback content |

### WP-A3 — Desktop menu: Reset session (A2)

**Files:** `apps/desktop/src/menus.ts`, `apps/desktop/src/main.ts`

| Change | Detail |
|--------|--------|
| Menu item | **Reset desktop session** — clears auth keys, reloads `bootstrapLaunchUrl` |
| Connection status | Optional: show truncated token id / bootstrap vs grant in About submenu |

### WP-A4 — View asset auth for iframe (H2)

**Only if A.0.6 confirms iframe GET fails without Bearer.**

Options (pick one in implementation PR):

| Option | Pros | Cons |
|--------|------|------|
| **A4a** — Bootstrap read-only cookie set by shell on login; view asset route accepts cookie | Iframe loads work without query tokens | Cookie plumbing in hub + shell |
| **A4b** — Shell proxy route `/shell/views/...` that adds Bearer server-side | No hub auth model change | New shell-server or Vite middleware |
| **A4c** — Short-lived view asset ticket in iframe URL query (`?vat=…`) | Minimal cookie work | Token in URL / expiry handling |

**Recommendation:** Start with **A4b or A4c** for local hub only; document security boundary (localhost operator session).

**Files:** `packages/hub-daemon/src/routes/views/index.ts`, `packages/shell-web/vite.config.ts` or hub middleware, `ViewCanvasHost.tsx` (append ticket to iframe src if A4c).

### WP-A5 — Space alignment guard (H4)

**Files:** `packages/shell-web/src/routes/*`, optional Desktop startup check

| Change | Detail |
|--------|--------|
| Warn on mismatch | If active space ≠ linked space from run, show operator message |
| Docs | Clarify: Desktop = bootstrap operator; MCP grant = Cursor agent only — never paste agent grant into Desktop |

---

## Phase A.2 — Automated tests (monorepo)

Add tests alongside implementation; do not block A.0 on these.

| Test | Location | Asserts |
|------|----------|---------|
| Injection on every dom-ready | `apps/desktop/test/main.test.ts` | `executeJavascript` called more than once across reloads |
| Recovery clears token | `packages/shell-web/src/...test.tsx` | `token_denied` → storage cleared + recovery route |
| Reset menu action | `apps/desktop/test/menus.test.ts` | menu fires reload with bootstrap URL |
| View asset with auth (if WP-A4) | `packages/hub-daemon/test/http/flows/requires-view.test.ts` | iframe-simulated GET succeeds in bundled mode |
| Session injection script | `apps/desktop/test/session.test.ts` | existing + redirect behavior unchanged |

---

## Phase A.3 — Manual acceptance (Tutorial 1 Part 8)

Re-run in **agentStudioTestEnv** after fixes:

| Step | Pass |
|------|------|
| Part 7 apply strict | ✓ |
| Desktop Run preview-review | ✓ |
| Intake view UI visible (reviewer, spec markdown, Start button) | ✓ |
| Submit intake → run advances (write_spec invoked) | ✓ |
| H1 repro: revoke grant → reload → intake still works OR recovery UI one click | ✓ |

Agent MCP steps (`complete_action`, `wait_for_gate`) are **Phase B** — not required for Phase A sign-off.

---

## Phase A.4 — Documentation

| Doc | Update |
|-----|--------|
| `apps/docs/guide/desktop.md` | "Token expired or revoked" recovery; bootstrap vs agent grant |
| `apps/docs/guide/tutorials/01-local-preview-review/09-troubleshooting.md` | Intake `token_denied` row with Desktop-specific fix |
| `studio-specs/plans/2026-07-07-tutorial1-unblock-discovery.md` | Mark Phase A complete; link to PR |

---

## Success criteria

1. Intake view renders in Desktop dev HMR for agentStudioTestEnv after tutorial Parts 2–7.
2. `token_denied` never shown as raw JSON with no recovery path.
3. Investigation findings document which hypothesis was root cause (for Phase B/C planning).
4. Automated tests cover bootstrap re-injection and recovery path.

---

## Out of scope (Phase A)

- Cursor MCP / stdio bridge / hub HTTP MCP for agents (Phase B)
- view-sdk scaffold pin / npm ETARGET (Phase C)
- `mrmr space doctor` skill drift (Phase D)
- Packaged `.app` smoke (follow-up after dev HMR green)
- Full Tutorial 1 agent loop through commit (Phase B dependency for MCP)

---

## Feedback files addressed by Phase A

When complete, mark resolved and delete:

- `feedbacks/2026-07-07-failure-token-denied-desktop-no-recovery.md`
- `feedbacks/2026-07-07-failure-desktop-revoked-grant-localstorage.md`

---

## References

| Resource | Path |
|----------|------|
| Discovery | [2026-07-07-tutorial1-unblock-discovery.md](./2026-07-07-tutorial1-unblock-discovery.md) |
| Desktop main | `apps/desktop/src/main.ts` |
| Session injection | `apps/desktop/src/session.ts` |
| Desktop bootstrap hash | `packages/shell-web/src/desktop-bootstrap.ts` |
| View asset route | `packages/hub-daemon/src/routes/views/index.ts` |
| ViewCanvasHost | `packages/shell-web/src/components/ViewCanvasHost.tsx` |
| Tutorial Part 8 | `apps/docs/guide/tutorials/01-local-preview-review/08-run-the-loop.md` |
| Reference flow | `examples/flows/preview-review-v2/` |
