# Decision 09 — CLI scaffold taxonomy (space-scoped)

**Status:** ✅ Resolved  
**Date:** 2026-07-03  
**Question source:** [plan-review-1.md § boundary analysis](../plan-review-1.md), CLI command taxonomy  
**Related:** [Decision 05 — checkpoint steps](./05-triggers-only-checkpoint-steps.md), [03-space-flow-scaffold.md](../03-space-flow-scaffold.md), [03b-view-sdk.md](../03b-view-sdk.md)  
**Blocks:** Phase 03, 03b, 05 (wizards), 07 (delete legacy `mrmr flow init`)

---

## Context

The plan mixed CLI levels:

- `mrmr space flow init` — nested under `space`
- `mrmr view init` — top-level
- `mrmr flow status` — top-level (read-only, kept)

Authors work in a **space directory** (`murrmure/`). Scaffolds mutate that tree; `mrmr space apply` indexes it. Inconsistent command nesting confused agents and docs ([plan-review-1](../plan-review-1.md) P1).

### Options considered

| Option | Commands | Rejected / chosen |
|--------|----------|-------------------|
| A. Space-scoped | `mrmr space flow init`, `mrmr space view init` | **Chosen** |
| B. Top-level | `mrmr flow init`, `mrmr view init` | Space inferred from cwd — less consistent with `space apply` |
| C. Single init | `mrmr space init-flow` only | Too narrow for add-on views |

**Product owner (2026-07-03):** **A**

---

## Decision

### Normative CLI commands (authoring)

| Command | Purpose |
|---------|---------|
| **`mrmr space flow init <name>`** | Scaffold flow manifest (`triggers` + checkpoint steps per [decision 05](./05-triggers-only-checkpoint-steps.md)), actions/scripts, and **required view packages** (intake + review views as templates dictate) |
| **`mrmr space view init <id>`** | Scaffold single view under `murrmure/views/<id>/` (Vite+React, `dev/fixtures/`, [decision 02](./02-view-dev-loop.md)) |
| **`mrmr view dev <id>`** | Dev loop (top-level OK — operates on view id; [decision 02](./02-view-dev-loop.md)) |
| **`mrmr view build [id]`** | Optional convenience wrapping `npm run build` in view dir |
| **`mrmr space apply`** | Index space (unchanged) |

### Renames / deprecations

| Legacy | v2 |
|--------|-----|
| `mrmr view init <id>` | **`mrmr space view init <id>`** — remove top-level alias after phase 07 |
| `mrmr flow init` (FDK) | **Delete** — redirect message → `mrmr space flow init` ([phase 07](../07-legacy-fdk-deletion.md)) |
| `mrmr flow status` | **Keep** top-level read-only (no scaffold) |

### Conventions

- All **`space * init`** commands require **`murrmure/`** root (cwd or `--space-root`).
- **`mrmr space flow init`** must not scaffold FDK worker trees; output matches [03-space-flow-scaffold](../03-space-flow-scaffold.md) + [10-reference-workflow](../10-reference-workflow-preview-review.md) shape.
- Docs, skill, and wizards ([phase 05](../05-cli-setup-wizards.md)) use **space-scoped** names only.

---

## Plan impact

| Artifact | Change |
|----------|--------|
| [03-space-flow-scaffold.md](../03-space-flow-scaffold.md) | `mrmr space flow init` only |
| [03b-view-sdk.md](../03b-view-sdk.md) | `mrmr space view init`; update CLI table |
| [07-legacy-fdk-deletion.md](../07-legacy-fdk-deletion.md) | Delete `flow init`; CI pack smoke → `space flow init` |
| `packages/cli/src/commands/view/init.ts` | Move/register under `space view` |
| Skill + docs | Replace `mrmr view init` with `mrmr space view init` |

---

*End of decision 09.*
