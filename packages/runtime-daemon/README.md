# @murrmure/runtime-daemon

Thin runtime hub: SQLite persistence, outbox recovery, HTTP API.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/runtime.db` | SQLite database file |
| `PORT` | `8787` | HTTP listen port |

## Start

Requires **Node.js** (not Bun) — `better-sqlite3` is a native Node addon.

```bash
pnpm --filter @murrmure/runtime-daemon start
```

## Architecture

- `@murrmure/runtime-kernel` — command/query execution (no I/O imports)
- `@murrmure/runtime-persistence` — SQLite WAL + outbox (K15 recovery on startup)
- `@murrmure/runtime-adapter-http` — Hono REST → `CommandPort` / `QueryPort`

Fan-out order: waiters → reactions enqueue → projections (fixed).
