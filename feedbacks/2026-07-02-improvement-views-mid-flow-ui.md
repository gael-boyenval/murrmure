# Improvement request: views / mid-flow UI

## Topic

views / mid-flow UI

## Summary

Views are described as mid-flow interaction (e.g. review agent output), but only `start.requires_view` works today; gates render built-in forms only, not custom push views.

## Suggestion

Support `gate.requires_view` (or equivalent) so the shell opens a ViewDrawer with run context and prior step outputs via `@murrmure/view-sdk` — same protocol as start views, not a separate form-only path.

## Context

- Space: `spc_my_space`
- Goal: push view to display hello result and collect human validation
- Deleted attempt: `murrmure/views/hello-confirm/`

## Source

- Event: `murrmure.feedback.requestImprovement`
- Event id: `evt_01KWHGE5KQ5Y89988CBHXMQQDR`
- Emitter: `/spaces/spc_my_space`
- Receiver session: `ses_01KWHGE5KRJVVFN5Q7Z83EDZ71`
- Run: `run_01KWHGE5KSW6KCX3MP9KEKKGGD`
- Reported at: 2026-07-02T13:31:34.905Z
