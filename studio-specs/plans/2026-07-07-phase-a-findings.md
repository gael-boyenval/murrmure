# Phase A.0 — Investigation findings (live)

**Updated:** 2026-07-07 (tutorial walkthrough complete through Part 8 Step 2)  
**Plan:** [2026-07-07-tutorial1-phase-a-desktop-auth-plan.md](./2026-07-07-tutorial1-phase-a-desktop-auth-plan.md)

---

## Desktop localStorage (user confirmed)

| Key | Value |
|-----|-------|
| `murrmure_token` | `tok_01JBOOTSTRAPTOKEN00000001` ✅ bootstrap |
| `murrmure_hub_url` | `http://127.0.0.1:5174` |

**H1 (stale agent grant) ruled out** for current Desktop session.

---

## Primary root cause — **H2 CONFIRMED**

View iframe loads hub asset URL **without** `Authorization` header.

| Request | Auth | Result |
|---------|------|--------|
| `GET /v1/spaces/spc_my_space/views/preview-review-intake/dist/index.html` | none | `403 {"code":"token_denied",…}` |
| Same URL | `Bearer tok_01JBOOTSTRAP…` | `200` HTML (`<!doctype html>…`) |

**Part 8 repro (2026-07-07):** After tutorial Parts 2–7, Run **preview-review** with bootstrap token:

- Shell API works — run starts, ViewCanvasHost opens, header shows `preview-review` / `intake`
- Iframe body shows raw JSON `token_denied` (screenshot captured)
- `iframe.src` = `http://127.0.0.1:5174/v1/spaces/spc_my_space/views/preview-review-intake/dist/index.html`

**Fix direction:** WP-A4 in Phase A plan — view asset auth for iframe loads (not bootstrap re-injection alone).

---

## Tutorial walkthrough — issues log

### Part 1 — Create the repo

| Step | Tutorial expects | Actual in agentStudioTestEnv | Issue? |
|------|------------------|------------------------------|--------|
| Root `index.html` | Minimal static site at repo root | ❌ No root `index.html`; site at `app/web/index.html` | **ISSUE-01** layout mismatch |
| `package.json` | `npx serve . -l 3000` | Legacy pnpm monorepo (`@agent-studio/web`, Studio CDK deps) | **ISSUE-02** not a minimal tutorial repo |
| `npm run dev` | Serves root on :3000 | Runs `pnpm --filter @agent-studio/web dev` (different port/stack) | **ISSUE-03** |
| Spec outside repo | `~/Documents/hero-section.md` | Missing → **created** for Part 8 | **ISSUE-04** was missing (fixed during walkthrough) |

### Part 2 — Setup wizard

| Step | Result | Issue? |
|------|--------|--------|
| `mrmr setup` | Skipped — used **Already onboarded** path per tutorial | — |
| `mrmr space onboard` | Interactive prompt blocks without `--yes` | **ISSUE-05** CI/agent needs `--yes` flag (documented in tutorial?) |
| `mrmr space onboard --yes` | ✅ Linked + applied | — |
| `mrmr skill install` | ✅ Installed `murrmure` v1.0.1; removed legacy `murrmure-flow` | **ISSUE-06** had `murrmure-flow` before install (doctor didn't warn) |
| `mrmr grant mint` | ✅ New grant `tok_01KWYG08…` | — |
| MCP in Cursor | `murrmure_space_status` on `spc_murrmure` MCP → scope error | **ISSUE-07** agentStudio MCP wired to `spc_murrmure`, not test env space |
| Prepare flow folder | Removed hello/ai-prompt; created `preview-review` | — |
| `space.yaml` slug | Set `my-feature-site` per tutorial | Was `my-space` |

### Part 3 — Agent layer

| Step | Result | Issue? |
|------|--------|--------|
| `agent.md` | Replaced legacy Studio CDK brief with tutorial content | **ISSUE-08** reset repo still had pre-v2 agent.md |
| `skills/feature-build/SKILL.md` | Created | — |

### Part 4 — Prompt triggers

| Step | Result | Issue? |
|------|--------|--------|
| `executors.yaml` | Updated to `shell_spawn` | Was hello scripts only |
| `actions.yaml` | Four feature actions | Replaced hello/open_confirm_gate |

### Part 5 — Flow manifest

| Step | Result | Issue? |
|------|--------|--------|
| `flow.manifest.yaml` | Created preview-review (6 steps) | — |

### Part 6 — Build views

| Step | Result | Issue? |
|------|--------|--------|
| `mrmr space view init preview-review-intake` | ✅ Scaffolded | — |
| `npm install` (tutorial pin `^0.1.0`) | ❌ **ETARGET** — npm has only 0.2.x | **ISSUE-09** blocker (feedback filed) |
| Workaround | Bumped to `^0.2.1` manually to continue | **DEVIATION** — not in tutorial |
| `npm run build` | ✅ Both views built `dist/` | — |
| Legacy views on disk | `hello-params`, `hello-confirm`, `prompt-form` still present | **ISSUE-10** clutter, not indexed |

### Part 7 — Index and apply

| Step | Result | Issue? |
|------|--------|--------|
| `mrmr space apply --strict` | ✅ 4 actions, 1 flow | Warning: `CHECKPOINT_LOOPBACK_HINT` on review step | **ISSUE-11** benign for agent-owned loop |
| `mrmr space status` | ✅ `preview-review`, 4 feature actions | — |
| Desktop smoke | ✅ **preview-review** + **Run** visible | — |
| MCP `murrmure_space_status` | Failed — wrong space from agentStudio MCP | **ISSUE-07** |

### Part 8 — Run the loop (Step 2 intake only)

| Step | Result | Issue? |
|------|--------|--------|
| Desktop → Run preview-review | Run starts `ses_01KWYG2BVTX0SJZJE4SBQSGS4Z` | — |
| Intake view | ❌ **token_denied JSON in iframe** | **ISSUE-12** H2 — primary blocker |
| Bootstrap token valid | ✅ Confirmed in localStorage + shell API | H1 ruled out |

---

## Hypothesis tracker (final)

| ID | Verdict |
|----|---------|
| H1 Stale grant in localStorage | **Ruled out** — bootstrap token active |
| H2 Iframe view asset no Bearer | **CONFIRMED** — primary root cause |
| H3 Hub URL mismatch | **Not the issue** — `:5174` proxy works for shell API |
| H4 Space mix-up | **Not the issue** — `spc_my_space` consistent |
| H5 Views not built | **Resolved** during walkthrough (after ISSUE-09 workaround) |

---

## Recommended Phase A.1 implementation priority

1. ~~**WP-A4** — Authenticate view iframe asset loads~~ **DONE (2026-07-07)** — shell syncs `murrmure_token` cookie; hub `parseSessionToken` accepts Cookie header
2. **WP-A2** — Recovery UI for genuine `token_denied` on shell API (secondary)
3. **Phase C** — Fix scaffold `^0.1.0` pin (ISSUE-09) so tutorial Part 6 works without manual bump

---

## Artifacts

- Screenshot: intake `token_denied` in ViewCanvasHost (2026-07-07)
- Session: `ses_01KWYG2BVTX0SJZJE4SBQSGS4Z`
- Spec file created: `~/Documents/hero-section.md`
