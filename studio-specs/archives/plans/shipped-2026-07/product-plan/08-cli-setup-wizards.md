# Phase 08 — CLI setup wizards

**Status:** ✅ complete  
**Execution order:** **8 / 10**  
**Depends on:** [04](./04-space-flow-scaffold.md), [07a](./07-unified-murrmure-skill.md)  
**Normative:** [current/cli/spec.md](../../../current/cli/spec.md)

---

## Problem

First-run is fragmented: quick start is 9 manual steps; `mrmr space setup` **prints** init/link/apply; grant uses **v1 scopes**; `doctor` does not suggest recovery.

## Outcome

**Single human front door:**

```bash
mrmr setup              # connect → spaces → init → link → apply → skill → grant + MCP snippet
mrmr space onboard      # existing murrmure/ → link → apply → status
```

### MVP (ship first)

Enhance `packages/cli/src/commands/space/setup.ts` step 3 to **execute** init/link/apply — not `p.note()`.

### Full scope

| Flow | Steps |
|------|-------|
| **A — First run** | login, spaces, project+skill, link+apply, grant (v2 capabilities), doctor, Desktop handoff block |
| **B — Intent router** | select template → `space flow init` (+ optional `space view init`) |
| **C — Grant wizard** | capability templates + paste-ready `.cursor/mcp.json` fragment |
| **D — Hooks** | write `hooks.yaml` + apply (no deprecated `trigger register` wizard long-term) |

### Boundaries

- Shell/Desktop: **no** create wizards (instruction pages only) — shell chrome is operator/admin mode, not the authoring or end-user surface
- Agents: **`--json` flags only** — never Clack; skill documents command equivalents in `wizards.md`
- `mrmr setup --json` — machine-readable step plan for CI/agents

> **North star:** onboarding ends at **Run**, and Run drops the human into the flow's **custom view canvas** (phase 05 ViewCanvasHost) — not shell chrome. The wizard hands off to the human OS shell (views), not the admin surface. Session **title** visible in chrome ([decision 07](./decisions/07-session-vs-run-user-facing.md)).

### Doctor hints

When link missing or `flows: 0` → suggest `mrmr space onboard` or `space flow init hello`.

---

## Definition of done

### Code

- [x] `mrmr setup` top-level command
- [x] `mrmr space onboard`
- [x] `packages/cli/src/wizard/` shared helpers
- [x] Fix `WORKER_SCOPES` → v2 capabilities in setup grant step
- [x] `--yes` / non-interactive for CI

### Tests

- [x] Mocked clack tests in `packages/cli/test/wizard/`
- [x] Fixture `studio-specs/current/fixtures/cli/wizard-onboard-smoke.json`

### Docs (same PR)

- [x] [apps/docs/guide/quick-start.md](../../../../apps/docs/guide/quick-start.md) — **3 steps**: Desktop → `mrmr setup` → Run
- [x] [apps/docs/guide/desktop.md](../../../../apps/docs/guide/desktop.md) — `/spaces/new` copy matches setup outro
- [x] [current/cli/spec.md](../../../current/cli/spec.md) — wizard command table
- [x] Skill `reference/wizards.md` + `reference/cli.md`

### User proof (TTFRun)

| ID | Scope | Script | Pass |
|----|-------|--------|------|
| 08-U1a | **MVP** | TTY `mrmr setup` | flows≥1 after execute init/link/apply |
| 08-U1b | **Full** | Same + grant step | v2 capability grant + paste-ready MCP snippet |
| 08-U6 | MVP | `mrmr setup --yes` CI smoke | Same end state as 08-U1a |
| 08-U7 | Full | Open Desktop after setup | Space + Run visible |

**TTFRun ≤ 20 min** after MVP (08-U1a); **≤ 10 min** after full plan (08-U1b).

---

*End of phase 08.*
