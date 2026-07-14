# Part 6 — Build the views

Checkpoint steps need **custom views** — React apps built to `dist/` and indexed on apply. Shell built-in forms are operator fallback only.

Views live under **`.mrmr/views/{view-id}/`**. Each view is a small Vite + React package scaffolded in the steps below.

## Intake view

### Step 1 — Scaffold

```bash
cd ~/work/my-feature-site
mrmr space view init preview-review-intake
cd .mrmr/views/preview-review-intake
npm install
```

### Step 2 — Implement file picker with artifact upload

Large specs must not go inline in the resolve payload. Upload via **`artifact_slots`** (see flow manifest `continue` branch).

Replace `src/App.tsx` with the intake form below:

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
  const [reviewer, setReviewer] = useState("");
  const [specFilename, setSpecFilename] = useState("hero-section.md");
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(reviewer.trim() && specFilename.trim() && specFile);

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem", maxWidth: 560 }}>
      <h1>Attach spec</h1>
      <p>Choose a markdown file. Preview URL is discovered by the build agent — not here.</p>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span style={{ fontWeight: 600 }}>Reviewer</span>
        <input
          type="email"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="you@local"
          style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
        />
      </label>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span style={{ fontWeight: 600 }}>Spec filename</span>
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
                { reviewer: reviewer.trim(), spec_filename: specFilename.trim() },
                [{ slot: "spec", filename: specFilename.trim(), content_base64 }],
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Submit failed");
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "Uploading…" : "Start build"}
        </button>
        <button type="button" onClick={() => cancel()} disabled={submitting}>
          Cancel
        </button>
      </div>
    </main>
  );
}
```

### Step 3 — Dev loop (optional)

```bash
mrmr view dev preview-review-intake
```

Fixtures under `dev/fixtures/` let you iterate without running the full flow.

### Step 4 — Production build

```bash
npm run build
```

Strict apply requires `dist/index.html`.

---

## Review view

### Step 1 — Scaffold

```bash
cd ~/work/my-feature-site
mrmr space view init preview-review
cd .mrmr/views/preview-review
npm install
```

### Step 2 — Live review layout

Iframe left, feedback right. Preview URL comes from **`build.build-loop`** step output:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useViewContext, useViewSubmit } from "@murrmure/view-sdk/app";

function previewUrlFromBuildOutput(output: Record<string, unknown> | undefined): string {
  if (!output) return "";
  if (typeof output.preview_url === "string" && output.preview_url.trim()) {
    return output.preview_url.trim();
  }
  for (const value of Object.values(output)) {
    if (typeof value === "string" && /^https?:\/\//.test(value.trim())) {
      return value.trim();
    }
  }
  return "";
}

export function App() {
  const ctx = useViewContext();
  const { submit, cancel } = useViewSubmit();

  const buildLoopOutput = ctx.steps?.["build.build-loop"]?.output as
    | Record<string, unknown>
    | undefined;
  const buildOutput = buildLoopOutput ?? (ctx.steps?.build?.output as Record<string, unknown> | undefined);
  const previewUrl = previewUrlFromBuildOutput(buildOutput);

  const reviewOutput = ctx.steps?.["build.review"]?.output ?? ctx.steps?.review?.output;
  const priorComments = useMemo(() => {
    const raw = reviewOutput?.comments;
    return Array.isArray(raw) ? raw.map(String) : [];
  }, [reviewOutput?.comments]);

  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<string[]>(priorComments);
  useEffect(() => setComments(priorComments), [priorComments]);

  return (
    <main
      style={{
        fontFamily: "system-ui",
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        height: "100vh",
        padding: "1rem",
        boxSizing: "border-box",
        gap: "1rem",
      }}
    >
      <section style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <h1 style={{ margin: 0 }}>Live review</h1>
        {previewUrl ? (
          <iframe
            title="Preview"
            src={previewUrl}
            style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8 }}
          />
        ) : (
          <p>Waiting for build step output…</p>
        )}
      </section>
      <aside style={{ display: "flex", flexDirection: "column" }}>
        <h2 style={{ fontSize: "1rem" }}>Feedback</h2>
        <ul style={{ flex: 1, overflow: "auto", listStyle: "none", padding: 0, margin: 0 }}>
          {comments.map((c, i) => (
            <li key={i} style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>{c}</li>
          ))}
        </ul>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="What should change?"
          style={{ width: "100%", boxSizing: "border-box" }}
        />
        <button
          type="button"
          onClick={() => {
            const t = draft.trim();
            if (t) setComments((p) => [...p, t]);
            setDraft("");
          }}
        >
          Add note
        </button>
        <button type="button" style={{ marginTop: "0.5rem" }} onClick={() => submit({ outcome: "validated" })}>
          Validate
        </button>
        <button
          type="button"
          disabled={!comments.length}
          onClick={() => submit({ outcome: "changes_required", comments })}
        >
          Send feedback
        </button>
        <button type="button" onClick={() => cancel()}>Cancel</button>
      </aside>
    </main>
  );
}
```

The review view can add comment normalization and layout polish on top of this baseline.

### Step 3 — Build

```bash
npm run build
cd ~/work/my-feature-site
```

## View SDK recap

| API | Role |
|-----|------|
| `useViewSubmit()` | `submit(payload, artifacts?)` → resolve step; `cancel()` resolves `cancel` branch |
| `useViewContext()` | `ctx.step.step_id`, run input, prior step outputs (`steps["build.build-loop"].output`, …) |

Human steps use **step memos** (`awaiting_human`), not gate rows. ViewCanvasHost binds to `active_human_step` on the run.

## Checkpoint

- [ ] `preview-review-intake` and `preview-review` both have `dist/`
- [ ] Intake uploads spec artifact + submits `spec_filename` and `reviewer` — no preview URL
- [ ] Review reads `steps["build.build-loop"].output` for iframe
- [ ] Review submits `validated` or `changes_required` + comments

## Next

[Part 7 — Index and apply →](./07-index-and-apply)
