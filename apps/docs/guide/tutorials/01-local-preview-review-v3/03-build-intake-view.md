# Part 3 — Build the intake view

**Concept:** **Views** own human presentation. The flow manifest says what the human must provide (branches, schemas, artifact slots); the view is how they provide it when **Desktop** opens the step.

You scaffold a minimal intake UI — file picker, **Submit**, **Cancel** — wire it to the `intake` step, build, and apply.

## Step 1 — Scaffold the view package

From your space root:

```bash
cd ~/work/my-first-space
mrmr space view init spec-intake
cd .mrmr/views/spec-intake
npm install
```

This creates `.mrmr/views/spec-intake/` — a small Vite + React app with `view.manifest.yaml` and `src/App.tsx`.

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

Replace `src/App.tsx` with a minimal form: **one file input**, **Submit**, **Cancel**. No reviewer field, no filename text box — the file name travels with the upload.

The view does **not** hardcode what `continue` requires. The shell passes the compiled **branch contract** from your flow manifest in `ViewAppContext.step.branches`. The SDK validates against that contract **before** calling resolve — so a missing file shows an inline error instead of failing the run on the hub.

<!-- tutorial-v3-fence:part-3-app -->
```tsx
import { useState } from "react";
import { isViewContractError, useViewContract } from "@murrmure/view-sdk/app";

export function App() {
  const { submitBranch, cancel } = useViewContract();
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!specFile) return;
    setSubmitting(true);
    setErrors([]);
    try {
      await submitBranch("continue", { files: { spec: specFile } });
    } catch (err) {
      if (isViewContractError(err)) {
        setErrors(err.errors.map((e) => e.message));
      } else {
        setErrors([err instanceof Error ? err.message : "Submit failed"]);
      }
      setSubmitting(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem", maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>Attach spec</h1>
      <p style={{ color: "#64748b" }}>Choose one markdown file to attach.</p>
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
        <button type="button" disabled={!specFile || submitting} onClick={handleSubmit}>
          {submitting ? "Uploading…" : "Submit"}
        </button>
        <button type="button" onClick={() => cancel()} disabled={submitting}>
          Cancel
        </button>
      </div>
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

**Cancel** calls `cancel()` → branch **`cancel`**, whose contract routes the run
to failure. No file validation on cancel.

## Step 4 — Dev loop (optional)

Iterate on the view before a production run. You work inside the view package — Vite hot-reloads `src/App.tsx` on save.

### Option A — Vite only (layout and compile)

In the view package:

```bash
cd .mrmr/views/spec-intake
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The app shows **Waiting for view context…** until the shell posts context — that is expected when you open Vite directly. Use this loop to confirm the view compiles and to tweak markup/styles quickly.

### Option B — Murrmure dev loop (contract + Submit)

From your **space root**, run:

```bash
cd ~/work/my-first-space
mrmr view dev spec-intake
```

This command **starts `npm run dev` in the view package for you** (same Vite server as Option A) and writes `.mrmr/dev/view-dev.json` with the dev URL. Do **not** run Option A at the same time — both use the same port.

Then in Desktop, open your space → **dev view** route (`/spaces/{space_id}/dev/views/spec-intake`). Desktop loads the Vite URL and injects fixture context — including `step.branches` from `dev/fixtures/*.json` — so `useViewContract()` behaves like a real run.

In `.mrmr/views/spec-intake/dev/fixtures/*.json`, add **`step.branches`** inside the existing `step` object. `branches` is a **server-style array** of branch contracts — the same wire shape the shell projects in production, never an object map:

```diff
   "step": {
     "step_id": "intake",
+    "branches": [
+      {
+        "branch": "continue",
+        "schema": { "type": "object", "required": ["spec"] },
+        "artifact_slots": {
+          "spec": { "description": "The spec markdown file", "max_bytes": 1048576 }
+        }
+      },
+      { "branch": "cancel", "schema": { "type": "object" } }
+    ]
   }
```

The **`branches`** array must match your flow manifest's branch names and schemas from [Part 2](./02-build-minimal-flow). The host merges this `step` over a runtime base context (real hub origin + fresh nonce), so the fixture only carries the projected contract — never `hub_base_url` or `nonce`.

Submit in dev mode exercises validation and logs the resolve body — **no real run** until Part 4.

## Step 5 — Build and apply

```bash
npm run build
cd ../../..
mrmr space apply
```

`mrmr space apply --strict` requires `dist/index.html`. After apply, Desktop can load the view on the next run.

## Checkpoint

- [ ] `.mrmr/views/spec-intake/` exists with `npm install` done
- [ ] `handlers.yaml` binds `my-dev-flow.intake` through `type: view_resolver`
- [ ] `App.tsx` uses `useViewContract` + `submitBranch` — file input + Submit + Cancel only
- [ ] `npm run build` succeeded
- [ ] `mrmr space apply` indexed the view and flow

## Next

[Part 4 — Run it and read what Murrmure did →](./04-run-and-understand)
