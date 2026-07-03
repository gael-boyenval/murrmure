# Plan review synthesis (2026-07-03)

**Status:** historical — pre-rev-5 synthesis; open questions resolved in [decisions/](./decisions/README.md)  
**Current executable spec:** [index.md](./index.md) **rev-5** — sequential phases 01–10  
**Prior:** rev-4 adopted; rev-3 north-star amendments  
**Plan reviews:** [plan-review-1.md](./plan-review-1.md) · [plan-review-2.md](./plan-review-2.md) · [plan-review-3.md](./plan-review-3.md)

---

## 1. Underlying goals (what we are actually building)

Murrmure is an **agentic operating system** — protocol kernel + **custom views as the primary human interface**.

| Goal | Finished-product expression |
|------|---------------------------|
| **Agentic OS** | Spaces, flows, agents (MCP), hooks, gates — coordinated work across boundaries |
| **Custom views = the product** | Authors ship full UI in `murrmure/views/`; **ViewCanvasHost**; shell chrome recedes |
| **Shell = admin** | Space home, flowchart, notifications — operator/debug, not end-user default |
| **Durable workflows** | `murrmure/` space directory indexed by `mrmr space apply` |
| **Agent coordination** | MCP + grants + **`murrmure`** skill |
| **Human onboarding** | `mrmr setup` wizard |
| **No second product inside the product** | **Delete** FDK worker install (phase 07) |

---

## 1a. North star alignment (normative — supersedes earlier "optional" framing)

Murrmure is an **agentic operating system**, not a generic admin dashboard with optional UI. This is the lens the whole backlog is measured against. Source: [philosophy.md § North star](../../../current/product/philosophy.md#north-star-non-negotiable--2026-07-03).

| Principle | Plan expression |
|-----------|-----------------|
| **Custom views are the product** | Authors build full UI in `murrmure/views/`; humans work inside **ViewCanvasHost** (full primary-region canvas) — phase 06 |
| **Hiding generic shell chrome behind custom views is success** | Not an edge case; the target end-state for every human-facing flow |
| **Shell chrome = admin/operator mode** | Space home, flowchart, notifications, gate inbox = observe/debug/manage grants — not what authors ship to end users |
| **Never ship drawers/built-in forms as the primary path** | `ViewDrawer` / `GateResolvePanel` / built-in gate forms are **fallback/admin only** when a view is specified or expected |
| **Protocol = kernel, views = human OS shell** | Sessions, runs, gates, invoke, hooks (kernel) vs custom views (human-facing shell) |

**Correction to rev-2:** the second review's "**Phase 06 optional — built-in gate forms enough**" verdict is **superseded**. Under the north star, **phase 06 is required** and is the human-OS centerpiece (rev-3, [index.md](./index.md) build order, [05-view-canvas-checkpoints.md](./05-view-canvas-checkpoints.md)). Built-in gate forms remain **only** as a fallback when a view bundle is missing at apply.

---

## 1b. Rev-4 decisions (2026-07-03) — spec gaps closed

| Decision | Spec |
|----------|------|
| **Do not delete flow-kit `/react` without replacement** | [02-view-sdk.md](./02-view-sdk.md) — port to `@murrmure/view-sdk/app`; blocks 07 M6 |
| **Review loop is a first-class v2 workflow** | [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md) — session + run + gate loop |
| **Multi-round loops in declarative flows** | [03](./03-engine-completion.md) — `checkpoint.on_resolve.when/values/default/cancel` |
| **View author DX** | Vite+React `mrmr view init`, `createViewMount`, gate submit payload |
| **Plan = spec** | Phase docs define schemas, APIs, fixtures — not direction-only steps |

**Retire naming:** FDK, flow-kit, flow-dev-kit in author docs → **view-sdk** + **space directory**.

---

## 2. Review conclusions (cross-agent consensus)

### What was wrong with rev-1 plan (old 01–08)

| Issue | Fix in rev-2 |
|-------|--------------|
| Engine gaps (01–03) shipped after scaffolds/wizards | **01 lint first**, **02 engine**, then **03 scaffold** |
| Eight phases = eight products | **Five tracks** + deletion + docs (still numbered 01–08 for clarity) |
| FDK "deferred" but still in daemon/CLI/docs | **Phase 07: delete**, not quarantine |
| Skill late + flow-centric | **Phase 04a early** — rename + gaps |
| setup.ts prints commands | **Phase 05 MVP** — execute init/link/apply |
| Thin acceptance (vitest filter only) | **Phase 08** — fixtures, user tests, CI |
| Human docs duplicate agents-mcp, tutorials | **Phase 08** explicit doc rewrite checklist |
| Phase 04 (gate views) blocked golden path | Reordered so views don't block the kernel golden path — but **phase 06 is required** (rev-3, see §1a); built-in forms are fallback only, not "enough" |

### Architecture simplifications adopted

1. **Single space package model** — `actions.yaml` with inline executor bindings; optional `hooks.yaml`; no separate `executors.yaml` in scaffolds.
2. **Two authoring surfaces only** — (a) `murrmure/` + apply durable flows, (b) MCP orchestration attach for ephemeral agent proposals.
3. **`ENGINE_DISPATCH_KINDS`** — shared registry for lint + advance.
4. **One human UI protocol** — view-sdk postMessage for both start and gate; the **custom view (ViewCanvasHost) is the primary human path**, built-in gate form is fallback only when a view bundle is missing (phase 06).
5. **Hooks not trigger-register wizards** — write `hooks.yaml` + apply.

### Explicit rejection: quarantine

Review initially suggested "quarantine FDK behind env flag." **Product decision (user): full deletion** of anything not landing in finished Desktop + CLI. See [09-fdk-deletion.md](./09-fdk-deletion.md).

---

## 3. Second review (rev-2) — verdict and amendments

**Verdict:** Adopt with amendments — not "Go" until amendments below are in plan docs.

| Blocker | Amendment (applied rev-3) |
|---------|---------------------------|
| B-ID collision (spec §21 vs known-gaps B1–B6) | spec §21 uses **phase numbers**; known-gaps keeps **symptom IDs** B1–B6 with explicit cross-ref |
| Phase 07 inventory incomplete | Expanded matrix: CLI modules, hub routes, tests, desktop bundle, internal 07a–07g order |
| Delete before v2 replacements | **07-pre** gate: v2 demos + acceptance rewrite before delete PR |
| Phase 08 checklist thin | Added installation.md, cli.md, mcp-tools.md, VitePress nav, tutorial tree, **08-U*** proofs |
| Phase 05 MVP vs full proof mismatch | Split **05-U1a** (MVP execute) / **05-U1b** (grant + MCP) |
| Keep list ambiguous | Explicit keep: run/list/status, orchestration attach, view-sdk, hooks |
| 03 typo | Fixed `06-U*` → `03-U*` header |

### Second review strengths (unchanged)

- Execution order 01→02→03→06→04→05→07→08 is coherent
- Full deletion policy is correct product decision
- Phase 08 doc-role split is right (note: rev-2 called phase 06 "optional"; rev-3 corrects this to **required** — see §1a)
- Doc update is now a first-class phase (08), not an afterthought

---

## 4. Reshaped phase map (old → new)

| New # | Name | Absorbs (old) |
|-------|------|---------------|
| **01** | Apply validation | old 05 |
| **02** | Engine completion | old 01 + 02 + 03 |
| **03** | Space flow scaffold | old 06 (no FDK coexistence) |
| **04** | Unified murrmure skill | old 07 (04a early / 04b rolling) |
| **05** | CLI setup wizards | old 08 (MVP first) |
| **06** | gate.requires_view | old 04 (reordered; **required** per §1a) |
| **07** | FDK deletion | *(new)* |
| **08** | Docs + proof | *(new)* |

---

### North-star alignment grading (by phase)

| Phase | Grade | Why this grade | Follow-through needed |
|-------|-------|----------------|-----------------------|
| **01** Apply validation | B | Enables honesty early: unsupported/fallback paths are visible before runtime | Keep strict checks for view/fallback mismatches |
| **02** Engine completion | B+ | Delivers gate/runtime behavior needed by view-driven human checkpoints | Keep runtime docs explicit: built-in forms are fallback-only |
| **03** Space flow scaffold | A- | Makes `murrmure/views/` first-class in default authoring structure | Keep scaffold templates shipping a real view path for gate flows |
| **04** Unified skill | B | Aligns agent guidance with the view-first product model | Keep skill references consistent with ViewCanvasHost/admin-shell language |
| **05** CLI setup wizards | B | Preserves CLI mutate vs shell observe/admin boundary | Prevent onboarding copy from implying shell-form-primary UX |
| **06** `gate.requires_view` | A+ | Core north-star phase: ViewCanvasHost is primary for start/gate human UX | Must ship before tutorial parity and before phase 07 merge |
| **07** FDK deletion | A | Removes competing product surface that dilutes human-OS focus | Ensure no residual FDK/drawer-primary wording in shipped paths |
| **08** Docs + proof | A | Encodes and enforces north-star language across docs/tutorials/CI | Keep checklist/proof gates green in CI |

### North-star checklist table (apply to every phase PR)

| Check | Applies to phases |
|-------|-------------------|
| `ViewCanvasHost` named as primary when `requires_view` is present | 02, 03, 06, 08 |
| Shell chrome framed as admin/operator mode | 05, 08 |
| Built-in forms/drawers framed as fallback-only | 02, 06, 08 |
| Human-facing docs updated in same PR as behavior | 01–08 (via tracker) |

---

## 5. Documentation strategy

### Roles after phase 08

```
Human new user     → quick-start.md (mrmr setup)
Human author       → creating-flows.md, space-index.md
Human operator     → cli.md, configuration.md, troubleshooting.md
Agent              → .cursor/skills/murrmure/ ONLY
Normative protocol → studio-specs/current/product/spec.md
Implementation     → studio-specs/current/bridges/*
```

### Deletes (phase 07 + 08)

- `flow-evolution.md`, `reference/flow-dev-kit.md` — evolution/FDK reference only
- Skill: `evolution-pipeline.md`, `capability-authoring.md`, `workers.md`
- VitePress nav entries for evolution + flow-dev-kit reference

### Rewrites (phase 08 — tutorials kept)

- **`flows-tutorial.md`** — v2 space-directory authoring (replaces FDK worker walkthrough)
- **Tutorials 01–03** (all 16 pages) — same outcomes, v2 commands; see phase 08 parity matrix
- quick-start → 3 steps
- installation → Desktop + CLI + skill; no FDK npm
- agents-mcp → pointer to skill
- agent-skill → install only
- cli.md → setup/onboard; remove deleted flow subcommands
- troubleshooting → denial code table synced with skill
- README → v2-only story

### Sync rules

- Human and skill `known-gaps.md` — identical content; CI diff in phase 08
- Every phase PR updates [00-doc-skill-mcp-tracker.md](./00-doc-skill-mcp-tracker.md)

---

## 6. Definition of done — plan-level

| # | Outcome | Proof |
|---|---------|-------|
| 1 | One durable flow path | No `flow push`; demo space CI apply --strict |
| 2 | Engine = manifest | B1–B3 fixtures green; known-gaps empty |
| 3 | TTFRun ≤ 10 min | 05-U1b user test |
| 4 | Agent self-sufficient | Skill eval ≥ 5/6 (04-U1) |
| 5 | Zero FDK in product tree | Phase 07 grep gate CI (08-U6) |
| 6 | Docs don't duplicate skill | Phase 08 checklist complete + line-count gate on agents-mcp / agent-skill |
| 7 | ≤5 file hello scaffold | 03-U1 tree snapshot |

---

## 7. User proof scripts

### Phase 03 — scaffold

| ID | Script | Pass |
|----|--------|------|
| 03-U1 | Empty dir → `space flow init hello` → apply | Tree + comments; apply OK |
| 03-U2 | `flow init` inside murrmure repo | Redirect stderr |
| 03-U3 | Non-contributor timed run | <15 min to apply |

### Phase 04 — skill

| ID | Script | Pass |
|----|--------|------|
| 04-U1 | Agent + skill only, 6 prompts | ≥5/6 correct |
| 04-U2 | Agent indexes flow | Uses space apply, not push |
| 04-U3 | skill install | `.cursor/skills/murrmure/` |

### Phase 05 — wizards

| ID | Scope | Script | Pass |
|----|-------|--------|------|
| 05-U1a | MVP | TTY `mrmr setup` | flows≥1 |
| 05-U1b | Full | + grant step | MCP snippet |
| 05-U6 | MVP | `setup --yes` CI | Same as 05-U1a |
| 05-U7 | Full | Open Desktop | Space + Run visible |

### Phase 08 — docs + proof

| ID | Script | Pass |
|----|--------|------|
| 08-U1 | `pnpm docs:build` | Zero broken links |
| 08-U2 | Quick-start only TTFRun | ≤10 min |
| 08-U3 | Skill-only agent indexes flow | No push |
| 08-U4 | known-gaps human vs skill | Identical |
| 08-U5 | CI `space apply --strict` | Green |
| 08-U6 | FDK grep in product paths | Zero hits |

**TTFRun** = setup start → first Desktop Run click.

---

## 8. Risk register (updated)

| Risk | Sev | Mitigation |
|------|-----|------------|
| Gate scaffold before phase 02 | High | 01 warns; 03 default template invoke-only |
| Phase 07 breaks monorepo tests | High | **07-pre** + 08 P2 rewrite before delete |
| Doc broken links after deletes | Med | 08-U1 vitepress build + redirects |
| Skill/human drift | High | 08-U4 CI known-gaps sync |
| 07 scope creep (partial delete) | High | Expanded inventory + grep gate |
| Wizard scope creep | Med | MVP = 05-U1a; defer intent router |
| v2 demos missing before delete | High | 07-pre P1 fixtures |

---

## 9. Resolved / open questions

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Reimplement review-loop / feature-spec / tutorials before FDK delete? | **Yes** — v2 example trees + full tutorial rewrites (08-T1–T4); **no tutorial deletion** |
| Q2 | Publish `@murrmure/view-sdk` to npm? | **Open** — monorepo-only for now; external authors copy from scaffold |
| Q3 | Keep orchestration attach? | **Yes** — explicit keep list in phase 07 |

---

## 10. Third review (rev-3 amendments) — verdict

**Verdict:** **Adopt with amendments** — **Go to execute** phases 01–03 (+ parallel 04a). Full program Go stays blocked until phase 06 and 07-pre P1–P5 land.

| Agent | Verdict | Key note |
|-------|---------|----------|
| Architecture | Adopt with amendments | Fixed `routes/phase07` mislabel; expanded 07 inventory |
| DX/docs | Adopt with amendments | Phase 08 strategy now adequate; live docs still FDK-heavy until execution |
| Program/DOD | Adopt with amendments | B-ID consistent; tighten 07-pre to P1–P5; start acceptance rewrite early |

**Critical fix applied:** `routes/phase07/` is **v2 — keep**, not FDK delete target.

**If only 3 phases:** ship **01 → 02 → 03**, then **04a + 05 MVP**.

---

*Adopted 2026-07-03 rev-2. Amendments applied rev-3 after second review. Third review incorporated same day.*
