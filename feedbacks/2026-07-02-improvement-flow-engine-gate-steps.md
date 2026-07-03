# Improvement request: flow-engine / gate steps

## Topic

flow-engine / gate steps

## Summary

Declarative gate steps compile in flow.manifest.yaml but never execute — advance.ts only dispatches invoke steps, so runs complete while human validation is still pending.

## Suggestion

When the flow engine reaches a gate step: open pending gate, set run lifecycle to waiting, pause advance until resolve/reject, then continue or fail.

## Context

{
  "space": "spc_my_space",
  "flow": "hello",
  "workaround": "scripts/open-confirm-gate.mjs"
}

## Source

- Repo: /spaces/spc_my_space
- Reported at: 2026-07-02T13:22:13.300Z
- Run: run_01KWHFX15M3A7EW12469F37X9P
- Session: ses_01KWHFX15K2ZKRN5H34EQCY5GN
