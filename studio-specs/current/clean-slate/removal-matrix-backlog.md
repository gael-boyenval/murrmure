# Removal matrix backlog (2026-07-15)

**0 blocking hits** — `pnpm check:removal-matrix` green.

Manifest: **83 rules** | ~169 informational (archives/tests/fixtures/manifest self-reference).

## Completed

1. Production trigger cutover (no wake-wire literals)
2. Scaffold migration: `hello-gate` / `hello-invoke` → `handlers.yaml` only
3. Shell: `GateResolvePanel` → `ProtocolGateForm`
4. Normative + user docs + skills sweep (33 files)
5. Manifest pattern fix (`checkpoint.resolve` vs `checkpoint.resolved`)
6. Production comment/enforcement suppressions where appropriate

## Workflow

```bash
pnpm check:removal-matrix:report   # inventory
pnpm check:removal-matrix          # CI gate (green)
```

Wire into `pnpm check:docs-proof` when ready for permanent enforcement.
