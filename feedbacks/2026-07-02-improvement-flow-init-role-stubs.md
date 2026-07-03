# Improvement request: CLI / scaffolding

## Topic

CLI / scaffolding

## Summary

A minimal view-to-shell-to-human-check flow required about 7 files with no explanation of why each layer exists.

## Suggestion

Add `mrmr flow init` that scaffolds actions, executors, flow, view, and script stubs with a one-line role per file.

## Context

- Space: `spc_my_space`
- Workflow: minimal view → shell → human-check flow
- Friction: actions, executors, flow definition, view, and script stubs must be created manually; no per-file guidance on purpose or layering

## Source

- Event: `murrmure.feedback.requestImprovement`
- Emitter: `/spaces/spc_my_space`
- Receiver session: `ses_01KWHJP6SHQSR3MSD367GEV1NE`
- Run: `run_01KWHJP6SJ0K5Q4WXE5ZNZQGBK`
