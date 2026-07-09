# Phase 02 — View SDK (author surface)

**Status:** ✅ complete  
**Execution order:** **2 / 10**  
**Depends on:** [01](./01-apply-validation.md) (optional parallel for lint only)  
**Decisions:** [01 npm](./decisions/01-view-sdk-npm-distribution.md) · [02 view dev](./decisions/02-view-dev-loop.md) · [03 context shape](./decisions/03-gate-view-context-shape.md) · [05 checkpoint-only context](./decisions/05-triggers-only-checkpoint-steps.md) · [09 space view init](./decisions/09-cli-scaffold-space-scoped.md)  
**Blocks:** [05](./05-view-canvas-checkpoints.md), [09](./09-fdk-deletion.md) M6  
**Replaces:** `@murrmure/flow-kit` **author** exports (`/react`, `createFlowMount`) — **not** the FDK install pipeline

> **Policy:** Delete FDK **runtime** in phase 09. **Port** flow-kit React helpers into `@murrmure/view-sdk` first. Do **not** delete `packages/flow-dev-kit/` until this phase is green.

---

## Problem

Authors need a React app in `murrmure/views/` at human checkpoints. Today:

- `mrmr view init` scaffolds stub HTML only (wrong — use **`mrmr space view init`**)
- `@murrmure/view-sdk` is **shell-side** (`ViewHostFrame`) — no helpers for view apps
- `@murrmure/flow-kit/react` has `FlowProvider`, `createFlowMount`, `useHubBridgeClient` — wired to **deprecated** worker context, not v2 postMessage
- No fast dev loop — build→apply→Desktop is too slow ([plan-review-2](./plan-review-2.md))

Without an author SDK, custom views are the product in name only.

---

## Normative package surface

**One package:** `@murrmure/view-sdk` — **published to public npm** ([decision 01](./decisions/01-view-sdk-npm-distribution.md))

| Export | Consumer | Role |
|--------|----------|------|
| `.` (host) | `shell-web` | `ViewHostFrame`, `attachViewHostBridge`, `resolveViewEntryUrl` — **exists** |
| `./app` | View apps in `murrmure/views/*/src/` | React mount, context hooks, submit/cancel — **new** |

Scaffolds pin semver range; authors run `npm install` in view directory.

### Deprecation map

| `@murrmure/flow-kit` | `@murrmure/view-sdk/app` |
|----------------------|--------------------------|
| `createFlowMount` | `createViewMount` |
| `FlowProvider` | `ViewProvider` |
| `useFlowContext` | `useViewContext` |
| `useHubBridgeClient` | `useViewHubClient` (wraps `shell-client` + token from context) |
| `FlowErrorBoundary` | `ViewErrorBoundary` |
| `FlowHostContext` | `ViewAppContext` (extends `ViewHostContext`) |

**Delete with FDK runtime (phase 09):** `flow-kit/server`, `flow-kit/validate`, `flow-kit/schema`, `flow-kit/digest`, worker `FlowHostContext`.

---

## View app context (`ViewAppContext`)

Defined **once** in `@murrmure/view-sdk` ([decision 03](./decisions/03-gate-view-context-shape.md), updated by [decision 05](./decisions/05-triggers-only-checkpoint-steps.md)):

```typescript
interface ViewHostContext {
  flow_id: string;
  space_id: string;
  hub_base_url: string;
  token: string;
  session_id?: string;
  run_id?: string;
}

/** Full context — shell → view postMessage payload */
interface ViewAppContext extends ViewHostContext {
  /** Present at all checkpoint mounts (step 0 + mid-run) */
  gate?: ViewGateContext;
  steps?: Record<string, { output?: Record<string, unknown>; status?: string }>;
  input?: Record<string, unknown>;
}

interface ViewGateContext {
  gate_id: string;
  step_id: string;
  payload_ref?: string;
  /** Optional hint — NOT a form renderer mandate */
  responseSchema?: ResponseSchema;
}
```

**Removed:** `mode: "start" | "gate"` — all human views are checkpoint context. **No** top-level `gate_id`; use `gate.gate_id`. **No** `form_schema` — use `responseSchema`.

Shell sends this in `murrmure.view.context` postMessage. View apps **must not** call orchestration mutation APIs (attach, apply, grant mint).

---

## View → shell protocol (normative)

| Message | When | Payload |
|---------|------|---------|
| `murrmure.view.ready` | App mounted | — |
| `murrmure.view.submit` | Human done | `params` — **free shape** ([decision 04](./decisions/04-human-checkpoint-resolve-wire.md)) |
| `murrmure.view.cancel` | Human dismissed | — |

View SDK **does not** call hub resolve APIs. Shell adapter maps submit → `{ disposition, output }` (phase 05).

Example review view:

```typescript
submit({ outcome: "validated" });
submit({ outcome: "changes_required", comments: [{ text: "Fix header" }] });
```

---

## React author API (must ship)

```typescript
export function createViewMount(options: {
  App: ComponentType;
  boundary?: ComponentType<{ children: ReactNode }>;
}): void;

export function ViewProvider(props: { children: ReactNode }): ReactNode;
export function useViewContext(): ViewAppContext;
export function useViewHubClient(): ShellClient;  // read-only subset
export function useViewSubmit(): {
  submit: (params: Record<string, unknown>) => void;
  cancel: () => void;
};
```

`createViewMount` listens for `murrmure.view.context`, mounts `ViewProvider`, posts `ready`.

---

## View package contract (required)

Every scaffolded view under `murrmure/views/<id>/`:

```text
murrmure/views/<id>/
  view.manifest.yaml       # entry: ./dist/index.html
  package.json             # scripts.dev + scripts.build (required)
  dev/
    fixtures/
      intake.json          # step 0 checkpoint scenario
      gate-round-1.json    # default gate scenario
      gate-round-2.json    # alternate scenario
  vite.config.ts           # outDir: dist
  src/
    main.tsx               # createViewMount({ App })
    App.tsx
  dist/                    # required before apply
```

`view.manifest.yaml`:

```yaml
apiVersion: murrmure.view/v1
id: {id}
entry: ./dist/index.html
params_schema: schemas/params.json  # optional metadata
```

**Ship path:** author runs `npm run build` → `mrmr space apply` — Murrmure never auto-builds for apply.

---

## CLI commands

| Command | Spec |
|---------|------|
| **`mrmr space view init <id>`** | Scaffold Vite+React tree ([decision 09](./decisions/09-cli-scaffold-space-scoped.md)) |
| **`mrmr view dev <id>`** | Runs author's `dev` script; Desktop ViewCanvasHost dev route; fixture tabs ([decision 02](./decisions/02-view-dev-loop.md)) |
| `mrmr view build [id]` | **Optional convenience:** run `npm run build` in view dir |
| `mrmr space flow init` | Includes view scaffold via [04](./04-space-flow-scaffold.md) |

**Dev behavior:**

- Iframe loads author's **dev server URL** (from `npm run dev`)
- Production iframe loads **hub-served `dist/`** after apply
- Submit in dev mode **logs only** by default — no real gate resolve
- Fixture files under `dev/fixtures/` — one tab per file; nested `ViewAppContext` shape

**Naming guard:** top-level `mrmr view init` → stderr redirect to `mrmr space view init`; exit 1.

---

## Definition of done

### Code

- [x] `packages/view-sdk/src/app/*` — mount, provider, hooks, postMessage bridge (view side)
- [x] `packages/view-sdk/src/types.ts` — `ViewAppContext`, `ViewGateContext`, `ResponseSchema`
- [x] Port tests from `flow-dev-kit` React patterns where applicable
- [x] **`@murrmure/view-sdk` published to npm**; scaffolds pin semver
- [x] `mrmr space view init` → Vite+React template under `packages/cli/templates/views/`
- [x] `mrmr view dev <id>` — CLI orchestrates author `dev` script + Desktop dev route
- [x] Example view in `examples/flows/preview-review-v2/murrmure/views/preview-review/` uses `createViewMount` — **phase 06**
- [x] `packages/view-sdk/package.json` exports `./app`

### Tests

- [x] `packages/view-sdk/test/app-bridge.test.ts` — context in, submit out
- [x] CLI snapshot: `space view init` tree includes `package.json`, `src/App.tsx`, `dev/fixtures/`
- [x] `packages/cli/test/view-dev.test.ts` — dev command invokes scripts.dev

### Docs (same PR)

- [x] [apps/docs/reference/view-sdk.md](../../../../apps/docs/reference/view-sdk.md) — **author** section (`./app` exports)
- [x] Skill `reference/views.md` — build loop, `createViewMount`, dev fixtures, checkpoint submit
- [x] [current/cli/spec.md](../../../current/cli/spec.md) — `space view init`, `view dev` output tree

### Proof

- [ ] Author scaffolds view, `mrmr view dev` with fixture tabs in Desktop, `npm run build`, `space apply`, iframe with working submit (full canvas in phase 05)

---

*End of phase 02.*
