# Part 6 — Build the views

Checkpoint steps need **custom views** — React apps built to `dist/` and indexed on apply. Shell built-in forms are operator fallback only.

## Intake view

### Step 1 — Scaffold

```bash
cd ~/work/my-feature-site
mrmr space view init preview-review-intake
cd murrmure/views/preview-review-intake
npm install
```

### Step 2 — Implement file picker

Replace `src/App.tsx`:

```tsx
import { useState } from "react";
import { useViewSubmit } from "@murrmure/view-sdk/app";

export function App() {
  const { submit, cancel } = useViewSubmit();
  const [reviewer, setReviewer] = useState("");
  const [specMarkdown, setSpecMarkdown] = useState("");
  const [specFilename, setSpecFilename] = useState("");

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem", maxWidth: 560 }}>
      <h1>Attach spec</h1>
      <p>Choose a markdown file from your computer. Preview URL is discovered by the build agent — not here.</p>
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
      <input
        type="file"
        accept=".md,text/markdown"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setSpecFilename(f.name);
          f.text().then(setSpecMarkdown);
        }}
      />
      {specFilename ? <p style={{ color: "#64748b" }}>{specFilename}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button
          type="button"
          disabled={!specMarkdown.trim() || !reviewer.trim()}
          onClick={() =>
            submit({
              spec_markdown: specMarkdown,
              spec_filename: specFilename || "feature.md",
              reviewer: reviewer.trim(),
            })
          }
        >
          Start build
        </button>
        <button type="button" onClick={() => cancel()}>Cancel</button>
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
cd murrmure/views/preview-review
npm install
```

### Step 2 — Live review layout

Iframe left, feedback right. Preview URL comes from **build step output** — whatever keys the agent put in `murrmure_complete_action` result:

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
  const buildOutput = ctx.steps?.build?.output as Record<string, unknown> | undefined;
  const previewUrl = previewUrlFromBuildOutput(buildOutput);

  const priorComments = useMemo(() => {
    const raw = ctx.steps?.review?.output?.comments;
    return Array.isArray(raw) ? raw.map(String) : [];
  }, [ctx.steps?.review?.output?.comments]);

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

Optional: poll fresh run state with `useViewHubClient().runs.get(ctx.run_id)` if the iframe should update after agent calls `complete_action` again.

### Step 3 — Build

```bash
npm run build
cd ~/work/my-feature-site
```

## View SDK recap

| API | Role |
|-----|------|
| `useViewSubmit()` | `submit(payload)` resolves checkpoint; `cancel()` fails run |
| `useViewContext()` | Run input, prior step outputs (`steps.build.output`, …) |

## Checkpoint

- [ ] `preview-review-intake` and `preview-review` both have `dist/`
- [ ] Intake submits spec + reviewer — no preview URL
- [ ] Review reads `steps.build.output` for iframe
- [ ] Review submits `validated` or `changes_required` + comments

## Next

[Part 7 — Index and apply →](./07-index-and-apply)
