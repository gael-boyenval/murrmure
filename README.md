# Murrmure

Local-first **hub runtime** for human/agent workflows. Teams configure spaces,
index `murrmure/` directories, and mint agent grants in the browser shell.
Agents connect via MCP; the hub journals every command, event, and denial in SQLite.

Internal test fixtures live under `test-utils/spaces/` (strict-apply CI only — not linked from user docs).

Normative platform specs: [`studio-specs/current/`](studio-specs/current/overview.md).

## Documentation

User-facing guides live in **`apps/docs/`** (VitePress).

```bash
pnpm docs:dev      # http://localhost:5173 — authors only
```

End users read the deployed site; they do not clone this repo.

## Architecture

```
Agents (Cursor, CI)     MCP + HTTP grants
        │
        ▼
@murrmure/hub-daemon      /v1/* platform API, MCP, indexed space apply
        │
        ├── @murrmure/hub-core      hexagonal domain (pure, no I/O)
        ├── @murrmure/runtime-kernel       journal, instances, state machines
        └── @murrmure/executors     shell spawn, MCP session, queue poll

Humans                  @murrmure/shell-web (observer shell)
        │               ViewCanvasHost for custom murrmure/views/
        ▼
~/.murrmure/              SQLite DB (`murrmure.db`), space index, staging dirs
```

| Package | Role |
|---------|------|
| `@murrmure/runtime-kernel`, `@murrmure/runtime-persistence` | Event-sourced kernel + SQLite persistence |
| `@murrmure/contracts` | Wire types and Zod schemas (leaf) |
| `@murrmure/executors` | ExecutorPort implementations (MCP session, queue poll, remote hub) |
| `@murrmure/hub-core` | Hub domain handlers, flow engine, space index |
| `@murrmure/hub-daemon` | HTTP/SSE server, MCP, composition root |
| `@murrmure/cli` | CLI (`mrmr`) and MCP adapter |
| `@murrmure/shell-web` | Browser shell (observer mode; `/spaces/new` first-run) |
| `@murrmure/view-sdk` | Custom view host + `createViewMount` app helpers |
| `test-utils/` | CI/manual test spaces and workers (not user documentation) |

Dependency rule: custom views use `@murrmure/view-sdk`; flows are indexed from
`murrmure/` via `mrmr space apply`. See
[`dependency-cruiser.config.cjs`](dependency-cruiser.config.cjs).

## Repository layout

| Path | Purpose |
|------|---------|
| `packages/` | Active platform workspace |
| `test-utils/spaces/` | Strict-apply test trees (`preview-review-v2`, …) |
| `apps/docs/` | VitePress user guide |
| `studio-specs/current/` | Normative specs (implement from here) |
| `studio-specs/plans/` | Deferred scope — do not implement directly |
| `fixtures/hub/` | Contract fixtures and acceptance data |

## Requirements

- Node.js 20+
- pnpm 9+

## Setup

```bash
pnpm install
```

## Run (development)

```bash
pnpm dev
```

Starts:

- **Hub daemon** — `http://127.0.0.1:8787` (`@murrmure/hub-daemon`)
- **Shell UI** — `http://127.0.0.1:5174` (`@murrmure/shell-web`, proxies `/v1` to the hub)

### First-run smoke test

1. Open `http://127.0.0.1:5174/setup` and complete the setup wizard (spaces,
   apply a v2 `murrmure/` tree, mint an agent grant).
2. Copy the MCP snippet into your agent config (`MURRMURE_HUB_TOKEN`,
   `MURRMURE_SPACE_ID`).
3. Run an indexed flow via **`mrmr flow run`** or Desktop **Run**; resolve gates
   in custom views when present.

Step-by-step: [`apps/docs/guide/configuration.md`](apps/docs/guide/configuration.md).

## Tests and quality gates

```bash
pnpm typecheck          # all workspace packages
pnpm test               # unit + integration (vitest)
pnpm test:acceptance    # hub-daemon HTTP acceptance + CLI conformance
pnpm check:boundaries   # dependency-cruiser architecture rules
```

## Agent integration (MCP)

The hub exposes a single MCP namespace per space. Platform tools cover spaces,
grants, gates, indexed actions, and journal query.

See [`apps/docs/guide/agents-mcp.md`](apps/docs/guide/agents-mcp.md).

## Reference sources

Patterns are researched via [opensrc](https://opensrc.sh) into `.opensrc/`:

```bash
pnpm sources:list
OPENSRC_HOME=.opensrc pnpm exec opensrc path owner/repo
```

See [`agent.md`](agent.md) for contributor guardrails.
