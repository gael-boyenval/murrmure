# Capabilities tutorial

This guide walks you through authoring, building, pushing, and running a **user-created capability** — a versioned workflow package with contract, HTTP routes, MCP tools, and canvas UI.

::: tip Who this is for
**Builders** — teams who define their own workflows in **their own git repo**, using the **Capability Developer Kit (CDK)** (`@studio/capability-sdk`).

**Not** for cloning the Studio platform monorepo. Domain UI and handlers live in **your project**; the platform shell only hosts Configure, thin runtime chrome, and a sandboxed canvas iframe.
:::

::: info Prerequisites
- Node.js 20+
- A running Studio hub ([self-hosted](./self-hosted) or cloud)
- Admin or `capability:install` grant on a sandbox space
- Hub URL + token in env or `~/.studio/hubs/shared.json`
:::

---

## What is a capability?

A capability is everything needed to run one workflow in a space:

| Layer | File(s) | Purpose |
|-------|---------|---------|
| **Manifest** | `capability.manifest.json` | Package id, version, routes, UI entry, MCP tool map |
| **Contract** | `contract/contract.json` | State machine (ContractV2) — instances, transitions, gates |
| **Config schema** | `contract/config.schema.json` | Install-time fields shown in Configure |
| **MCP registry** | `contract/mcp-tools.json` | Tool names, HTTP bindings, input schemas |
| **UI** | `ui/src/mount.tsx` | Canvas rendered inside a **sandboxed iframe** |
| **Server** | `server/index.ts` | HTTP routes mounted in a **capability worker** subprocess |

The platform provides evolution (validate → test → promote → apply), auth, MCP catalog, and the canvas host. **You** provide domain meaning.

```mermaid
flowchart LR
  subgraph repo [Your git repo]
    SRC["contract + ui + server"]
  end
  subgraph cdk [Capability SDK]
    CLI["studio capability CLI"]
  end
  subgraph stage [Local stage dir]
    STG["staged bundle + digest"]
  end
  subgraph hub [Hub]
    BLOB[blob store]
    EVO[evolution]
    WORKER["worker + static UI"]
  end
  subgraph shell [Browser shell]
    IFRAME[CapabilityCanvasHost]
  end
  SRC --> CLI
  CLI --> STG
  STG -->|push| BLOB
  BLOB --> EVO
  EVO --> WORKER
  WORKER --> IFRAME
```

---

## Part 1 — Install the CDK

In **your workflow repo** (any directory — not the Studio monorepo):

```bash
npm install -D @studio/capability-sdk
```

The package exposes:

| Export | Use |
|--------|-----|
| `@studio/capability-sdk` | Schemas, `validateCapabilityRoot`, `buildCapabilityRoot` |
| `@studio/capability-dev-kit` | Runtime bridge helpers + React mount helpers |
| `@studio/capability-dev-kit/react` | Provider/hooks + default error UI primitives |
| `@studio/capability-sdk/host` | `CapabilityHostContext` type for UI `mount()` |
| `@studio/capability-sdk/server` | `CapabilityServerContext` type for `mountRoutes()` |
| `studio` / `studio-capability` bin | CLI |

Configure hub auth (pick one):

```bash
# Option A — environment
export STUDIO_HUB_URL=http://127.0.0.1:8787
export STUDIO_TOKEN=tok_your_admin_or_install_grant
export STUDIO_SPACE_ID=spc_ui_sandbox

# Option B — ~/.studio/hubs/shared.json
```

```json
{
  "url": "http://127.0.0.1:8787",
  "token": "tok_…",
  "defaultSpaceId": "spc_ui_sandbox"
}
```

Verify connectivity:

```bash
npx studio capability doctor --json
```

---

## Part 2 — Scaffold a capability

```bash
studio capability init review-loop-lite --dir ./workflows/review-loop-lite --install
cd workflows/review-loop-lite
```

This creates:

```
workflows/review-loop-lite/
  package.json                  # exact-pinned scaffold deps + scripts
  capability.manifest.json      # schemaVersion "1"
  studio.capability.yaml        # optional display metadata
  playwright.config.ts          # e2e runner against dev --sim
  contract/
    contract.json               # ContractV2 state machine
    config.schema.json          # Configure install form
    mcp-tools.json              # MCP tool → HTTP map
  ui/
    shell.html                  # iframe bootstrap + bridge
    src/App.tsx                 # strict React root
    src/mount.tsx               # Canvas entry (iframe)
    src/components/error/
      CapabilityErrorBoundary.tsx
      CapabilityErrorState.tsx
  server/
    index.ts                    # mountRoutes(app, ctx)
  tests/
    contract/
      reachability.test.ts
    e2e/
      canvas.spec.ts
      harness/
        simulated-shell.ts
        simulated-studio-machine.ts
```

**Rules:**

- `capability.manifest.json` → `id` must match kebab-case (`review-loop-lite`)
- Do **not** put `contract_ref_id` in the author manifest — the hub assigns it at ingest
- `routes_prefix` must be unique per live capability in a space (e.g. `/api/review-loop-lite`)
- scaffold dependencies use **exact pins** (no `^` / `~`) and include both `@studio/capability-sdk` + `@studio/capability-dev-kit`

Scaffolded scripts:

- `npm run validate:capability`
- `npm run build:capability`
- `npm run dev:capability` (simulated mode)
- `npm run test:unit`
- `npm run test:e2e`

---

## Part 3 — Author the contract

Edit `contract/contract.json` using **ContractV2** shape:

```json
{
  "schemaVersion": "2.0",
  "id": "review-loop-lite",
  "version": "0.1.0",
  "initial_state": "draft",
  "terminal_states": ["done"],
  "metadata_schema": {
    "type": "object",
    "properties": { "title": { "type": "string" } }
  },
  "states": [
    { "id": "draft", "kind": "active" },
    { "id": "review", "kind": "active" },
    { "id": "done", "kind": "terminal" }
  ],
  "transitions": [
    {
      "id": "submit",
      "from": "draft",
      "to": "review",
      "event": "submit",
      "actors": ["agent:*", "human:*"],
      "condition": null,
      "gate": null,
      "emit": ["submitted"]
    }
  ],
  "events": {
    "declarations": [
      { "type": "submitted", "schema": { "type": "object" } }
    ]
  }
}
```

Instances are created with the hub-assigned `contract_ref_id` (derived from package id + contract major version). Agents call platform MCP tools (`transition`, `emit_event`) against that instance — your server routes handle domain HTTP.

---

## Part 4 — Declare MCP tools

`contract/mcp-tools.json` maps tool names to HTTP routes your server implements:

```json
{
  "tools": {
    "ping": {
      "description": "Health check",
      "http": { "method": "GET", "path": "/health" },
      "input_schema": { "type": "object", "properties": {} }
    }
  }
}
```

Every name listed under `mcp_tools_by_version[your semver]` in the manifest **must** exist here. The hub rebuilds the MCP catalog from this file on live apply.

---

## Part 5 — Write UI and server mounts

### UI (`ui/src/mount.tsx`)

Loaded inside a **sandboxed iframe** (`sandbox="allow-scripts"`, no same-origin). Talk to the hub via `postMessage` bridge or relative fetches to hub-served static assets.

```typescript
import type { CapabilityHostContext } from "@studio/capability-sdk/host";
import { createCapabilityMount } from "@studio/capability-dev-kit";
import { App } from "./App";
import { CapabilityErrorBoundary } from "./components/error/CapabilityErrorBoundary";

const mountReactApp = createCapabilityMount({
  App,
  Boundary: CapabilityErrorBoundary,
});

export function mount(root: HTMLElement, ctx: CapabilityHostContext): () => void {
  return mountReactApp(root, ctx);
}
```

The shell sends `{ type: "init", ctx: CapabilityHostContextPublic }` after iframe load. On dev reload or live apply, it sends `{ type: "reload" }`.

### Server (`server/index.ts`)

Runs in a **capability worker subprocess** — never in the hub main process.

```typescript
import type { Hono } from "hono";
import type { CapabilityServerContext } from "@studio/capability-sdk/server";

export function mountRoutes(app: Hono, ctx: CapabilityServerContext): void {
  app.get("/health", (c) =>
    c.json({ ok: true, package: ctx.packageId, version: ctx.version }),
  );
}
```

Routes are mounted under `routes_prefix` from the manifest (e.g. `GET /api/review-loop-lite/health`).

---

## Part 6 — Validate and build

### Offline validate (Lens A)

```bash
studio capability validate . --json
```

Blocking errors include:

| Code | Meaning |
|------|---------|
| `MANIFEST_INVALID` | Schema or missing files |
| `GRAPH_UNREACHABLE` | Contract state not reachable (legacy graph only) |
| `MCP_TOOL_UNMAPPED` | Tool in manifest not in `mcp-tools.json` |
| `MOUNT_EXPORT_MISSING` | Missing bundled ui/server after build |
| `UI_BUNDLE_FAILED` | UI esbuild error |
| `SERVER_BUNDLE_FAILED` | Server esbuild error |
| `UI_ASSET_MISSING` | `shell.html` references a file not copied into staged `ui/` |
| `DEVKIT_VERSION_REQUIRED` | `@studio/capability-dev-kit` missing from `package.json` |
| `DEVKIT_VERSION_NOT_EXACT` | Required scaffold dependency uses a range |
| `DEVKIT_SDK_VERSION_MISMATCH` | SDK and dev-kit versions do not match |

Warnings (non-blocking offline): `TESTS_MISSING`, `GATE_ROLE_UNKNOWN`.

### Build and stage

```bash
studio capability build .
```

Output:

```
~/.studio/capabilities/{package_id}/{version}/
  manifest.json
  contract/
  ui/shell.html + ui/entry.js + static assets (crit/, agent/, fonts, …)
  server/mount.mjs
  bundle.digest              # sha256:…
  build.meta.json
```

**UI static convention:** everything under `ui/` except `ui/src/` is copied into the stage as-is. React/TS under `ui/src/` is bundled into `ui/entry.js`. Link static files from `shell.html` with relative paths (e.g. `./crit/style.css`). Optional manifest field `ui.assets` restricts copy to explicit paths.

Re-run validate on the stage (post-build):

```bash
studio capability validate ~/.studio/capabilities/review-loop-lite/0.1.0 --json
```

---

## Part 7 — Push to a space (draft)

```bash
studio capability push --space spc_ui_sandbox --json
```

This calls install v2:

```http
POST /v1/spaces/{space_id}/capabilities/install
```

with `bundle.mode: local-path` (same-machine hub reads staged bytes and computes digest).

On success the CLI writes:

```
~/.studio/capabilities/{id}/{version}/.push-state.json
```

```json
{
  "install_id": "ins_…",
  "space_id": "spc_ui_sandbox",
  "package_id": "review-loop-lite",
  "version": "0.1.0",
  "bundle_digest": "sha256:…",
  "contract_ref_id": "cref_review_loop_lite_2",
  "pushed_at": "2026-06-21T12:00:00Z"
}
```

Push always targets **`draft`**. Agents may push to sandbox spaces only (not production with `human_only` policy).

Check status:

```bash
studio capability status . --json
studio capability list --space spc_ui_sandbox --json
```

---

## Part 8 — Evolution pipeline

Run from CLI or **Configure → [space] → Capabilities → [install]**.

Full step-by-step (states, contract diff, gates): **[Capability evolution pipeline](./capability-evolution)**.

| Step | CLI | Configure button | Result state |
|------|-----|------------------|--------------|
| Push | `studio capability push --space …` | — | `draft` |
| Validate | `studio capability validate --space … --install ins_…` | Validate | `validated` |
| Test | `studio capability test --space … --install ins_…` | Test | `tested` |
| Promote | `studio capability promote --space … --install ins_…` | Promote | `promoted_pending` or `live`* |
| Apply | `studio capability apply --space … --install ins_…` | *(CLI only)* | `live` at runtime |

\*Promote sets DB state; **Apply** mounts the worker and MCP catalog. Do not skip apply for CDK bundles.

Example (using `install_id` from `.push-state.json`):

```bash
INSTALL=ins_…
SPACE=spc_ui_sandbox

studio capability validate --space $SPACE --install $INSTALL --json
studio capability test --space $SPACE --install $INSTALL --json
studio capability promote --space $SPACE --install $INSTALL --json
studio capability apply --space $SPACE --install $INSTALL --json
```

**Apply live** (when state is `promoted` or ready):

1. Spawns capability worker with your `server/mount.mjs`
2. Registers HTTP proxy under `routes_prefix`
3. Serves UI at `GET /capabilities/{pkg}/{ver}/ui/*`
4. Rebuilds MCP catalog from bundle
5. Emits `capability.live_applied` on the control bus

Breaking semver promotes may require a human gate on production spaces.

---

## Part 9 — Runtime: canvas and MCP

### Mint agent grants

**Configure → [space] → Agent grants → Mint grant**

Include your `package_id` in **`capability_acl`** so MCP tools appear:

```json
["review-loop-lite"]
```

Worker template scopes: `state:transition`, `event:emit`, `space:read`, …

### Create an instance

Agents use platform + capability MCP tools. After your domain tool creates work, an **instance** row appears under **Runtime → Instances**.

### Open the canvas

For live bundle capabilities, the shell loads:

```
{hub}/capabilities/{package_id}/{version}/ui/shell.html?instance={instance_id}
```

inside `CapabilityCanvasHost` (sandboxed iframe). No domain UI is compiled into `@studio/shell-web`.

### Verify

| Check | How |
|-------|-----|
| Live mount | `GET /v1/spaces/{id}/capabilities/live` |
| HTTP routes | `curl $HUB/api/your-prefix/health -H "Authorization: Bearer $TOKEN"` |
| MCP tools | Reload MCP in Cursor; grant ACL must include package |
| UI bundle | Open canvas link from Instances list |

---

## Part 10 — Local dev loops

### Connected loop (`--space`)

Watch source, validate, build, push, and optionally apply:

```bash
studio capability dev . --space spc_ui_sandbox
```

Options:

- `--auto-apply` — call apply after each successful push when already live
- Debounce is 300ms on file changes

### Simulated loop (`--sim`)

Run local workflow UI testing **without** a running hub:

```bash
studio capability dev . --sim --port 4310
```

What it starts:

- thin local shell page with iframe canvas host
- simulated `hub-fetch` bridge
- **capability server routes** at `{routes_prefix}/*` (loads bundled `server/mount.mjs`, same mount contract as hub worker)
- simulated install lifecycle (`draft -> validated -> tested -> promoted -> live`)
- simulated instance lifecycle transitions with revision-aware errors
- UI static serving: staged bundle first, source `ui/` fallback during dev

Useful simulator endpoints:

- `GET {routes_prefix}/health` — capability server mount (e.g. `/api/my-flow/health`)
- `GET /sim/install`
- `POST /sim/install/transition` (body: `{ "action": "validate|test|promote|apply" }`)
- `GET /sim/instances`
- `POST /sim/instances/:id/transition`
- `GET /sim/fixtures`
- `POST /sim/fixtures/:fixture/apply`

Run scaffolded E2E against simulated mode:

```bash
npm run test:e2e
```

`playwright.config.ts` uses `npm run dev:capability` as the web server command.

---

## Manifest reference (v1)

```json
{
  "schemaVersion": "1",
  "id": "review-loop-lite",
  "version": "0.1.0",
  "routes_prefix": "/api/review-loop-lite",
  "ui": {
    "entry": "ui/entry.js",
    "canvas_route": "/spaces/:spaceId/instances/:instanceId/canvas/review-loop-lite",
    "shell_html": "ui/shell.html"
  },
  "server": { "mount_module": "server/mount.mjs" },
  "mcp_tools_by_version": {
    "0.1.0": ["ping"]
  },
  "config_schema": "contract/config.schema.json",
  "tests": { "contract": "tests/contract/reachability.test.ts" }
}
```

| Field | Notes |
|-------|-------|
| `schemaVersion` | Must be `"1"` for CDK capabilities |
| `contract_ref_id` | **Do not author** — hub assigns at ingest |
| `mcp_tools_by_version` | Semver key → tool name list |
| `ui.canvas_route` | Used by shell for instance links |

---

## CLI command reference

| Command | Description |
|---------|-------------|
| `studio capability init <id> [--dir path] [--install]` | Scaffold strict React project tree |
| `studio capability validate [path] [--json]` | Offline Lens A |
| `studio capability build [path]` | Bundle → `~/.studio/capabilities/` |
| `studio capability push --space <id>` | Install v2 draft + `.push-state.json` |
| `studio capability status [path] [--json]` | Read push state |
| `studio capability list --space <id> [--json]` | List installs |
| `studio capability doctor [--json]` | Hub reachability + token scopes |
| `studio capability test\|promote\|apply\|rollback --space … --install …` | Evolution HTTP parity |
| `studio capability dev [path] --space <id> [--auto-apply]` | Connected watch + rebuild + push |
| `studio capability dev [path] --sim [--port <n>]` | Local sim shell + server mount + FSM |
| `studio capability dev [path] --sim [--port <n>] [--fixture <name>]` | Local simulated shell + state machines |

All commands support `--json` for agents and CI.

---

## Monorepo vs user project

| Topic | Old model (platform repo) | CDK model (this tutorial) |
|-------|---------------------------|---------------------------|
| Source location | `examples/capabilities/*` in monorepo | Your git repo |
| Shell UI | Imported in `@studio/shell-web` | Hub-served iframe bundle |
| Install | Bundled catalog picker | `studio capability push` |
| Hub registration | Automatic from pushed bundle | Automatic from pushed bundle |
| Server code | Worker subprocess + host-bridge | Worker subprocess + host-bridge |

Reference examples (`review-loop`, `feature-spec`) live under `examples/capabilities/`
and run as worker bundles — use them as templates for new workflows.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `AUTH_MISSING` | No hub URL/token | Set env or `shared.json`; run `doctor` |
| `LOCAL_PATH_DENIED` | Push from wrong path | Build first; path must be under `~/.studio/capabilities/` |
| `BUNDLE_DIGEST_MISMATCH` | Tampered stage | Re-run `build` |
| `MANIFEST_INVALID` at push | Lens A fail | `validate . --json` |
| `DEVKIT_VERSION_REQUIRED` | Missing `@studio/capability-dev-kit` | Add dependency in `package.json` and re-run validate |
| `DEVKIT_VERSION_NOT_EXACT` | Scaffold dependency uses `^` or `~` | Pin exact versions in `package.json` |
| `DEVKIT_SDK_VERSION_MISMATCH` | SDK and dev-kit versions differ | Set both packages to the same version |
| `INSTALL_POLICY_VIOLATION` | Agent push to prod | Push sandbox only |
| Canvas 404 | Not applied live | Promote + **apply**; check `bundle_digest` on install |
| MCP tools missing | Not live or ACL | Apply live; grant `capability_acl` includes package |
| `LIVE_APPLY_FAILED` | Worker spawn error | Check hub logs; validate server mount exports |

---

## Security model (summary)

| Asset | Isolation |
|-------|-----------|
| User server (`mount.mjs`) | Capability **worker subprocess** — not hub main |
| User UI (`entry.js`) | **Sandboxed iframe** — no shell-origin import |
| Push trust | Requires `capability:install`; digest verified by hub |
| Canvas tokens | Short-lived derived tokens via postMessage bridge |

---

## Next steps

- [Configuration](./configuration) — spaces, grants, Configure evolution UI
- [Connect your agent](./agents-mcp) — MCP setup
- [HTTP API](../reference/http-api) — install v2 + apply routes
- [Self-hosted hub](./self-hosted) — run hub + shell locally

Design specs (in-repo): `studio-specs/current/build-capability/` — CDK normative docs BC0–BC6.
