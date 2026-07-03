# Improvement request: shell_spawn

## Topic

shell_spawn

## Summary

shell_spawn drops invoke params and run input at dispatch; space scripts must call the Hub API (journal scrape + GET /v1/runs) to read view-submitted values.

## Suggestion

Inject standard env into every shell_spawn child: `MURRMURE_RUN_ID`, `MURRMURE_SESSION_ID`, `MURRMURE_STEP_ID`, `MURRMURE_INPUT` (exec_context.input), `MURRMURE_INVOKE_PARAMS` (resolved step params). Enables view→CLI flows without per-repo hub-client.mjs or platform forks.

## Context

- Space: `spc_my_space`
- Flow: hello
- Repo: agentStudioTestEnv
- Workaround files: `scripts/lib/hub-client.mjs`, `scripts/hello.mjs`

## Source

- Event: `murrmure.feedback.requestImprovement`
- Event id: `evt_01KWHEK87WJBV8D3S5EPFAKEHM`
- Emitter: `/spaces/spc_my_space`
- Receiver session: `ses_01KWHEK87XK7RXCGWCNENVDJDP`
- Run: `run_01KWHEK87Y9BKVR7XY4SFXTS6D`
- Reported at: 2026-07-02T12:00:00.000Z

## Delivery note

Hook and session were created successfully; `write_improvement_feedback` failed with `EXECUTOR_UNAVAILABLE` because no Cursor MCP session was connected to `spc_murrmure` at emit time. This file was written manually from hub run data.
