# Flow Dev Kit

Reference for `@murrmure/cli` — the **Flow Dev Kit (FDK)** CLI and library.

Tutorial: [Flows tutorial](../guide/flows-tutorial).

## Install

```bash
npm install -D @murrmure/cli
npm install @murrmure/flow-dev-kit
```

Binaries: `murrmure`, `mrmr` (same entry).

## Auth resolution

| Source | Variables / fields |
|--------|-------------------|
| Environment | `MURRMURE_HUB_URL`, `MURRMURE_TOKEN` or `MURRMURE_DEPLOY_TOKEN`, optional `MURRMURE_SPACE_ID` |
| File | `~/.murrmure/hubs/shared.json` → `url`, `token`, `defaultSpaceId` |

## Commands

### `mrmr flow init <id> [--dir path] [--with-skill]`

Scaffold manifest, contract, ui, server, tests. `--with-skill` installs `.cursor/skills/murrmure-flow/` in the current working directory.

### `mrmr skill install|update|version [--dir path] [--json]`

Install or refresh the `@murrmure/skill` Cursor agent skill. Routed through the same `mrmr` binary. See [Agent skill reference](./agent-skill).

### `mrmr flow validate [path] [--json]`

Offline Lens A: manifest schema, contract shape, MCP tool map, optional post-build bundle check.

With `--space` and `--install`: hub evolution validate.

### `mrmr flow build [path]`

Bundle ui + server → `~/.murrmure/flows/{id}/{version}/`, write `bundle.digest` and `build.meta.json`.

**UI layout after build:**

| Source | Staged output |
|--------|----------------|
| `ui/src/*` (React/TS) | Bundled into `ui/entry.js` |
| `ui/crit/`, `ui/agent/`, fonts, CSS, etc. | Copied as-is under `ui/` |
| `ui/shell.html` | Copied (or default generated) |

Optional manifest field `ui.assets: string[]` limits copy to explicit paths under `ui/` instead of the default “copy all except `ui/src/`”.

Build fails loudly on UI or server esbuild errors (`UI_BUNDLE_FAILED`, `SERVER_BUNDLE_FAILED`) and when `shell.html` references missing relative assets (`UI_ASSET_MISSING`).

### `mrmr flow dev [path] --sim [--port <n>]`

Local simulated runtime (no hub required):

- Simulated shell + iframe canvas
- **`hub-fetch` bridge** and direct HTTP for flow API routes at `{routes_prefix}/*` (loads bundled `server/mount.mjs`)
- Simulated install/instance state machine (`/sim/*`)
- UI static files: staged bundle first, **source `ui/` fallback** during dev
- Watch + debounced rebuild (300ms) — edits under `ui/` (including static assets) trigger re-stage

```bash
mrmr flow dev ./workflows/my-flow --sim --port 4310
```

### `mrmr flow push --space <space_id> [--json]`

Install v2 draft via `bundle.mode: local-path`. Writes `.push-state.json`.

### `mrmr flow status [path] [--json]`

Read `.push-state.json` for the project version.

### `mrmr flow list --space <space_id> [--json]`

List flow installs in a space.

### `mrmr flow doctor [--json]`

Hub health, token validity, `flow:install` scope check.

### `mrmr flow test|promote|apply|rollback --space … --install … [--json]`

Evolution HTTP parity with Configure.

### `mrmr flow dev [path] --space <id> [--auto-apply]`

Watch source (300ms debounce), validate, build, push; optional apply. See tutorial Part 10.

## Library exports

```typescript
import {
  validateFlowRoot,
  buildFlowRoot,
  initFlow,
  pushFlow,
  stagePath,
  FlowManifestSchema,
} from "@murrmure/cli";

import type { FlowHostContext } from "@murrmure/flow-dev-kit/host";
import type { FlowServerContext } from "@murrmure/flow-dev-kit/server";
```

## Install v2 HTTP body

```json
{
  "package_id": "my-flow",
  "version": "0.1.0",
  "bundle": {
    "mode": "local-path",
    "local_path": "/Users/you/.murrmure/flows/my-flow/0.1.0",
    "digest": "sha256:…"
  },
  "source_metadata": {
    "source_path": "/Users/you/workflows/my-flow",
    "built_at": "2026-06-21T12:00:00Z",
    "sdk_version": "0.1.0"
  },
  "config": {},
  "target_state": "draft"
}
```

Response includes hub-assigned `contract_ref_id` and computed `bundle_digest`.

## Error codes

| Code | When |
|------|------|
| `MANIFEST_INVALID` | Schema or Lens A failure |
| `UI_BUNDLE_FAILED` | UI esbuild error |
| `SERVER_BUNDLE_FAILED` | Server esbuild error |
| `UI_ASSET_MISSING` | `shell.html` references a file not present in staged `ui/` |
| `BUNDLE_DIGEST_MISMATCH` | Claimed digest ≠ hub-computed (sidecars like `bundle.digest` are excluded on both sides) |
| `BUNDLE_DIGEST_STALE` | Staged `bundle.digest` file out of date — re-run build |
| `LOCAL_PATH_DENIED` | Path outside `~/.murrmure/flows/` allowlist |
| `INSTALL_POLICY_VIOLATION` | Agent install on `human_only` space |
| `LIVE_APPLY_FAILED` | Worker spawn or mount failure |

## Related

- [Flows tutorial](../guide/flows-tutorial)
- [Agent skill](./agent-skill) — `@murrmure/skill` install and API
- [HTTP API](./http-api) — evolution and apply routes
- [MCP tools](./mcp-tools) — grant ACL + live catalog
