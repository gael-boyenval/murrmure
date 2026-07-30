# Part 3 — Build the intake view

**Concept:** **Views** own human presentation. The flow manifest says what the human must provide (branches, schemas, artifact slots); the view is how they provide it when **Desktop** opens the step.

You scaffold a minimal intake UI — file picker, **Submit**, **Cancel** — wire it to the `intake` step, build, and apply.

## Step 1 — Scaffold the view package

From your space root (stay here for later `mrmr` commands):

```bash
cd ~/work/my-first-space
mrmr space view init spec-intake
```

This creates `.mrmr/views/spec-intake/` — a minimal Vite + React app with `view.manifest.yaml` and `src/App.tsx` — and runs `npm install` in that package for you. Do **not** `cd` into the view to run `mrmr` commands; those need the linked space root (the directory that contains `.mrmr/`).

| Piece | Role |
|-------|------|
| `view.manifest.yaml` | Tells the hub which built `index.html` to serve |
| `src/App.tsx` | Your UI — uses `@murrmure/view-sdk/app` to submit or cancel |
| `dist/` | Production build output (created by `npm run build`) |

## Step 2 — Bind the view in your space

The portable flow stays resolver-agnostic. Bind the local View to its readable
step key in `.mrmr/space/handlers.yaml`:

<!-- tutorial-v3-fence:part-3-view-handler -->
```yaml
version: 1
handlers:
  - id: intake_view
    on: step.opened::my-dev-flow.intake
    type: view_resolver
    view: spec-intake
```

Apply resolves that alias to the immutable flow/step identity. When the run opens
`intake`, Desktop loads **`spec-intake`** as the main UI for that resolver — not
a built-in operator form.

## Step 3 — Implement the view (file only)

Open **`.mrmr/views/spec-intake/src/App.tsx`** (path relative to your **space root** — the directory that contains `.mrmr/`). The scaffold already ships a minimal form: **one file input**, **Submit**, **Cancel**. No reviewer field, no filename text box — the file name travels with the upload. Confirm it matches the snippet below (or paste over it).

The view does **not** hardcode what `continue` requires. The shell passes the compiled **branch contract** from your flow manifest in `ViewAppContext.step.branches`. The SDK validates against that contract **before** calling resolve — so a missing file shows an inline error instead of failing the run on the hub.

<!-- tutorial-v3-fence:part-3-app -->
```tsx
import { useState } from "react";
import { isViewContractError, useViewContract } from "@murrmure/view-sdk/app";

/**
 * Minimal intake scaffold — file input, Submit, Cancel.
 * Edit this file; the branch contract comes from the host (fixtures in view dev).
 */
export function App() {
  const { submitBranch, cancel, submission } = useViewContract();
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const busy = ["validating", "uploading", "resolving"].includes(submission.status);

  async function handleSubmit() {
    if (!specFile) return;
    setErrors([]);
    try {
      await submitBranch("continue", { files: { spec: specFile } });
    } catch (err) {
      if (isViewContractError(err)) {
        setErrors(err.errors.map((e) => e.message));
      } else {
        setErrors([err instanceof Error ? err.message : "Submit failed"]);
      }
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem", maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>Attach file</h1>
      <p style={{ color: "#64748b" }}>Choose one file to attach, then Submit or Cancel.</p>
      <input
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={(e) => {
          setSpecFile(e.target.files?.[0] ?? null);
          setErrors([]);
        }}
      />
      {errors.length > 0 ? (
        <ul style={{ color: "#b91c1c", margin: "0.75rem 0 0", paddingLeft: "1.25rem" }}>
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button type="button" disabled={!specFile || busy} onClick={handleSubmit}>
          {busy ? `${submission.status}…` : "Submit"}
        </button>
        <button
          type="button"
          onClick={() => (busy ? submission.cancel() : cancel())}
          disabled={submission.status === "resolving"}
        >
          {busy ? "Cancel upload" : "Cancel"}
        </button>
      </div>
      {submission.totalBytes > 0 ? (
        <progress
          value={submission.uploadedBytes}
          max={submission.totalBytes}
          style={{ width: "100%", marginTop: "1rem" }}
        />
      ) : null}
    </main>
  );
}
```

### How the view matches the contract

| Layer | Role |
|-------|------|
| **Flow manifest** | Declares `branches.continue` — `schema.required: [spec]`, `artifact_slots.spec` |
| **Apply** | Compiles the branch contract and resolves `intake_view` to canonical flow/step/View identity |
| **Run** | Hub opens `intake`; `open_steps[]` includes the sanitized resolver and branch contracts |
| **Shell** | Desktop selects the projected `view_resolver` and passes `context.step.branches` |
| **View** | Reads the contract from `useViewContract()` — same shape as the manifest branch, no duplication |

On **Submit**, `submitBranch("continue", { files: { spec } })`:

1. SDK validates against the `continue` entry of `context.step.branches` (required slot `spec`, `max_bytes`, empty payload).
2. If validation fails → `ViewContractError` with field messages; **resolve is not called**.
3. If validation passes → the trusted host obtains an upload intent and streams the browser `File`; the View receives no intent or Hub credential.
4. The host resolves branch **`continue`** with an empty payload and the uploaded artifact reference.
5. Hub atomically validates, promotes, and resolves the selected branch.

`submission.status` moves through `validating` → `uploading` → `resolving` →
`succeeded`; byte progress is aggregate and monotonic. `submission.cancel()`
aborts only an in-flight submission, removes temporary bytes, and leaves the
step open. The top-level `cancel()` resolves the workflow's `cancel` branch.

**Cancel** calls `cancel()` → branch **`cancel`**, whose contract routes the run
to failure. No file validation on cancel.

## Step 4 — Dev loop (optional)

Iterate on the view before a production run. Prefer **Option B** from the space root — it starts Vite for you and prints the URLs to open.

### Option A — Vite only (layout and compile)

From the space root (deps were installed by `view init`):

```bash
cd ~/work/my-first-space
npm run dev --prefix .mrmr/views/spec-intake
```

Open the URL Vite prints (usually `http://localhost:5173`). The app shows **Waiting for view context…** until the shell posts context — that is expected when you open Vite directly. Use this loop to confirm the view compiles and to tweak markup/styles quickly.

### Option B — Murrmure dev loop (contract + Submit)

From your **space root**, run:

```bash
cd ~/work/my-first-space
mrmr view dev spec-intake
```

This command **starts `npm run dev` in the view package for you** (same Vite server as Option A) and writes `.mrmr/dev/view-dev.json` with the dev URL. It prints:

- **Open:** the Vite URL (layout-only until Desktop injects context)
- **Desktop:** `/spaces/{space_id}/dev/views/spec-intake` — link the space in Desktop, then open this route
- **Fixtures:** sample step contexts under `.mrmr/views/spec-intake/dev/fixtures/` (Desktop tabs). The scaffold ships `intake.json` with `continue` / `cancel` branches.

Do **not** run Option A at the same time — both use the same port.

When a view-dev session is active, Desktop **Space Home** shows **Open preview in Desktop** — use that button instead of pasting a URL. Desktop loads the Vite URL and injects fixture context so `useViewContract()` behaves like a real run.

The scaffold’s `intake` fixture already includes `step.branches` like this:

```json
"step": {
  "step_id": "intake",
  "branches": [
    {
      "branch": "continue",
      "schema": { "type": "object", "required": ["spec"] },
      "artifact_slots": {
        "spec": { "description": "The file to attach", "max_bytes": 1048576 }
      }
    },
    { "branch": "cancel", "schema": { "type": "object" } }
  ]
}
```

The **`branches`** array must match your flow manifest's branch names and schemas from [Part 2](./02-build-minimal-flow). The host merges this `step` over a runtime base context (real hub origin + fresh nonce), so the fixture only carries the projected contract — never `hub_base_url` or `nonce`.

Submit in dev mode exercises validation and logs the resolve body — **no real run** until Part 4.

## Step 5 — Build and apply

From the **space root**:

```bash
cd ~/work/my-first-space
npm run build --prefix .mrmr/views/spec-intake
mrmr space apply
```

`mrmr space apply --strict` requires `dist/index.html`. After apply, Desktop can load the view on the next run. The view Vite config uses `base: "./"` so hub-served assets resolve under `/v1/spaces/.../views/.../dist/` (not hub-root `/assets/`).

If an older build left absolute `/assets/` paths, rebuild once after updating `vite.config.ts`, then re-apply.

## Checkpoint

- [ ] `.mrmr/views/spec-intake/` exists (`view init` ran `npm install`)
- [ ] `handlers.yaml` binds `my-dev-flow.intake` through `type: view_resolver`
- [ ] `App.tsx` uses `useViewContract` + `submitBranch` — file input + Submit + Cancel only
- [ ] `npm run build` succeeded
- [ ] `mrmr space apply` indexed the view and flow

## Next

[Part 4 — Run it and read what Murrmure did →](./04-run-and-understand)
