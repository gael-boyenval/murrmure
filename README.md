# Agent Review Studio

Local-first **hub runtime** for human/agent workflows. Teams configure spaces,
install capabilities, and mint agent grants in the browser shell. Agents connect
via MCP; the hub journals every command, event, and denial in SQLite.

Reference workflows ship as CDK examples — **review-loop** (annotated review
rounds) and **feature-spec** (structured specs, publish events, cross-space
queries). Each capability runs as an isolated worker bundle and reaches the
kernel through a scoped host-bridge (`ctx.hub`).

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
@murrmure/hub-daemon      /v1/* platform API, MCP, capability worker pool
        │               host-bridge for worker → kernel access
        ├── @murrmure/hub-core      hexagonal domain (pure, no I/O)
        ├── @murrmure/runtime-kernel       journal, instances, state machines
        └── worker subprocesses   examples/flows/*/server/mount.mjs

Humans                  @murrmure/shell-web (Runtime | Configure)
        │               iframe canvases from capability UI bundles
        ▼
~/.studio/              SQLite DB, capability blobs, staging dirs
```

| Package | Role |
|---------|------|
| `@runtime/*` | Event-sourced kernel + SQLite persistence |
| `@murrmure/contracts` | Wire types and Zod schemas (leaf) |
| `@murrmure/hub-core` | Hub domain handlers |
| `@murrmure/hub-daemon` | HTTP/SSE server, live apply, worker pool |
| `@studio/hub-mcp` / `@studio/hub-cli` | MCP and CLI adapters |
| `@murrmure/hub-client` | Typed platform HTTP client |
| `@murrmure/shell-web` | Browser shell (runtime + configure) |
| `@studio/capability-sdk` | CDK validate, build, push |
| `examples/flows/` | Reference capabilities (not workspace packages) |

Dependency rule: capabilities never import hub internals at runtime — workers
call back through the host-bridge only. See
[`dependency-cruiser.config.cjs`](dependency-cruiser.config.cjs).

## Repository layout

| Path | Purpose |
|------|---------|
| `packages/` | Active platform workspace |
| `examples/flows/` | CDK reference capabilities (`feature-spec`, `review-loop`) |
| `apps/docs/` | VitePress user guide |
| `studio-specs/current/` | Normative specs (implement from here) |
| `studio-specs/plans/` | Deferred scope — do not implement directly |
| `fixtures/hub/` | Contract fixtures and acceptance data |
| `deprecated/` | Legacy US-001 stack (`@studio/daemon` era) — historical only |

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
- **Shell UI** — `http://127.0.0.1:5174` (`@murrmure/shell-web`, proxies `/v1` and `/api` to the hub)

### First-run smoke test

1. Open `http://127.0.0.1:5174/setup` and complete the setup wizard (spaces,
   install **review-loop** from the CDK example, mint a Worker grant).
2. Copy the MCP snippet into your agent config (`MURRMURE_HUB_TOKEN`,
   `MURRMURE_SPACE_ID`).
3. Toggle to **Runtime**, create a review session via MCP (`create_review_session`),
   open the session canvas in the shell, leave feedback, finish the round.
4. Agent receives structured results through MCP; events appear in the space
   event tail.

Step-by-step: [`apps/docs/guide/configuration.md`](apps/docs/guide/configuration.md).

### Build reference capabilities

```bash
node examples/flows/scripts/build-all.mjs
```

Or scaffold your own from an example:

```bash
mrmr flow init my-cap --from-example feature-spec
```

Tutorial: [`apps/docs/guide/capabilities-tutorial.md`](apps/docs/guide/capabilities-tutorial.md).

## Tests and quality gates

```bash
pnpm typecheck          # all workspace packages
pnpm test               # unit + integration (vitest)
pnpm test:acceptance    # hub-daemon HTTP acceptance + CDK conformance
pnpm check:boundaries   # dependency-cruiser architecture rules
```

## Agent integration (MCP)

The hub exposes a single MCP namespace per space. Capability tools appear in the
catalog after **live apply**; connected clients receive `tools_changed` on
promote/rollback.

Platform tools cover spaces, grants, gates, and queries. Domain tools
(`create_review_session`, `open_spec`, …) come from whichever capabilities are
live in that space.

See [`apps/docs/guide/creating-capabilities.md`](apps/docs/guide/creating-capabilities.md)
and [`studio-specs/current/build-capability/`](studio-specs/current/build-capability/README.md)
for the CDK model.

## Legacy US-001 stack

The original single-purpose review daemon (`@studio/daemon`, `@studio/web`,
disk-only `session.json`) lives under [`deprecated/`](deprecated/README.md). It
is excluded from the pnpm workspace and is not part of the active platform.

## Reference sources

Patterns are researched via [opensrc](https://opensrc.sh) into `.opensrc/`:

```bash
pnpm sources:list
OPENSRC_HOME=.opensrc pnpm exec opensrc path owner/repo
```

See [`agent.md`](agent.md) for contributor guardrails.
