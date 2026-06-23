# BC1–BC2 (+ BC5b) — Murrmure CLI and Flow Dev Kit

Expand P5 scaffold into the **builder surface** for user-project flows.

- **CLI (all commands):** `@murrmure/cli` — bins `murrmure` / `mrmr`; subcommands `flow`, `skill`, `mcp`, hub ops
- **Runtime authoring library:** `@murrmure/flow-dev-kit` — React helpers, providers, hooks, schema, host/server types

> **Kit definition:** [cdk.md](./cdk.md) · **Manifest v1:** [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md) · **HTTP:** [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md)

---

## Package surface

See [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md) for canonical `FlowManifestSchema` v1 (`flow.manifest.json`).

```typescript
// @murrmure/flow-dev-kit
export function createFlowMount(...): (root: HTMLElement, ctx: FlowHostContext) => () => void;
export function createHubBridgeClient(...): HubBridgeClient;
export function validateFlowRoot(dir: string, opts?: { postBuild?: boolean }): ValidateResult;
```

CLI commands are bundled in `@murrmure/cli` (not imported by flow apps at runtime).

---

## CLI commands

| Command | Phase | Action |
|---------|-------|--------|
| `mrmr flow init <id> [--dir path] [--from-example name] [--with-skill]` | BC0 | Scaffold strict React project + package.json + tests |
| `mrmr flow validate [path] [--json]` | BC0 | Lens A offline + structured errors + dependency policy checks |
| `mrmr flow build [path]` | BC1 | Bundle ui + server → stage; writes `bundle.tar.zst` + `source.tar.zst` |
| `mrmr flow push --space <id>` | BC2 | Install v3 draft; writes `.flow-push-state.json` |
| `mrmr flow status [path] [--json]` | BC2 | Read push-state + hub install row |
| `mrmr flow list --space <id> [--json]` | BC2 | List installs for space |
| `mrmr flow doctor [--json]` | BC2 | Hub reachability, token scopes, dev-kit version skew |
| `mrmr flow dev [path] --space <id>` | BC5 | Watch + rebuild + push + reload |
| `mrmr flow dev [path] --sim [--port <n>]` | BC5b | Thin local shell + simulated state machine |
| `mrmr flow validate\|test\|promote\|apply --space <id> --install <id>` | BC2 | Evolution HTTP parity |
| `mrmr skill install\|update\|version [--dir path]` | BC15 | Install `murrmure-flow` Cursor skill ([15](./15-agent-skill-package.md)) |
| `murrmure mcp` | BC7 | MCP stdio server (alias bins: `murrmure-mcp`, `mrmr-mcp`) |

**All commands:** `--json` for agent parity (PAR-04).

**Auth resolution:** [08-auth-profiles-local-cloud-ci.md](./08-auth-profiles-local-cloud-ci.md).

**Push:** always `target_state: draft`. No `--target live` (CI route only).

---

## Strict React scaffold (init)

`studio capability init` MUST scaffold React and MUST emit a root `package.json` with exact dependency versions.

Required outputs:

- `package.json` with exact pins for:
  - `@studio/capability-sdk`
  - `@studio/capability-dev-kit`
  - `react`, `react-dom`, React type packages, TypeScript, Vitest
- `ui/src/App.tsx`
- `ui/src/mount.tsx`
- `ui/src/components/error/` with scaffolded visual error states
- Playwright harness files for simulated shell/state-machine E2E

`init` MUST NOT emit framework-agnostic or web-component templates.

---

## Push state (UX-02)

On successful `push`, write:

```
~/.studio/capabilities/{package_id}/{version}/.push-state.json
```

```json
{
  "install_id": "ins_…",
  "space_id": "spc_ui_sandbox",
  "package_id": "review-loop-lite",
  "version": "1.0.0",
  "bundle_digest": "sha256:…",
  "contract_ref_id": "cref_…",
  "pushed_at": "2026-06-20T12:00:00Z"
}
```

Re-push same semver updates same install row (idempotent).

---

## Validate errors (UX-03)

Structured output with `--json`:

```json
{
  "ok": false,
  "errors": [
    {
      "code": "GRAPH_UNREACHABLE",
      "message": "State 'orphan' not reachable from initial_state",
      "hint": { "file": "contract/contract.json", "state": "orphan" }
    }
  ],
  "warnings": [
    { "code": "TESTS_MISSING", "message": "No tests/contract entry declared" }
  ]
}
```

| Code | Blocking |
|------|----------|
| `MANIFEST_INVALID` | Yes |
| `GRAPH_UNREACHABLE` | Yes |
| `MCP_TOOL_UNMAPPED` | Yes |
| `MOUNT_EXPORT_MISSING` | Yes (post-build) |
| `DEVKIT_VERSION_REQUIRED` | Yes |
| `DEVKIT_VERSION_NOT_EXACT` | Yes |
| `DEVKIT_SDK_VERSION_MISMATCH` | Yes |
| `GATE_ROLE_UNKNOWN` | Warning offline; blocking at hub |
| `TESTS_MISSING` | Warning |

---

## Build pipeline

See [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md).

```
1. ui/     → ui/shell.html + ui/entry.js + assets
2. server/ → server/mount.mjs (worker-loadable ESM)
3. copy contract/, manifest resolved
4. bundle.tar.zst + hub-computed digest sidecar
5. build.meta.json (ui_framework = "vite-react")
```

---

## Push protocol

Full wire format: [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md).

Same-machine dev uses `bundle.mode: local-path` with allowlisted roots.

---

## UI mount contract

User `ui/src/mount.tsx` — loaded inside iframe via `shell.html`:

```typescript
import type { CapabilityHostContext } from "@studio/capability-sdk/host";

export function mount(root: HTMLElement, ctx: CapabilityHostContext): () => void;
```

Generated React templates MAY use `@studio/capability-dev-kit` wrappers, but MUST still compile to the same exported `mount` contract.

Shell bridge via `postMessage` — see [09-security-execution-boundaries.md](./09-security-execution-boundaries.md).

---

## Server mount contract

User `server/index.ts` — loaded in **capability worker subprocess**, not hub main:

```typescript
import type { Hono } from "hono";
import type { CapabilityServerContext } from "@studio/capability-sdk/server";

export function mountRoutes(app: Hono, ctx: CapabilityServerContext): void;
```

---

## Simulated dev mode (BC5b)

`studio capability dev --sim` MUST start a thin local runtime for workflow UI development without a running hub:

- Simulated shell host (iframe-equivalent canvas container)
- Simulated `hub-fetch` bridge contract
- Simulated install state machine (`draft → validated → tested → promoted → live`)
- Simulated instance state machine (contract-driven transitions + revision checks)

This mode is for local testing; it MUST NOT write installs or mutate hub state.

Reference behavior: [11-dev-loop-reload-protocol.md](./11-dev-loop-reload-protocol.md).

---

## Agent push recipe (UX-09)

Grant (sandbox): `capability:install`, `capability:configure`.

```bash
studio capability validate . --json
studio capability build .
studio capability push --space spc_ui_sandbox --json
# parse install_id from .push-state.json or stdout
studio capability validate --space spc_ui_sandbox --install ins_… --json
```

Agent edits **git source only** — never blob store (PAR-02).

---

## BC1–BC2 (+ BC5b) definition of done

- [ ] `init` emits strict React scaffold with root `package.json`
- [ ] Exact semver policy enforced for generated dependency set
- [ ] Stage under `~/.studio/capabilities/` with deterministic digest
- [ ] `push` + `.push-state.json` + `status`/`list`
- [ ] `doctor` reports scope/policy gaps
- [ ] `dev --sim` boots thin local shell + simulated Studio state machine
- [ ] Scaffolded Playwright suite passes against simulated runtime
