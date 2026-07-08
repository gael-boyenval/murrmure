import { useEffect, useMemo, useState } from "react";
import { useViewContext, useViewSubmit } from "@murrmure/view-sdk/app";

type Comment = { text: string };

function normalizeComments(raw: unknown): Comment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) =>
    typeof entry === "string" ? { text: entry } : (entry as Comment),
  );
}

/** Read preview URL from opaque build step output — convention or first http(s) string. */
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
  const priorComments = useMemo(
    () => normalizeComments(reviewOutput?.comments),
    [reviewOutput?.comments],
  );

  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<Comment[]>(priorComments);

  useEffect(() => {
    setComments(priorComments);
  }, [priorComments]);

  const addComment = () => {
    const text = draft.trim();
    if (!text) return;
    setComments((prev) => [...prev, { text }]);
    setDraft("");
  };

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        gap: "1rem",
        height: "100vh",
        padding: "1rem",
        boxSizing: "border-box",
      }}
    >
      <section style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <h1 style={{ margin: "0 0 0.5rem" }}>Preview</h1>
        {previewUrl ? (
          <iframe
            title="Preview"
            src={previewUrl}
            style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "0.5rem" }}
          />
        ) : (
          <p style={{ color: "#64748b" }}>Waiting for build step output…</p>
        )}
      </section>

      <aside style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Comments</h2>
        <ul
          style={{
            flex: 1,
            overflow: "auto",
            margin: 0,
            padding: "0.5rem",
            listStyle: "none",
            background: "#f8fafc",
            borderRadius: "0.5rem",
          }}
        >
          {comments.length === 0 ? (
            <li style={{ color: "#64748b", fontSize: "0.875rem" }}>No comments yet.</li>
          ) : (
            comments.map((comment, index) => (
              <li
                key={`${index}-${comment.text}`}
                style={{
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #e2e8f0",
                  fontSize: "0.875rem",
                }}
              >
                {comment.text}
              </li>
            ))
          )}
        </ul>

        <div style={{ marginTop: "0.75rem" }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add feedback…"
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", padding: "0.5rem" }}
          />
          <button type="button" onClick={addComment} disabled={!draft.trim()} style={{ marginTop: "0.25rem" }}>
            Add comment
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
          <button type="button" onClick={() => submit({ outcome: "validated" })}>
            Validated
          </button>
          <button
            type="button"
            onClick={() =>
              submit({
                outcome: "changes_required",
                comments: comments.map((c) => c.text),
              })
            }
            disabled={comments.length === 0}
          >
            Request changes
          </button>
          <button type="button" onClick={() => cancel()}>
            Cancel run
          </button>
        </div>
      </aside>
    </main>
  );
}
