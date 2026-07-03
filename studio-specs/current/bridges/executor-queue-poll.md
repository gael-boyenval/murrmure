# Executor queue poll bridge (rev-1 §4.6, §10.5)

External workers implement the poll/complete contract; hub journals lifecycle events.

## Flow

1. Invoke hits `queue_poll` binding → hub enqueues `ExecutorTaskOffer`, journals `mrmr.action.dispatched`.
2. Worker `GET /v1/executor/tasks?executor_id=…` (long-poll, default 30s).
3. Worker executes opaque params locally.
4. Worker `POST …/complete` or `/fail` → hub journals `mrmr.action.completed` / `mrmr.action.failed`.
5. Run step memo updates; flow engine may advance.

## Task offer

```typescript
interface ExecutorTaskOffer {
  task_id: string;
  run_id: string;
  step_id: string;
  action_name: string;
  space_id: string;
  params: Record<string, unknown>;
  artifacts_in?: string[];
  deadline_at: string;
}
```

## Auth

Grant capability `executor:poll` on executor resource. Mint with `--harness {executor_id}` so tokens cannot poll foreign executors.

Bootstrap / `hub:admin` bypass harness check for breakglass.

## Implementation map

| Layer | Module |
|-------|--------|
| Offer store | `studio-hub-core/src/executors/queue-store.ts` |
| Enqueue | `studio-hub-core/src/executors/queue-offer.ts` |
| Complete | `studio-hub-core/src/executors/queue-complete.ts` |
| Executor adapter | `studio-executors/src/queue-poll.ts` |
| HTTP routes | `studio-hub-daemon/src/routes/executor/index.ts` |

## Normative wire notes

- Long-poll idle response: **HTTP 200** with JSON array `[]` (not 204).
- No in-hub worker process required for production path (§16b P4).
