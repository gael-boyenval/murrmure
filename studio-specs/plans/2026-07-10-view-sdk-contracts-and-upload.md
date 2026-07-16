# Plan — View SDK contracts + artifact upload ergonomics

**Date:** 2026-07-10  
**Status:** Planned — **not started**  
**Goal:** A space-owned `view_resolver` should render a custom View against a modality-agnostic step branch contract—receive schemas in context, validate before resolve, submit payloads and browser files through a trusted host-mediated protocol without a Hub token, and surface field-level errors. The shell has no built-in resolver form.

**Tutorial drivers:** [Tutorial 1 v3 Part 3](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/03-build-intake-view.md) documents the **target** `useViewContract` / `submitBranch` API.

**Related:**

- [2026-07-10-branch-schema-artifact-validation.md](./2026-07-10-branch-schema-artifact-validation.md) — hub resolve must enforce artifact names in `schema.required` (server-side; this plan owns **SDK + shell context**)
- [2026-07-10-flow-branch-api-simplify.md](./2026-07-10-flow-branch-api-simplify.md) — branch routing ergonomics (orthogonal)

---

## How view ↔ contract works today

### Binding (which view loads)

| Step | What happens |
|------|----------------|
| **Authoring** | Flow step declares only branches/routes/contracts. Space `handlers.yaml` binds `type: view_resolver` + `view: spec-intake`. |
| **Apply** | Handler lint resolves the contract key and verifies the indexed `.mrmr/views/spec-intake/view.manifest.yaml` package/build. |
| **Run open** | Step state is `open` until one valid resolution changes it to `resolved`. |
| **Run API** | `open_steps[]` returns each open step's id, branch contracts, and inline sanitized `resolver: null | { handler_id, type, view_id? }`. |
| **Shell** | When a matching View resolver exists, `ViewCanvasHost` loads its iframe and posts `ViewAppContext`. Otherwise the shell shows observability only. |

**Match rule:** `view_resolver.view` must equal the View package id under `.mrmr/views/{id}/`. Resolver binding is exclusive: no other configured `step.opened` resolver may bind that contract key. Every apply loads the candidate View index before handlers and hard-fails missing package/build references.

### What the view receives (ViewAppContext)

```typescript
// packages/view-sdk/src/types.ts (simplified)
step?: {
  step_id: string;
  branch_names?: string[];      // e.g. ["continue", "cancel"]
  contract?: Record<string, unknown>;  // declared but NEVER populated
};
gate?: { responseSchema?: … };   // legacy orchestration gates only — not step contracts
```

**Not passed today:** per-branch `schema`, `artifact_slots`, `max_bytes`, payload vs artifact partition. Views cannot know that `continue` requires slot `spec` without hardcoding.

### Submit path (current implementation)

| Mode | When | Artifacts | Validation |
|------|------|-----------|------------|
| **Direct API** | `context.run_id` + `context.step.step_id` set (production run) | View SDK `uploadViewArtifacts` → `POST …/work/upload` with **`content_base64`** | None before network call |
| **Host postMessage** | Dev / fallback | **Dropped** — `shell-web` `mapViewSubmitToResolveStep` has no `artifacts_out` | None |

Authors must implement `fileToBase64` because `ViewSubmitArtifact` requires `content_base64` and the upload API is JSON-only (`packages/hub-daemon/src/routes/runs/step-work-upload.ts`).

### Server validation on resolve

Shallow `schema.required` check against **payload only** (`step-resolve.ts`). Artifact slots optional even when declared. Failed resolve → journal entry / terminal branch — **no in-view field errors**.

### Summary gap

```text
Flow manifest contract  ──compile──►  StepContractCatalog
                                              │
                    branch schema / slots     │  NOT exposed
                                              ▼
view_resolver + ViewAppContext.branch_names only  ──►  View hardcodes form + fileToBase64
                                              │
                                              ▼
resolve (maybe 400)  ──►  run failed needlessly
```

---

## Problem statement

| ID | Symptom | Impact |
|----|---------|--------|
| **V-1** | No branch contract in view context | Every view duplicates manifest knowledge; Tutorial 1 teaches leaky `fileToBase64` |
| **V-2** | Validation only at resolve | Missing file or field fails the **run** instead of inline form error |
| **V-3** | `content_base64` author burden | JSON upload wire leaks into view apps |
| **V-4** | Host bridge drops artifacts | postMessage fallback cannot complete file-only intake |
| **V-5** | `step.contract` type exists, unused | Suggests feature that was never wired |
| **V-6** | Dev fixtures lack branch contracts | `mrmr view dev` cannot test validation against real manifest shape |

---

## Target behavior

### 1 — Contract in context

`ViewAppContext.step.branches` (name from compiled catalog):

```typescript
interface ViewBranchContract {
  schema?: Record<string, unknown>;
  artifact_slots?: Record<string, {
    description?: string;
    media_types?: string[];
    extensions?: string[];
    min_files?: number;
    max_files?: number;
    min_bytes?: number;
    max_bytes?: number;
    max_total_bytes?: number;
    required?: boolean;  // derived from schema.required ∩ slot keys
  }>;
}

interface ViewStepContext {
  step_id: string;
  branch_names: string[];
  branches: Record<string, ViewBranchContract>;
  default_branch?: string;  // optional UX hint, e.g. "continue"
  declared_children?: string[];
  returned_child?: {
    step_id: string;
    branch: string;
    iteration: number;
    payload: Record<string, unknown>;
    artifacts: Array<{ slot: string; artifact_ref: string }>;
  };
}
```

Populated by shell from the selected `open_steps[]` entry and matched `view_resolver` + per-branch catalog slice (depends on per-branch `artifact_slots` in catalog — see branch-schema-artifact-validation Slice 1).

Each branch is a complete independent resolve contract. The shell and SDK do not consume or reconstruct a step-level merged schema/artifact-slot union.

For a resumed parent with a `view_resolver`, the host refreshes the existing open-step context with `returned_child`; it does not create another parent-open event or imply iframe/process continuation. The View may resolve the parent through its own branch contract or invoke host-mediated `murrmure_open_child_step` semantics for one `declared_children` entry. The host supplies parent/run context and an idempotency key, accepts no arbitrary child input, enforces one active child, and never lets the View open an unrelated step.

### 2 — SDK validation + submit API

```typescript
// Proposed exports from @murrmure/view-sdk/app

validateBranchResolve(
  branch: string,
  contract: ViewBranchContract,
  input: { payload?: Record<string, unknown>; files?: Record<string, File | File[]> },
): Promise<{ ok: true } | {
  ok: false;
  code: "CONTRACT_VALIDATION_FAILED";
  errors: Array<{
    source: "payload" | "artifact";
    path: string; // RFC 6901 JSON Pointer
    rule: string;
    message: string;
  }>;
}>;

// Ergonomic submit — hides base64 + upload
submitBranch(
  branch: string,
  input: { payload?: Record<string, unknown>; files?: Record<string, File | File[]> },
): Promise<void>;
```

- **`validateBranchResolve`** — asynchronous host-mediated validation using the same Draft 2020-12 rules as Hub plus artifact cardinality, per-file MIME/extension/byte constraints, normalized filename uniqueness, and slot aggregate bounds.
- **`submitBranch` / updated `useViewSubmit`** — validate first; on failure throw `ViewContractError` with `errors[]` for inline UI; on success upload + resolve.
- **`useViewContract(branch?)`** — hook returning `{ branches, validate, submit, cancel, submission }`, where top-level `cancel` resolves the workflow cancel branch and `submission.cancel()` aborts an in-flight submission.

`submission` exposes:

```typescript
{
  status: "idle" | "validating" | "uploading" | "resolving" | "succeeded" | "failed";
  uploadedBytes: number;
  totalBytes: number;
  cancel(): void;
}
```

Progress is aggregate and monotonic. A pre-commit submission cancellation deletes temporary bytes, leaves the step open, and returns to `idle`; if resolution already committed, the host reconciles to the resolved result and does not attempt compensation.

### View isolation

- only applied, locally built View packages hosted by the shell are supported; external View URLs fail apply;
- iframe sandbox is `allow-scripts` only—no `allow-same-origin`, navigation, popups, forms, or downloads;
- CSP blocks direct connections and external resource origins; the View communicates only through the host message bridge;
- host messages validate the exact iframe window, transport version, expected View/run/step context, and a fresh per-instance nonce;
- network access is deferred to a future explicit space permission rather than granted ambiently.

Payload schema validation uses the shared trusted-runtime Ajv 8 wrapper for JSON Schema Draft 2020-12. The host validates through the versioned bridge and returns field errors; the Hub independently runs the same wrapper authoritatively. The untrusted View iframe does not compile Ajv or receive executable validators.

The shared wrapper enables only the vetted `ajv-formats` set (`date`, `time`, `date-time`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`, `uri`, `uri-reference`); unknown/custom formats fail space apply.

The host normalizes Ajv and artifact errors into the transport-neutral shape above. `ViewContractError.errors` uses the same entries as HTTP, MCP, and CLI; raw Ajv fields, schema paths, artifact content, and host paths are not exposed.

### 3 — Host-mediated mutation and upload wire

Production Views never call the Hub directly and never receive a Hub mutation token. `submitBranch` sends a versioned intent containing payload plus browser `File`/`Blob` objects to the trusted host. The host:

1. validates the message origin, transport version, active run, open step, branch, and idempotency key;
2. obtains explicit Hub upload intents bound to ordered file metadata, actor, quota reservations, and idempotency before sending bytes;
3. performs the canonical bounded uploads against those intents;
4. atomically resolves the step while consuming every required intent;
5. returns progress, validation errors, cancellation, and the final deterministic result to the View.

Upload intent IDs and Hub credentials remain private to the trusted host and never cross the iframe bridge.

The direct View-to-Hub upload/resolve path and its token plumbing are removed without an adapter.

Authors write:

```tsx
await submitBranch("continue", { files: { spec: specFile } });
```

Not `fileToBase64` + manual `[{ slot, filename, content_base64 }]`.

### 4 — Host bridge is canonical

`shell-web` `ViewCanvasHost`, `mapViewSubmitToResolveStep`, and `useStepCanvasBinding` own the only production mutation path. The versioned message protocol carries payload and `File`/`Blob` objects; the host forwards the resulting canonical `artifacts_out` only after upload succeeds.

### 5 — Dev fixtures

Scaffold `dev/fixtures/*.json` with `step.branches` matching a reference flow manifest so `mrmr view dev` exercises validation without a live run.

---

## Implementation slices

### Slice 1 — Hub/run API: `open_steps[]` + matched View resolver

| Task | Path |
|------|------|
| Replace `ActiveHumanStep`/`awaiting_human` with `open` → `resolved` state and `open_steps[]` containing branch contracts | `packages/hub-core/src/flow-engine/step-view-ref.ts` and run detail |
| Resolve matching `view_resolver` server-side and expose the sanitized descriptor inline on each open step | handler index + run detail |
| Apply candidate order: load/validate Views before handler references; commit atomically | apply/index pipeline |
| Per-branch catalog entries (prerequisite from branch-schema-artifact-validation) | `step-contract-compile.ts` |
| `RunDetailPayload.open_steps[]` type | `packages/shell-client` |
| HTTP test: open step includes branch schemas + matching View resolver | `hub-daemon/test/http/flows/` |

**Done gate:** `murrmure_get_run` / GET run returns branch contracts and inline sanitized resolver metadata without role/presentation fields or sensitive handler configuration.

### Slice 2 — Shell context + host bridge

| Task | Path |
|------|------|
| `buildViewAppContext` maps the selected open step's branches → `context.step.branches` | `packages/shell-web/src/lib/view-app-context.ts` |
| Parent resume maps returned-child context and declared child ids; child activation remains host-mediated and parent-scoped | shell context, View SDK types/provider, host bridge |
| Versioned postMessage intent carries payload plus `File`/`Blob`, aggregate byte progress, cancellation, idempotency, typed errors, and result | `packages/view-sdk` message types + `ViewCanvasHost` |
| Host validates origin/run/step/branch, uploads files, then resolves exactly once | `packages/shell-web/src/lib/view-resolve-adapter.ts` |
| Host obtains explicit pre-byte Hub upload intents and consumes them atomically on resolve; intent IDs never enter View context/messages | private shell Hub client + resolve adapter |
| Remove View-held Hub tokens and direct View upload/resolve paths | View context, SDK provider, shell host |
| Delete built-in contract/gate forms, fallback resolve controls/adapters, routes, tests, and docs | `packages/shell-web`, shell client, related packages |

### Slice 3 — View SDK contract module

| Task | Path |
|------|------|
| Types: `ViewBranchContract`, `ViewContractValidationError` | `packages/view-sdk/src/types.ts` |
| `partitionRequiredFields`, `validateBranchResolve` | Shared Ajv 8 Draft 2020-12 wrapper in trusted host/Hub runtime; View SDK transports validation intent/results |
| `submitBranch` posts `File` / `Blob` intents to the trusted host; no direct Hub transport | `packages/view-sdk/src/app/resolve-step.ts` |
| `useViewContract` preflight and host response handling; delete `useViewSubmit` | `packages/view-sdk/src/app/provider.tsx` |
| Unit tests | `packages/view-sdk/test/` |

**Done gate:** intake view can `submitBranch("continue", { files: { spec } })` with client-side error if file missing.

### Slice 4 — Tutorial + docs + scaffold

| Task | Path |
|------|------|
| Simplify Tutorial 1 v3 Part 3 `App.tsx` — no `fileToBase64` | `apps/docs/guide/tutorials/01-local-preview-review-v3/03-build-intake-view.md` |
| View SDK reference — contracts, validation, file submit | `apps/docs/reference/view-sdk.md` |
| `step-contract` bridge — view context contract shape | `studio-specs/current/bridges/step-contract.md` |
| View init fixture template includes `step.branches` | `packages/cli/templates/views/vite-react/dev/fixtures/` |

### Slice 5 — Host upload integration

Integrate the host with the bounded canonical upload endpoint selected by branch-schema-artifact-validation. The View-facing protocol remains `File`/`Blob` regardless of the private host-to-Hub wire.

---

## Phase 0 — Decisions (blocking)

1. **Shared validation engine — decided:** one Ajv 8 Draft 2020-12 wrapper in trusted host/Hub runtimes; no duplicated View validator and no Ajv compiler in the iframe.
2. **Host vs direct resolve — decided:** host-mediated upload/resolve is the only production path; no View-held Hub token or direct mutation route.
3. **JSON Schema depth — decided:** the trusted host validates the complete selected-branch Draft 2020-12 contract through the shared Ajv wrapper; the iframe contains no compiler. Hub validation remains authoritative.
4. **Branch-name neutrality — decided:** no special `cancel`/failure validation bypass exists. The selected branch's own schema and artifact slots determine its requirements; a cancel branch skips files only because its contract does not require them.
5. **Relation to `view.manifest.yaml` `params_schema` — decided:** step branch contract wins; view-level `params_schema` is dev/run-params only (document precedence).
6. **Upload intent — decided:** the trusted host obtains explicit Hub-issued intents before bytes and consumes them atomically with resolve. Intent IDs, reservations, and Hub credentials never enter the View.
6. **No fallback UI** — decided: no built-in contract/gate form; a standard View may be added later only as a normal plugin.

---

## Acceptance criteria

- [ ] GET run `open_steps[]` includes per-branch `schema` + `artifact_slots` and matched `view_resolver`.
- [ ] `ViewAppContext.step.branches` populated in production and dev fixtures.
- [ ] Each View branch exposes only its own schema and slots; cancel/alternate branches do not inherit a step-level union.
- [ ] `submitBranch("continue", { files: { spec } })` works without author-written base64.
- [ ] Multi-file slots accept `File[]`, produce repeated same-slot artifact references, and enforce count/per-file/aggregate quotas before resolve.
- [ ] Missing required file shows **inline validation error**; resolve not called.
- [ ] Hub still rejects invalid resolve (branch-schema-artifact-validation) — client validation is UX, not sole enforcement.
- [ ] Trusted host and Hub pass identical Draft 2020-12 vectors; remote refs/custom executable formats fail apply; View iframe contains no Ajv compiler.
- [ ] View errors match HTTP/MCP/CLI golden fixtures and expose only `source`, RFC 6901 `path`, stable `rule`, and human `message`.
- [ ] `submission` reports monotonic aggregate progress and deterministic states; pre-commit cancellation cleans bytes/leaves the step open, while post-commit cancellation reconciles to success.
- [ ] Only local applied builds load; sandbox/CSP block storage privilege, navigation, popups, forms, downloads, direct connections, and external resources; wrong window/version/context/nonce messages are rejected.
- [ ] Tutorial 1 v3 Part 3 updated to use new SDK API.
- [ ] Host bridge carries browser files, performs upload, and resolves exactly once; View code has no Hub token or direct mutation path.
- [ ] No bytes are uploaded before the host obtains a valid intent; resolve consumes intents exactly once and View messages/context expose no intent ID, reservation, or Hub credential.
- [ ] Flow schema/catalog contain no `role`, `presentation`, or View id.
- [ ] No built-in contract/gate resolver form or fallback resolve control remains reachable.
- [ ] An unbound open step exposes `resolver: null`, stays externally resolvable, and renders **No resolver bound** plus safe metadata/docs without a generated form, resolve button, or fallback action.
- [ ] Missing View id or built entry fails apply after candidate View loading and leaves the previous applied index unchanged.
- [ ] A resumed parent View receives returned-child context without a duplicate parent-open event and can activate only one declared child or resolve its own independently validated branch.

---

## References

| Layer | Path |
|-------|------|
| View ↔ step binding | `packages/hub-core/src/flow-engine/step-view-ref.ts` |
| View context build | `packages/shell-web/src/lib/view-app-context.ts` |
| View SDK submit/upload | `packages/view-sdk/src/app/provider.tsx`, `resolve-step.ts` |
| Work upload API | `packages/hub-daemon/src/routes/runs/step-work-upload.ts` |
| View types | `packages/view-sdk/src/types.ts` |
| Server resolve validation | `packages/hub-core/src/flow-engine/step-resolve.ts` |
| Normative bridge | `studio-specs/current/bridges/step-contract.md` |
