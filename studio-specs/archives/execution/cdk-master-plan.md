# Build capability — master plan

**Date:** 2026-06-21  
**Depends on (existing, unchanged):** hub evolution commands, capability-runtime live apply, config shell Configure routes

---

## Problem

Today the platform repo carries **reference capabilities** (`review-*`, `feature-spec-*`) and the shell may import capability UI directly. That contradicts the product model:

- **Every workflow is user-created** — no catalog, no pre-shipped domain UI in the platform.
- **Contracts, manifests, server handlers, and canvas UI** should live on the **builder's machine** (user project + local Studio data dir), not in `packages/` in the Studio monorepo.
- The **shell** should expose only:
  - **Configure** — spaces, capabilities, grants, triggers, evolution pipeline
  - **Runtime chrome** — thin header (space, mode, auth), sidebar (instances, gates, event tail)
  - **Canvas host** — loads whatever UI bundle the **installed live capability** declares

Domain screens (review preview, spec editor, portal widgets) are **100% user-project**.

---

## Principles

| # | Principle |
|---|-----------|
| P1 | **No domain UI in platform repo** — shell-web imports hub-client only; never `@studio/*-ui` from reference capabilities |
| P2 | **Author in user project** — git repo is the source of truth for contract + UI + handlers |
| P3 | **Stage on user machine** — built artifacts under `~/.studio/capabilities/` until pushed to hub blob store |
| P4 | **Hub enforces, user defines** — evolution Lens A/B on pushed bundle; runtime loads pinned `contract_ref_id` |
| P5 | **Same evolution pipeline** — `draft → validated → tested → promoted → live → apply`; no shortcut install path |
| P6 | **SDK is the builder surface** — scaffold, validate, build, push, local dev loop; Configure UI calls same APIs |
| P7 | **React-first and reproducible** — `init` scaffolds React by default with exact (locked) semver pins for generated dependencies |

---

## Actors

| Actor | Does |
|-------|------|
| **Builder (human or agent)** | Authors capability in their project; runs SDK |
| **Studio shell** | Configure + thin runtime chrome + dynamic canvas loader |
| **Hub daemon** | Stores bundles, runs evolution, mounts routes, serves UI static assets |
| **MCP client** | Uses tools from live manifest after grant + ACL |

---

## End-to-end flow

```mermaid
flowchart TB
  subgraph user_project [User project — any repo]
    C[contract.json]
    M[capability.manifest.json]
    UI[ui/ source]
    SRV[server/ handlers]
  end

  subgraph sdk [@studio/capability-sdk CLI]
    V[validate]
    B[build]
    P[push]
  end

  subgraph local [User machine ~/.studio]
    STG[capabilities/package/version/]
  end

  subgraph hub [Hub on user machine]
    BLB[blob store]
    EVO[evolution pipeline]
    MR[mount registry]
    STATIC[GET /capabilities/.../ui/*]
  end

  subgraph shell [Shell — platform only]
    CFG[Configure]
    CHR[thin header + sidebar]
    HOST[canvas module loader]
  end

  C --> V
  M --> V
  UI --> B
  SRV --> B
  V --> B
  B --> STG
  STG --> P
  P --> EVO
  EVO --> BLB
  EVO --> MR
  BLB --> STATIC
  CFG --> EVO
  HOST --> STATIC
  MR --> hub
```

### Step 0 — Scaffold (once per capability)

```bash
studio capability init review-loop --dir ./workflows/review-loop
```

Creates in **user project** (not Studio repo):

```
workflows/review-loop/
  package.json              # exact versions; includes @studio/capability-dev-kit
  capability.manifest.json
  contract/contract.json
  contract/config.schema.json
  ui/src/App.tsx            # React root
  ui/src/mount.tsx          # mount() export + host bridge wiring
  ui/src/components/error/  # scaffolded visual error states
  server/index.ts        # mount export stub
  tests/contract/        # optional vitest
  studio.capability.yaml # optional human-facing metadata (name, description)
```

### Step 1 — Author

Builder edits contract state graph, UI components, server route handlers, MCP tool bindings — all in **their repo**.

### Step 2 — Validate + build (local)

```bash
cd workflows/review-loop
studio capability validate .
studio capability build .
```

- **Validate:** manifest schema, contract graph (Lens A subset offline), config schema, route/tool consistency
- **Build:** compile `ui/` → ESM bundle; bundle `server/` → single ESM mount module; write digest

Output staged to:

```
~/.studio/capabilities/{package_id}/{semver}/
  manifest.json
  contract.json
  config.schema.json
  bundle.tar.zst          # or directory with digest sidecar
  bundle.digest           # sha256:…
```

### Step 3 — Push to space (draft)

```bash
studio capability push --space spc_ui_sandbox
```

Always targets **draft** (no `--target live` on general CLI — CI only). Maps to install v2 — see [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md). Writes `.push-state.json` with `install_id`.

Configure UI shows draft on **Capabilities → [package_id]**.

### Step 4 — Evolution (Configure or CLI)

```bash
studio capability validate --space spc_ui_sandbox --install ins_…
studio capability test --space spc_ui_sandbox --install ins_…
studio capability promote --space spc_ui_sandbox --install ins_…
studio capability apply --space spc_ui_sandbox --install ins_…
```

Or same buttons in Configure evolution pipeline.

### Step 5 — Runtime

1. Agent/human creates instance → shell resolves `capability_install_id` + canvas route from manifest
2. Shell **canvas host** loads sandboxed iframe: `{hub}/capabilities/{pkg}/{ver}/ui/shell.html` — see [09-security-execution-boundaries.md](./09-security-execution-boundaries.md)
3. User bundle `mount()` runs inside iframe; shell bridges via `postMessage`
4. MCP tools from manifest appear after live apply + grant ACL

---

## Platform repo changes (when implemented — not in this doc pass)

| Package | Change |
|---------|--------|
| `@studio/shell-web` | Remove imports of reference capability UI; add `CapabilityCanvasHost` |
| `@studio/hub-daemon` | Serve staged/pushed UI static; load user `mount_export` from bundle path |
| `@studio/capability-sdk` | Expand P5 scaffold → full builder SDK (see [02-sdk.md](./02-sdk.md)) |
| `review-*`, `feature-spec-*` | **Move out** of platform repo → example user projects or separate `studio-examples` repo |

---

## Implementation phases

| Phase | ID | Delivers | Blocks |
|-------|-----|----------|--------|
| 1 | **BC0** | Local layout + manifest/contract schemas + offline validate | — |
| 2 | **BC1** | `build` + stage to `~/.studio/capabilities/` | BC0 |
| 3 | **BC2** | `push` → hub draft + blob ingest | BC1, CR0 live apply |
| 4 | **BC3** | Shell canvas host loads hub-served user bundle | BC2 |
| 5 | **BC4** | Server mount from user bundle (dynamic import from hub cache dir) | BC2, CR0 |
| 6 | **BC5** | `studio capability dev` — watch rebuild + soft canvas reload | BC3, BC4 |
| 7 | **BC5b** | `studio capability dev --sim` thin local shell + simulated Studio state machine + Playwright harness | BC5 |
| 8 | **BC2a** | Configure static “New capability” page (npm + init + push) | BC2 |
| 9 | **BC6b** | Configure path picker + `shared.json` project registry | BC2a |

**Minimum shippable:** BC0–BC4 + BC2a (author → push → live → see user UI in shell).

---

## SDK vs Configure UI split

| Concern | SDK (builder) | Configure UI (operator) |
|---------|---------------|-------------------------|
| Scaffold new capability | `studio capability init` | "New capability" → instructions + path picker |
| Edit contract graph | User editor / IDE; optional `studio capability edit contract` | Evolution detail: view diff, not full DSL editor v1 |
| Edit UI | User's React project (strict template) | Out of scope — link to project |
| Validate / test / promote | CLI parity | Same pipeline buttons |
| Push bundle | `studio capability push` | Upload/push from staged path |

Configure never embeds a workflow designer for domain UI — only evolution status, config fields from `config.schema.json`, and contract diff readout.

---

## Decision log + open decisions

| ID | Type | Decision / Question | Status |
|----|------|----------------------|--------|
| D1 | Locked | UI framework is strict React for scaffolded capabilities | Resolved |
| D2 | Locked | Generated dependency versions are exact pins (no ranges) | Resolved |
| OD1 | Open | User project layout: monorepo many capabilities vs one repo per capability? | SDK supports both; manifest at leaf |
| OD2 | Open | Server handler runtime: Node dynamic `import()` only v1? | Yes; WASM later |
| OD4 | Open | Blob upload: CLI stream file vs hub reads `~/.studio` path? | Both; same-machine hub reads local path for dev |
| OD5 | Open | Reference review loop during migration? | External example project, not bundled in shell |

---

## Implementation plan (React dev kit + simulated dev mode)

### Milestone M1 — Scaffold contract update

- Add `@studio/capability-dev-kit` as required scaffold dependency in `studio capability init`
- Generate `package.json` at capability root with exact pinned versions
- Emit React-first UI template (`App.tsx`, `mount.tsx`) and visual error-state components
- Keep `--from-example` behavior; remove framework ambiguity from docs

### Milestone M2 — Validation + policy enforcement

- Add offline validation checks for:
  - missing `@studio/capability-dev-kit`
  - non-exact semver ranges in scaffolded dependency set
  - version mismatch between `@studio/capability-sdk` and `@studio/capability-dev-kit`
- Surface machine-readable error codes in `--json` output

### Milestone M3 — Dev kit surface

- Publish runtime helpers in `@studio/capability-dev-kit`:
  - host bridge client helpers
  - React providers/hooks
  - scaffolded error-state primitives
- Ensure generated template uses only documented public exports

### Milestone M4 — Simulated dev runtime (`dev --sim`)

- Add a thin local server that hosts:
  - simulated shell canvas wrapper
  - simulated Studio APIs consumed by canvas bridge
  - simulated install/instance state machine for deterministic transitions
- Add fixtures for common lifecycle states and error states

### Milestone M5 — E2E + conformance

- Scaffold Playwright config and baseline tests in `init` output
- Run E2E against `dev --sim` without requiring a running hub
- Extend conformance fixtures + acceptance matrix for React strictness, semver lock, and simulated runtime parity

---

## Related (read-only references)

- [../capability-runtime/spec.md](../capability-runtime/spec.md) — live apply, mount registry
- [../config/spec.md](../config/spec.md) — Configure routes, evolution HTTP
- [../hub/architecture.md](../hub/architecture.md) — evolution FSM, `ContractRef.storage_uri`
- [../../../inputs/studio/company-personas-and-uses-cases/company-01/journeys/journey-14.md](../../../inputs/studio/company-personas-and-uses-cases/company-01/journeys/journey-14.md) — user-authored `review-loop-lite`
