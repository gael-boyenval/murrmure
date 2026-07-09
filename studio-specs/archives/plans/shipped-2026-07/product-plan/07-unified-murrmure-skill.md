# Phase 07 — Unified **`murrmure`** skill

**Status:** ✅ complete  
**Execution order:** **7 / 10**  
**Normative:** [current/product/spec.md](../../../current/product/spec.md) §21 B7  
**Decisions:** [12 skill eval advisory](./decisions/12-skill-eval-advisory-only.md)  
**Runs in parallel with:** 01–06 for **07a** early; **07b** tracks engine/DX phases

---

## Problem

Skill id **`murrmure-flow`** is flow-centric and incomplete. Agents still need `apps/docs/guide/agents-mcp.md`, tutorials, and repo grep. Human docs duplicate agent guidance.

## Outcome

**`murrmure`** skill = **sole normative source for agents**. Human docs = install + philosophy + `mrmr setup` pointer.

### 07a — Ship early (with phase 01)

- Rename `murrmure-flow` → **`murrmure`** (install path, CLI strings, frontmatter)
- Rewrite `SKILL.md` as product-wide router
- Sync `reference/known-gaps.md` with human gaps
- **Delete** skill refs to FDK push/evolution (phase 09 removes code)
- Document checkpoint resolve wire (`disposition`+`output`), `triggers:` manifest, orchestration A/B pointers

### 07b — Complete reference tree (tracks 03–08)

```text
packages/cli/skill/reference/
  platform-model.md
  known-gaps.md
  cli.md
  mcp.md
  grants.md
  space-directory.md
  flow-authoring.md
  actions-executors.md
  hooks-triggers.md
  views.md
  gates.md                    # checkpoint resolve, on_resolve
  orchestration-attach.md
  federation.md
  troubleshooting.md
  wizards.md                  # human wizard → agent command equivalents
```

**Delete** (not merge to legacy): `evolution-pipeline.md`, `capability-authoring.md`, `workers.md`.

Update `gates.md` / `views.md` for checkpoint-only human path, ViewCanvasHost, no `start.requires_view`.

---

## Definition of done

### Code

- [x] `SKILL_DIR_NAME = "murrmure"` in `packages/cli/src/skill/install.ts`
- [x] Install removes stale `.cursor/skills/murrmure-flow/`
- [x] All CLI/skill user strings updated

### Tests

- [x] `packages/cli/test/skill-install.test.ts`
- [x] Eval fixtures `packages/cli/test/skill-eval/*.json` — 6 prompts, ≥5/6 keyword match — **manual/release only, not CI gate** ([decision 12](./decisions/12-skill-eval-advisory-only.md))

### Docs (same PR for 07a; rolling for 07b)

| Human doc | After phase 07 |
|-----------|----------------|
| [agent-skill.md](../../../../apps/docs/guide/agent-skill.md) | Install/verify only (<30 lines) |
| [agents-mcp.md](../../../../apps/docs/guide/agents-mcp.md) | Pointer: "agents use installed skill" |
| [flow-dev-kit.md](../../../../apps/docs/reference/flow-dev-kit.md) | **Deleted in phase 09** |
| [flows-tutorial.md](../../../../apps/docs/guide/flows-tutorial.md) | **Rewrite** to v2 in phase 10 (keep page; same authoring goals) |

### Proof (07a)

```bash
mrmr skill install --dir /tmp/t
grep -q '^name: murrmure' /tmp/t/.cursor/skills/murrmure/SKILL.md
```

Agent eval: MCP setup, space apply, trigger hooks, checkpoint B1 honesty, no `flow push` — **without repo grep** (manual advisory run).

---

*End of phase 07.*
