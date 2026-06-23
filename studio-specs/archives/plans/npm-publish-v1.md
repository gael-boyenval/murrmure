# Murrmure v1 — npm publish, rebrand, and flow artifact contract

**Status:** executed (2026-06-23) — archived; see [ADR-001](../../ADR/ADR-001-murrmure-publish.md)  
**Supersedes:** prior `@studio` / `@studio/capability-sdk` publish assumptions  
**Aligns with:** [agent.md](../../agent.md) phase 2 → 6

---

## 1. Goals

1. Publish **`@murrmure/cli`** and **`@murrmure/flow-dev-kit`** on npm (`@murrmure` org secured).
2. **Full rebrand:** no user-facing `studio` or `capability` — everything becomes **`murrmure`** / **`flow`**.
3. **Eliminate `@murrmure/flow-sdk`** after migration — all author/runtime code deps fold into **`@murrmure/flow-dev-kit`**; CLI bundles build/push implementation internally at publish time.
4. **Single CLI** (`murrmure` / `mrmr`) for all commands; required **globally or locally** in every flow project.
5. **Push ships runtime bundle + source snapshot** — hub stores both; not source-path metadata alone.

---

## 2. Resolved decisions

| # | Decision |
|---|----------|
| npm org | `@murrmure` only — no `@studio` |
| Product / CLI brand | **Murrmure** — retire “Studio” in code, docs, env vars, paths |
| Builder noun | **flow** — retire “capability” everywhere (wire, manifest, HTTP, scopes, events) |
| Packages published | `@murrmure/cli`, `@murrmure/flow-dev-kit` — **two only** |
| flow-sdk | **Removed** after migration — logic merged into flow-dev-kit + CLI build bundle |
| CLI | All operations; bins `murrmure`, `mrmr`; builder ops under `flow` subcommand |
| CLI install | **Required** — global (`npm i -g`) and/or local (`devDependency` in flow repo) |
| MCP | Protocol unchanged; config `"command": "murrmure", "args": ["mcp"]` |
| Push payload | **Built artifact + source archive** (see §7) |
| Hub (self-hosted) | Deferred as `@murrmure/hub` — same rebrand rules when shipped |
| **GitHub** | **[gael-boyenval/murrmure](https://github.com/gael-boyenval/murrmure)** — canonical monorepo remote |

---

## 2.1 GitHub repository

| Field | Value |
|-------|-------|
| **URL** | https://github.com/gael-boyenval/murrmure |
| **Remote** | `origin` → `git@github.com:gael-boyenval/murrmure.git` (or HTTPS) |
| **Visibility** | Public |

All published npm packages MUST declare:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/gael-boyenval/murrmure.git",
    "directory": "packages/cli"
  },
  "bugs": {
    "url": "https://github.com/gael-boyenval/murrmure/issues"
  },
  "homepage": "https://github.com/gael-boyenval/murrmure#readme"
}
```

Adjust `"directory"` per package (`packages/flow-dev-kit`, etc.). Root `package.json` uses repo URL without `directory`.

**CI:** GitHub Actions live in `.github/workflows/` on this repo (release, test, pack smoke). Phase D adds `release.yml` with `NPM_TOKEN` secret on the same repository.

**First push:** when Phase B lands, initial commit pushes to `main` on [gael-boyenval/murrmure](https://github.com/gael-boyenval/murrmure) (repo currently empty scaffold).

Apply in **one coordinated migration** (code + specs + docs + fixtures). No dual naming.

### 3.1 npm scope & packages

| Before | After | Publish |
|--------|-------|---------|
| `@studio/cli` (planned) | `@murrmure/cli` | yes |
| `@studio/capability-sdk` | *(deleted — merge)* | no |
| `@studio/capability-dev-kit` | `@murrmure/flow-dev-kit` | yes |
| `@studio/skill` | `@murrmure/skill` (private, CLI bundle only) | no |
| `@studio/hub-*`, `@studio/shell-web`, … | `@murrmure/hub-*`, `@murrmure/shell-web`, … | no (v1) |
| `@studio/contracts` | `@murrmure/contracts` | no |
| `@runtime/*` | `@murrmure/runtime/*` | no |

**Monorepo directories (target):**

```
packages/
  cli/                    @murrmure/cli
  flow-dev-kit/           @murrmure/flow-dev-kit  (absorbs ex-capability-sdk src)
  skill/                  @murrmure/skill         (private)
  hub-core/               @murrmure/hub-core
  hub-daemon/             @murrmure/hub-daemon
  …
```

Delete: `packages/capability-sdk/`, `packages/studio-hub-mcp/`, `packages/studio-hub-cli/`, `packages/studio-skill/` after merge.

### 3.2 CLI & commands

| Before | After |
|--------|-------|
| `studio`, `studio-capability`, `studio-hub-mcp` | `murrmure`, `mrmr` (+ optional `murrmure-mcp` alias) |
| `studio capability init` | `mrmr flow init` |
| `studio capability validate\|build\|push\|…` | `mrmr flow validate\|build\|push\|…` |
| `studio skill install` | `mrmr skill install` |
| `studio health`, … | `mrmr health`, … |

### 3.3 Environment variables

| Before | After |
|--------|-------|
| `STUDIO_HUB_URL` | `MURRMURE_HUB_URL` |
| `STUDIO_HUB_TOKEN` | `MURRMURE_HUB_TOKEN` |
| `STUDIO_SPACE_ID` | `MURRMURE_SPACE_ID` |
| `STUDIO_TOKEN`, `STUDIO_DEPLOY_TOKEN` | `MURRMURE_TOKEN`, `MURRMURE_DEPLOY_TOKEN` |
| `STUDIO_INSTALL_ID`, `STUDIO_PACKAGE_ID`, … | `MURRMURE_INSTALL_ID`, `MURRMURE_PACKAGE_ID`, … |

**No legacy aliases** in v1 Murrmure release (clean break). Migration note in changelog only.

### 3.4 Paths & config files

| Before | After |
|--------|-------|
| `~/.studio/` | `~/.murrmure/` |
| `~/.studio/capabilities/` | `~/.murrmure/flows/` |
| `~/.studio/hubs/shared.json` | `~/.murrmure/hubs/shared.json` |
| `capability.manifest.json` | `flow.manifest.json` |
| `.push-state.json` | `.flow-push-state.json` |

### 3.5 Hub wire (HTTP, journal, grants)

| Before | After |
|--------|-------|
| `POST …/capabilities/install` | `POST …/flows/install` |
| `GET …/capabilities/{install_id}` | `GET …/flows/{install_id}` |
| `capability:install` scope | `flow:install` |
| `capability_acl` on grants | `flow_acl` |
| `CapabilityInstall` entity | `FlowInstall` |
| Journal `capability.live_applied` | `flow.live_applied` |
| `package_id` (flow id in manifest) | **`flow_id`** in new docs/API (manifest field `id` kept as flow slug; HTTP uses `flow_id`) |
| MCP catalog `package_id` on tools | `flow_id` |
| Static `GET /capabilities/{pkg}/{ver}/ui/*` | `GET /flows/{flow_id}/{ver}/ui/*` |

Provide **HTTP v2 routes** under `/v1/.../flows/...`. Remove or 410 old `/capabilities/` routes in Murrmure v1 (no dual mount).

### 3.6 Types & code identifiers

| Before | After |
|--------|-------|
| `CapabilityManifest` | `FlowManifest` |
| `CapabilityHostContext` | `FlowHostContext` |
| `CapabilityServerContext` | `FlowServerContext` |
| `validateCapabilityRoot` | `validateFlowRoot` |
| `buildCapabilityRoot` | `buildFlowRoot` |
| `pushCapability` | `pushFlow` |
| `McpToolRegistry` capability mounts | flow mounts |
| `studio-specs/` directory | **`murrmure-specs/`** (rename repo folder in same PR or follow-up) |
| `agent.md` phase text “Studio” | Murrmure |

### 3.7 Skill (Cursor)

| Before | After |
|--------|-------|
| Skill npm (private) | `@murrmure/skill` |
| `.cursor/skills/studio-capability/` | `.cursor/skills/murrmure-flow/` |
| Skill id `studio-capability` | `murrmure-flow` |

### 3.8 Docs & URLs

| Before | After |
|--------|-------|
| `@studio/hub-mcp` in installation docs | `@murrmure/cli` |
| `app.studio.dev` references | Murrmure cloud URL TBD — use placeholder `app.murrmure.dev` in docs |
| “Capability Developer Kit (CDK)” | **Flow Dev Kit (FDK)** |

---

## 4. Published package topology

```
@murrmure/cli (global and/or local devDependency)
  ├── bins: murrmure, mrmr, [murrmure-mcp, mrmr-mcp optional]
  ├── bundles at publish: MCP, skill assets, flow build/push/validate/dev (ex-sdk)
  └── no npm dependency on @murrmure/flow-dev-kit at runtime

@murrmure/flow-dev-kit (flow project dependency)
  ├── React mount, hub bridge, error UI
  ├── FlowManifest schema, host/server types
  ├── all author-facing library exports (ex-@studio/capability-sdk surface)
  └── peerDeps: react, react-dom

@murrmure/skill — NOT on npm (bundled into CLI)
```

**Version lock:** CLI embeds dev-kit version in `build.meta.json` as `dev_kit_version`. `mrmr flow validate` warns if project’s `@murrmure/flow-dev-kit` semver ≠ version CLI was built with (warning, not hard fail in 0.x).

---

## 5. `@murrmure/cli`

### 5.1 Bins

```json
{
  "bin": {
    "murrmure": "./dist/cli.js",
    "mrmr": "./dist/cli.js",
    "murrmure-mcp": "./dist/mcp.js",
    "mrmr-mcp": "./dist/mcp.js"
  }
}
```

### 5.2 Command tree

```
mrmr|murrmure flow init <id> [--dir path] [--from-example name] [--with-skill] [--json]
mrmr|murrmure flow validate [path] [--json]
mrmr|murrmure flow build [path]
mrmr|murrmure flow push --space <id> [path]
mrmr|murrmure flow status [path] [--json]
mrmr|murrmure flow list --space <id> [--json]
mrmr|murrmure flow doctor [--json]
mrmr|murrmure flow test|promote|apply|rollback --space <id> --install <id>
mrmr|murrmure flow dev [path] --space <id> | --sim [--port n]

mrmr|murrmure skill install|update|version [--dir path] [--json]
mrmr|murrmure mcp

mrmr|murrmure health|events|gates|transition|wait|audit ...
```

### 5.3 CLI required (global or local)

Every flow scaffold **must** include:

```json
{
  "devDependencies": {
    "@murrmure/cli": "0.1.0"
  },
  "dependencies": {
    "@murrmure/flow-dev-kit": "0.1.0"
  },
  "scripts": {
    "validate": "mrmr flow validate .",
    "build": "mrmr flow build .",
    "push": "mrmr flow push --space $MURRMURE_SPACE_ID",
    "dev": "mrmr flow dev --sim"
  }
}
```

- **Global:** `npm i -g @murrmure/cli` — scripts resolve `mrmr` on PATH.
- **Local:** `npm install` installs `@murrmure/cli` → `./node_modules/.bin/mrmr`.
- **`mrmr flow doctor`** checks: CLI reachable, dev-kit present, hub auth env, dev_kit_version skew.

Init templates and examples ship **embedded in CLI tarball** (`templates/flows/*`) — no monorepo `examples/` path at runtime.

### 5.4 MCP config

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "https://api.murrmure.dev",
        "MURRMURE_HUB_TOKEN": "tok_...",
        "MURRMURE_SPACE_ID": "spc_..."
      }
    }
  }
}
```

---

## 6. `@murrmure/flow-dev-kit`

Single **murrmure** dependency for flow project imports. Absorbs all ex-`capability-sdk` library surface.

### 6.1 Exports

```
@murrmure/flow-dev-kit
@murrmure/flow-dev-kit/host      → FlowHostContext, mount types
@murrmure/flow-dev-kit/server    → FlowServerContext, mountRoutes types
@murrmure/flow-dev-kit/schema    → FlowManifestSchema (optional direct import)
```

### 6.2 Author imports

```typescript
import { createFlowMount } from "@murrmure/flow-dev-kit";
import type { FlowHostContext } from "@murrmure/flow-dev-kit/host";
import type { FlowServerContext } from "@murrmure/flow-dev-kit/server";
```

### 6.3 No flow-sdk package

| ex-capability-sdk module | Destination |
|--------------------------|-------------|
| `schema.ts`, `validate.ts` | `flow-dev-kit/src/` (library) + CLI bundle (commands) |
| `build.ts`, `digest.ts`, `push.ts`, `dev.ts` | CLI bundle only (not imported by user apps) |
| `init.ts` templates | CLI `templates/` |
| `auth.ts`, `paths.ts` | CLI internal |

After migration: **zero** `@murrmure/flow-sdk` references in repo or npm.

---

## 7. Build & push artifact contract

**Requirement:** Push delivers **runtime bundle** and **author source snapshot**. Hub stores both. Configure UI shows both digests.

### 7.1 `mrmr flow build [path]`

Writes to `~/.murrmure/flows/{flow_id}/{version}/`:

```
{stage}/
  manifest.json                 # resolved flow manifest
  contract/                     # contract.json, mcp-tools.json, config.schema.json
  ui/                           # shell.html, entry.js, static assets (BUILT)
  server/
    mount.mjs                   # BUILT ESM worker entry
  source/                       # NEW — author source snapshot (not executed at runtime)
    flow.manifest.json
    package.json
    contract/                   # same as root contract (canonical in source/)
    ui/src/                     # TS/TSX sources
    server/                     # TS sources (index.ts)
    tests/
    playwright.config.ts        # if present
  bundle.tar.zst                # runtime-only tar (ui/, server/, contract/, manifest.json)
  source.tar.zst                # source/ tree only
  bundle.digest                 # sha256 of bundle.tar.zst bytes
  source.digest                 # sha256 of source.tar.zst bytes
  build.meta.json
  .flow-push-state.json         # written on push, excluded from digests
```

**Digest rules (unchanged algorithm, extended scope):**

| Artifact | Hashed |
|----------|--------|
| `bundle.tar.zst` | `bundle.digest` |
| `source.tar.zst` | `source.digest` |
| Excluded sidecars | `.flow-push-state.json`, `build.meta.json`, `*.digest`, raw dirs if tar present |

### 7.2 `build.meta.json`

```json
{
  "flow_id": "review-loop",
  "version": "1.0.0",
  "bundle_digest": "sha256:…",
  "source_digest": "sha256:…",
  "source_path": "/abs/path/to/flow/repo",
  "built_at": "ISO8601",
  "cli_version": "0.1.0",
  "dev_kit_version": "0.1.0",
  "ui_framework": "esbuild-react"
}
```

### 7.3 `mrmr flow push`

`POST /v1/spaces/{space_id}/flows/install` body (v3):

```json
{
  "flow_id": "review-loop",
  "version": "1.0.0",
  "bundle": {
    "mode": "multipart",
    "digest": "sha256:…"
  },
  "source": {
    "mode": "multipart",
    "digest": "sha256:…"
  },
  "source_metadata": {
    "source_path": "/Users/dev/flows/review-loop",
    "built_at": "ISO8601",
    "cli_version": "0.1.0",
    "dev_kit_version": "0.1.0"
  },
  "config": {},
  "target_state": "draft"
}
```

| Mode | Use |
|------|-----|
| `multipart` | Remote/CI — upload `bundle.tar.zst` + `source.tar.zst` |
| `local-path` | Same-machine dev — allowlisted under `~/.murrmure/flows/` |
| `digest` | Re-install when blobs already in hub store |

Hub ingest:

1. Verify both digests against uploaded bytes.
2. Store runtime blob → live mount path unchanged in behavior.
3. Store source blob → blob store URI `sources/{flow_id}/{version}/source.tar.zst` for audit, diff, re-build.
4. Lens A validates **runtime** tree; source tree validated for **presence of required paths** only (no execute).

**Reject** push if `source.tar.zst` missing (code: `SOURCE_BUNDLE_MISSING`).

### 7.4 Configure UI (UX)

Install detail shows:

- Runtime digest + “View built UI”
- Source digest + “Download source snapshot” (admin/grant gated)

---

## 8. Flow manifest (`flow.manifest.json`)

```typescript
export const FlowManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),  // flow_id
  version: z.string(),
  routes_prefix: z.string().regex(/^\/api\/[a-z0-9-]+$/),
  ui: z.object({
    entry: z.string(),
    canvas_route: z.string(),
    shell_html: z.string().optional(),
    assets: z.array(z.string()).optional(),
  }),
  server: z.object({ mount_module: z.string() }),
  mcp_tools_by_version: z.record(z.string(), z.array(z.string())),
  config_schema: z.string().optional(),
  tests: z.object({ contract: z.string().optional() }).optional(),
});
```

Rename only — schema shape unchanged from capability manifest v1.

---

## 9. Build artifact contract (publish packages)

| Package | Tool | Output | Assets copied |
|---------|------|--------|---------------|
| `@murrmure/cli` | tsup | `dist/cli.js`, `dist/mcp.js` | `templates/flows/**`, `skill/**`, `VERSION` |
| `@murrmure/flow-dev-kit` | tsc | `dist/**` + `.d.ts` | none |
| `@murrmure/skill` | — | (source consumed by CLI build) | `skill/*.md` |

**CLI publish checks:**

- `node dist/cli.js --help` from clean env (no tsx)
- `npm pack` → global install smoke → `mrmr flow init` in temp dir
- MCP: `murrmure mcp` starts stdio server

**flow-dev-kit publish checks:**

- `tsc` emits to `dist/` (`noEmit: false` in package tsconfig)
- Exports map only to `dist/`

---

## 10. Release workflow

**Tooling:** changesets.

**Publish order:** `@murrmure/flow-dev-kit` → `@murrmure/cli` (CLI records dev-kit version at build time; CI builds CLI after dev-kit release or pins workspace version in same release PR).

**Pre-release smoke (CI):**

1. `npm pack` both packages
2. Install CLI globally + init flow from template
3. `npm install` in flow dir
4. `mrmr flow validate && mrmr flow build && mrmr flow push` (against test hub)
5. Verify hub has both `bundle_digest` and `source_digest`
6. MCP handshake with test token

**Secrets:** `NPM_TOKEN` for `@murrmure`.

Start versions at `0.1.0`.

---

## 11. Migration phases

### Phase 0 — Spec & gate 2

- Human validates this document.
- Confirm no `@studio/*` on public npm.

### Phase A — Publishability hardening (monorepo, pre-rename)

- Fix tsconfig `noEmit` for publishable packages
- Runnable bins without tsx
- Pack smoke tests in CI

### Phase B — Rebrand & merge (single large PR or sequenced)

1. Rename `@studio/*` → `@murrmure/*`, `@runtime/*` → `@murrmure/runtime/*`
2. Merge `capability-sdk` → `flow-dev-kit` (library) + `cli` (commands)
3. Merge hub-mcp, hub-cli, skill → `cli`
4. Rename wire: HTTP `/flows/`, env vars, entities, journal types
5. Rename `capability.manifest.json` → `flow.manifest.json` in examples/fixtures
6. Implement source.tar.zst in build + push v3
7. Delete obsolete packages/dirs
8. Rename `studio-specs/` → `murrmure-specs/` (or update index in place — pick one, no dual paths)

### Phase C — Docs & skill content

- `apps/docs/**` full murrmure/flow vocabulary
- Skill → `murrmure-flow`, commands → `mrmr flow …`

### Phase D — Release tooling + first publish

- changesets, `release.yml`
- Publish `0.1.0`

### Phase E — Deferred

- `@murrmure/hub` self-hosted bundle

---

## 12. Acceptance criteria

| # | Scenario |
|---|----------|
| M1 | Zero `@studio/` or `@murrmure/flow-sdk` in active codebase |
| M2 | Zero user-facing string “capability” in CLI/docs (hub internal migration complete) |
| M3 | All env vars use `MURRMURE_*` only |
| P1 | Global `npm i -g @murrmure/cli` → `mrmr health` |
| P2 | Local `@murrmure/cli` in flow repo → `./node_modules/.bin/mrmr flow validate` |
| P3 | `mrmr flow init` → only `@murrmure/flow-dev-kit` + `@murrmure/cli` murrmure deps |
| P4 | `mrmr flow build` → `bundle.tar.zst` + `source.tar.zst` + both digests |
| P5 | `mrmr flow push` → hub stores runtime + source; install detail shows both |
| P6 | Push rejected without source archive |
| P7 | MCP `"command":"murrmure","args":["mcp"]` works |
| P8 | `mrmr skill install` → `.cursor/skills/murrmure-flow/` |
| P9 | `--from-example` works from published CLI (embedded templates) |
| P10 | changesets publish `@murrmure/flow-dev-kit` + `@murrmure/cli` |

---

## 13. Normative docs to update (checklist)

| Doc | Action |
|-----|--------|
| `build-capability/02-sdk.md` | Rewrite as flow-dev-kit + CLI; delete sdk |
| `build-capability/05-manifest-and-bundle-schema.md` | flow.manifest, source.tar.zst, digests |
| `build-capability/06-install-push-apply-http-contract.md` | `/flows/install` v3 + source multipart |
| `build-capability/15-agent-skill-package.md` | murrmure skill, murrmure-flow id |
| `capability-runtime/spec.md` | → `flow-runtime/spec.md` |
| `hub/contracts.md` | FlowInstall, flow_acl, MURRMURE env |
| `apps/docs/guide/installation.md` | @murrmure/cli only |
| All fixtures under `fixtures/capability-runtime/` | rename + payload fields |

Archive superseded specs to `murrmure-specs/archives/` with pointer from index.

---

## 14. Compatibility

**None.** Murrmure v1 is a clean break:

- No `STUDIO_*` env aliases
- No `/capabilities/` HTTP routes
- No `studio*` bins
- No `@studio/*` packages

Monorepo-only shims (one commit window) may print errors directing to `mrmr` — not required for npm v1.

---

## Related

- [agent.md](../../agent.md)
- Prior review agents: architecture [32452b75-63a8-45ce-bc12-ea9649e49f94], technical [69e02adc-a153-48ec-8d74-573ab8f956ab]
