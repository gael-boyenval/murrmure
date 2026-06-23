# Capability SDK

Reference for `@studio/capability-sdk` — the **Capability Developer Kit (CDK)** CLI and library.

Tutorial: [Capabilities tutorial](../guide/capabilities-tutorial).

## Install

```bash
npm install -D @studio/capability-sdk
```

Binaries: `studio`, `studio-capability` (same entry).

## Auth resolution

| Source | Variables / fields |
|--------|-------------------|
| Environment | `STUDIO_HUB_URL`, `STUDIO_TOKEN` or `STUDIO_DEPLOY_TOKEN`, optional `STUDIO_SPACE_ID` |
| File | `~/.studio/hubs/shared.json` → `url`, `token`, `defaultSpaceId` |

## Commands

### `studio capability init <id> [--dir path] [--with-skill]`

Scaffold manifest, contract, ui, server, tests. `--with-skill` installs `.cursor/skills/studio-capability/` in the current working directory.

### `studio skill install|update|version [--dir path] [--json]`

Install or refresh the `@studio/skill` Cursor agent skill. Routed through the same `studio` binary. See [Agent skill reference](./agent-skill).

### `studio capability validate [path] [--json]`

Offline Lens A: manifest schema, contract shape, MCP tool map, optional post-build bundle check.

With `--space` and `--install`: hub evolution validate.

### `studio capability build [path]`

Bundle ui + server → `~/.studio/capabilities/{id}/{version}/`, write `bundle.digest` and `build.meta.json`.

**UI layout after build:**

| Source | Staged output |
|--------|----------------|
| `ui/src/*` (React/TS) | Bundled into `ui/entry.js` |
| `ui/crit/`, `ui/agent/`, fonts, CSS, etc. | Copied as-is under `ui/` |
| `ui/shell.html` | Copied (or default generated) |

Optional manifest field `ui.assets: string[]` limits copy to explicit paths under `ui/` instead of the default “copy all except `ui/src/`”.

Build fails loudly on UI or server esbuild errors (`UI_BUNDLE_FAILED`, `SERVER_BUNDLE_FAILED`) and when `shell.html` references missing relative assets (`UI_ASSET_MISSING`).

### `studio capability dev [path] --sim [--port <n>]`

Local simulated runtime (no hub required):

- Simulated shell + iframe canvas
- **`hub-fetch` bridge** and direct HTTP for capability API routes at `{routes_prefix}/*` (loads bundled `server/mount.mjs`)
- Simulated install/instance state machine (`/sim/*`)
- UI static files: staged bundle first, **source `ui/` fallback** during dev
- Watch + debounced rebuild (300ms) — edits under `ui/` (including static assets) trigger re-stage

```bash
studio capability dev ./workflows/my-flow --sim --port 4310
```

### `studio capability push --space <space_id> [--json]`

Install v2 draft via `bundle.mode: local-path`. Writes `.push-state.json`.

### `studio capability status [path] [--json]`

Read `.push-state.json` for the project version.

### `studio capability list --space <space_id> [--json]`

List capability installs in a space.

### `studio capability doctor [--json]`

Hub health, token validity, `capability:install` scope check.

### `studio capability test|promote|apply|rollback --space … --install … [--json]`

Evolution HTTP parity with Configure.

### `studio capability dev [path] --space <id> [--auto-apply]`

Watch source (300ms debounce), validate, build, push; optional apply. See tutorial Part 10.

## Library exports

```typescript
import {
  validateCapabilityRoot,
  buildCapabilityRoot,
  initCapability,
  pushCapability,
  stagePath,
  CapabilityManifestSchema,
} from "@studio/capability-sdk";

import type { CapabilityHostContext } from "@studio/capability-sdk/host";
import type { CapabilityServerContext } from "@studio/capability-sdk/server";
```

## Install v2 HTTP body

```json
{
  "package_id": "my-flow",
  "version": "0.1.0",
  "bundle": {
    "mode": "local-path",
    "local_path": "/Users/you/.studio/capabilities/my-flow/0.1.0",
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
| `LOCAL_PATH_DENIED` | Path outside `~/.studio/capabilities/` allowlist |
| `INSTALL_POLICY_VIOLATION` | Agent install on `human_only` space |
| `LIVE_APPLY_FAILED` | Worker spawn or mount failure |

## Related

- [Capabilities tutorial](../guide/capabilities-tutorial)
- [Agent skill](./agent-skill) — `@studio/skill` install and API
- [HTTP API](./http-api) — evolution and apply routes
- [MCP tools](./mcp-tools) — grant ACL + live catalog
