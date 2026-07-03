# Improvement request: CLI / scaffolding

## Topic

CLI / scaffolding

## Summary

A minimal view-to-shell-to-human-check flow required about 7 files with no explanation of why each layer exists.

## Suggestion

Add `mrmr flow init` that scaffolds actions, executors, flow, view, and script stubs with a one-line role per file.

## Context

- Space: `spc_my_space` (`/spaces/spc_my_space`)
- Workflow: minimal view → shell → human-check flow
- Friction: ~7 files (actions, executors, flow, view, scripts) with no per-file guidance on purpose or layering

## Source

- Event: `murrmure.feedback.requestImprovement`
- Emitter: `/spaces/spc_my_space`
- Receiver session: `ses_01KWHJNQZKJY2FH4MM1T70Z2GS`
- Run: `run_01KWHJNQZM26AD8QE8QR7N62EZ`
