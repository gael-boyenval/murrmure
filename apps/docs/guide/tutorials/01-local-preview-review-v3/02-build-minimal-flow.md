# Part 2 — Build a minimal two-step flow

**Concept:** Murrmure splits **orchestration** (the flow manifest) from **execution** (space handlers) and **human UI** (views). Three files, three jobs.

You write the smallest useful graph: human **intake** → agent **write_spec** → done.

The [full 9-part tutorial](../01-local-preview-review/) adds build, review, archive, and commit on top of this same pattern.

## The three layers (one sentence each)

| Layer | File | Owns |
|-------|------|------|
| **Flow** | `.mrmr/flows/preview-review-mini/flow.manifest.yaml` | Step order, branches, who pauses (human vs agent) |
| **Handler** | `.mrmr/space/handlers.yaml` | What runs when an agent step opens |
| **View** | `.mrmr/views/spec-intake/` | How the human submits at the intake step |

The hub reads the flow. The space runs handlers. The view calls `resolve_step` when the human is done.

## Step 1 — Flow manifest (protocol only)

Create `.mrmr/flows/preview-review-mini/flow.manifest.yaml`:

```yaml
apiVersion: murrmure.flow/v1
name: preview-review-mini
description: Attach a spec file; agent copies it into the repo.

triggers:
  manual: true

start:
  manual: true

steps:
  - id: intake
    description: Human attaches a spec markdown file.
    presentation:
      view: spec-intake
    branches:
      continue:
        schema:
          type: object
          required: [spec_filename]
        artifact_slots:
          spec:
            description: Attached spec markdown file
            max_bytes: 1048576
        next: write_spec
      cancel:
        schema: { type: object }
        next: null
        fail_run: true

  - id: write_spec
    description: Agent copies the intake artifact into the repo.
    role: agent
    branches:
      completed:
        schema: { type: object }
        next: null
      failed:
        schema: { type: object }
        next: null
        fail_run: true
```

### Read the manifest like the engine does

**`intake`** — human step

- `presentation.view: spec-intake` → Desktop opens your view in **ViewCanvasHost**; run status becomes `input-required`
- `continue` branch requires `spec_filename` in the payload and a **`spec` artifact** (file bytes, not inline markdown)
- `next: write_spec` → engine opens the next step when intake resolves

**`write_spec`** — agent step

- `role: agent` → no view; hub dispatches a handler on `step.opened`
- `completed` with `next: null` → run ends successfully
- No `executor.action` in the manifest — execution is **never** declared here (portable flows)

Compare with the full flow's intake + write_spec in [Part 5 of the original tutorial](../01-local-preview-review/05-flow-manifest).

## Step 2 — Handler (space execution)

Add to `.mrmr/space/handlers.yaml` (create the file if missing):

```yaml
version: 1

x-agent-cmd: &agent_cmd cursor agent -p --force --approve-mcps --trust --output-format stream-json --stream-partial-output

handlers:
  - id: mini_write_spec
    contract_keys: [preview-review-mini.write_spec]
    on: step.opened
    type: shell_spawn
    complete: explicit
    params:
      spec_path: "{{murrmure.step.intake.artifact.spec.path}}"
      spec_filename: "{{input.spec_filename}}"
    prompt: |
      Copy the intake spec into the repo.

      Source (step artifact): {{spec_path}}
      Destination: specs/current/{{spec_filename}}

      Create `specs/current/` if needed. Then resolve the step:
      `murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "write_spec", branch: "completed" })`
    command: *agent_cmd
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000
```

The `command` line is one example — it spawns a Cursor agent session. Use whatever launches an agent in your tool; the prompt and `murrmure_resolve_step` call are what matter.

### Contract keys — the wire between flow and space

When apply indexes your manifest, the hub builds keys like:

```text
preview-review-mini.intake        (human — no handler)
preview-review-mini.write_spec    (agent — needs handler)
```

The handler's `contract_keys: [preview-review-mini.write_spec]` is the binding. Same flow manifest can run in different spaces with different handlers — that is **portability**.

`on: step.opened` + `complete: explicit` means: spawn the agent, then wait until something calls **`murrmure_resolve_step`** (or `mrmr step resolve`).

See [Space handlers](../../space-handlers) and [Part 4 of the full tutorial](../01-local-preview-review/04-prompt-triggers) for the long-form reference.

## Step 3 — Intake view (human UI)

Scaffold and install:

```bash
cd ~/work/my-first-space
mrmr space view init spec-intake
cd .mrmr/views/spec-intake
npm install
```

Replace `src/App.tsx` with a minimal file picker (no reviewer field — this mini flow does not need it):

```tsx
import { useRef, useState } from "react";
import { useViewSubmit } from "@murrmure/view-sdk/app";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function App() {
  const { submit, cancel } = useViewSubmit();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [specFilename, setSpecFilename] = useState("feature-spec.md");
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(specFilename.trim() && specFile);

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem", maxWidth: 480 }}>
      <h1>Attach a spec</h1>
      <p>Choose a markdown file from your computer. Murrmure stores it as a step artifact.</p>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span style={{ fontWeight: 600 }}>Filename in repo</span>
        <input
          type="text"
          value={specFilename}
          onChange={(e) => setSpecFilename(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
        />
      </label>
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setSpecFile(file);
          if (file?.name) setSpecFilename(file.name);
          setError(null);
        }}
      />
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={async () => {
            if (!specFile) return;
            setSubmitting(true);
            setError(null);
            try {
              const content_base64 = await fileToBase64(specFile);
              await submit(
                { spec_filename: specFilename.trim() },
                [{ slot: "spec", filename: specFilename.trim(), content_base64 }],
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Submit failed");
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "Uploading…" : "Continue"}
        </button>
        <button type="button" onClick={() => cancel()} disabled={submitting}>
          Cancel
        </button>
      </div>
    </main>
  );
}
```

Build the view bundle (required before apply):

```bash
npm run build
cd ../../..
```

`useViewSubmit().submit(payload, artifacts)` → view SDK calls hub **resolve_step** for you. The human never touches MCP.

## Step 4 — Prepare a spec file (outside the repo)

Save anywhere on disk, e.g. `~/Documents/feature-spec.md`:

```markdown
# Hero section

Add a hero block above the heading:

- Headline: "Ship features with confidence"
- Subtext: one short sentence
```

You attach this at intake in Part 3 — it is **not** in the repo beforehand.

## Step 5 — Index to the hub

```bash
mrmr space apply --strict
mrmr space doctor
mrmr space status
```

Strict apply fails fast if:

- View `dist/` is missing → run `npm run build` in the view folder
- **`HANDLER_MISSING`** → agent step has no matching `contract_keys`
- Legacy manifest shapes → use `branches` + `role` / `presentation` (v2.2)

After success, `mrmr space status` should list:

| Item | Expected |
|------|----------|
| Flow | `preview-review-mini` |
| View | `spec-intake` |
| Handler | `mini_write_spec` |

Apply also writes `.mrmr/dev/contracts/contract-keys.json` — open it to see the keys your handler must cover.

## Checkpoint

- [ ] Two-step manifest: `intake` → `write_spec` (terminal on `completed`)
- [ ] Handler `mini_write_spec` covers `preview-review-mini.write_spec`
- [ ] `spec-intake` view built to `dist/`
- [ ] `mrmr space apply --strict` succeeds
- [ ] Spec `.md` saved outside the repo for Part 3

## Next

[Part 3 — Run it and read what Murrmure did →](./03-run-and-understand)
