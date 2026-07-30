# Failure — `mrmr skill update` refreshes both skills when only one is installed

## Summary

`mrmr skill update` updates **both** Murrmure skills (`murrmure-agent` and `murrmure-developer`), even when only one of them exists in the target skill directory. It should update **only skills that are already installed**.

## Context

- CLI: `mrmr skill update`
- Space / agent harness with a single skill present (e.g. only `murrmure-agent`, or only `murrmure-developer`)

## Evidence

1. Operator has one skill installed under the Cursor/skills path.
2. Running `mrmr skill update` still touches / writes / reports both skills.
3. Expected: skip missing skills; update only the ones present (unless the user explicitly asks to install the other).

## Murrmure improvement

1. Detect which skill packages already exist in the destination.
2. Update only those; do not create or overwrite the missing peer by default.
3. Print which skills were updated vs skipped (`not installed — skipped`).
4. Optional later: `mrmr skill update --all` or `mrmr skill install <name>` for explicit install of the other.

## Source

Manual testing session — tutorial / operator DX (2026-07-17)
