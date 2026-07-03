# Improvement request: space apply / validation

## Topic

space apply / validation

## Summary

`mrmr space apply` accepts flow manifests with gate steps and compiles them to IR, but gives no warning that the engine will not execute them — authors assume declarative gates work until runtime proves otherwise.

## Suggestion

At apply time, lint indexed flows against engine capabilities: warn or error when a step kind is compiled but not yet dispatched (e.g. gate), with a pointer to the supported workaround or docs.

## Context

- Space: `spc_my_space`
- Related: flow manifests with `gate` steps compile but `advance.ts` only dispatches `invoke` steps

## Source

- Event: `murrmure.feedback.requestImprovement`
- Emitter: `/spaces/spc_my_space`
- Receiver session: `ses_01KWHGRXPAWS40DKA4QNPRY514`
- Run: `run_01KWHGRXPBJBKYDVN833QVGGY6`
