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

## Step 2 — Attach the view to the intake step

The view id (`spec-intake`) must match `presentation.view` on the step.

Edit `.mrmr/flows/my-dev-flow/flow.manifest.yaml` from [Part 2](./02-build-minimal-flow):

```diff
 steps:
   - id: intake
     description: Human attaches one spec markdown file.
+    presentation:
+      view: spec-intake
     branches:
```

When the run opens `intake`, Desktop loads **`spec-intake`** as the main UI for that step — not a built-in operator form.

## Step 3 — Implement the view (file only)

Replace `src/App.tsx` with a minimal form: **one file input**, **Submit**, **Cancel**. No reviewer field, no filename text box — the file name travels with the upload.

The view does **not** hardcode what `continue` requires. The shell passes the compiled **branch contract** from your flow manifest in `ViewAppContext.step.branches`. The SDK validates against that contract **before** calling resolve — so a missing file shows an inline error instead of failing the run on the hub.

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
| **Apply** | Compiles a step contract catalog; denormalizes `presentation.view` → `view_ref` |
| **Run** | Hub opens `intake` (`awaiting_human`); run API includes `active_human_step.branches` |
| **Shell** | Desktop loads the view and passes `context.step.branches` from the compiled contract |
| **View** | Reads the contract from `useViewContract()` — same shape as the manifest branch, no duplication |

On **Submit**, `submitBranch("continue", { files: { spec } })`:

1. SDK validates against `context.step.branches.continue` (required slot `spec`, `max_bytes`, empty payload).
2. If validation fails → `ViewContractError` with field messages; **resolve is not called**.
3. If validation passes → SDK uploads the `File` to the step workdir (encoding handled internally).
4. SDK resolves branch **`continue`** with empty payload and `artifacts_out: [{ slot: "spec", path: "…" }]`.
5. Hub promotes the file under `steps/intake/spec/`.

**Cancel** calls `cancel()` → branch **`cancel`** (`fail_run: true`). No file validation on cancel.

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

In `.mrmr/views/spec-intake/dev/fixtures/*.json`, add **`step.branches`** inside the existing `step` object:

```diff
   "step": {
     "step_id": "intake",
     "branch_names": ["continue", "cancel"],
+    "branches": {
+      "continue": {
+        "schema": { "type": "object", "required": ["spec"] },
+        "artifact_slots": {
+          "spec": { "description": "The spec markdown file", "max_bytes": 1048576 }
+        }
+      },
+      "cancel": { "schema": { "type": "object" } }
+    }
   }
```

The **`branches`** object must match your flow manifest from [Part 2](./02-build-minimal-flow).

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
- [ ] `intake` has `presentation.view: spec-intake`
- [ ] `App.tsx` uses `useViewContract` + `submitBranch` — file input + Submit + Cancel only
- [ ] `npm run build` succeeded
- [ ] `mrmr space apply` indexed the view and flow

## Next

[Part 4 — Run it and read what Murrmure did →](./04-run-and-understand)
