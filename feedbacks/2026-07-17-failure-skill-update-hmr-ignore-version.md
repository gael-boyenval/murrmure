# Failure — HMR / local dev: `mrmr skill update` should always sync latest skill (ignore version)

## Summary

In Desktop/CLI **HMR / local-preview (dev) mode**, `mrmr skill update` should install or refresh the **current skill content from the running build**, regardless of the skill’s declared version number. Today version gating can leave operators on a stale skill even though the hub/CLI under HMR already has newer skill files.

## Context

- Local preview / HMR desktop+hub workflow
- Command: `mrmr skill update`
- Skills: `murrmure-agent` / `murrmure-developer` packaged with the CLI or served from the monorepo

## Evidence

1. Operator runs Murrmure under HMR (dev) with skill source that has changed (content and/or `VERSION` / skill frontmatter).
2. `mrmr skill update` skips or keeps the installed copy because the version number did not bump (or compare treats installed as current).
3. Agent/harness still loads the old skill text while the rest of the product is on the new build — confusing during tutorial / feedback loops.

## Murrmure improvement

1. **Dev / HMR path:** always copy the latest skill payload from the active CLI/package (or space-linked source), **no version skip**.
2. Optionally still print installed vs source version for visibility, but never refuse the update in this mode.
3. Keep version-aware update for packaged / release installs if desired; document the split (`dev: always refresh` vs `release: update when newer`).
4. Align with related feedback: only update skills that already exist (`2026-07-17-failure-skill-update-only-existing.md`).

## Source

Manual testing session — HMR / local preview skill sync (2026-07-17)
