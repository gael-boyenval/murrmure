# Improvement request: flow-engine / step outputs

## Topic

flow-engine / step outputs

## Summary

Flow templates support {{steps.hello.output.message}} but exec_context.steps is never populated on action completion, so chaining step results requires journal/API hacks in shell scripts.

## Suggestion

On mrmr.action.completed, merge the action result into run.exec_context.steps[step_id].output before advancing the flow, so invoke params and gate forms can reference prior step output declaratively.

## Context

[object Object]

## Source

- Repo: /spaces/spc_my_space
- Reported at: 
- Run: run_01KWHG4WDJTZY3QPA0PASWF96M
- Session: ses_01KWHG4WDHP1XKDABTGCFVH4JZ
