import { useState } from "react";
import { useViewSubmit } from "@murrmure/view-sdk/app";

export function App() {
  const { submit, cancel } = useViewSubmit();
  const [reviewer, setReviewer] = useState("");
  const [specFilename, setSpecFilename] = useState("feature.md");
  const [specMarkdown, setSpecMarkdown] = useState(
    "# Hero section\n\nAdd a centered headline and short tagline on the landing page.",
  );

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 560 }}>
      <h1 style={{ marginTop: 0 }}>Preview review — intake</h1>
      <p style={{ color: "#64748b" }}>
        Attach a spec from your computer (paste markdown here). Preview URL is discovered by the build agent — not intake.
      </p>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Reviewer</span>
        <input
          type="email"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="you@local"
          style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
        />
      </label>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Spec filename</span>
        <input
          type="text"
          value={specFilename}
          onChange={(e) => setSpecFilename(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
        />
      </label>
      <label style={{ display: "block", marginBottom: "1rem" }}>
        <span style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Spec markdown</span>
        <textarea
          value={specMarkdown}
          onChange={(e) => setSpecMarkdown(e.target.value)}
          rows={10}
          style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box", fontFamily: "inherit" }}
        />
      </label>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          disabled={!reviewer.trim() || !specFilename.trim() || !specMarkdown.trim()}
          onClick={() =>
            submit({
              reviewer: reviewer.trim(),
              spec_filename: specFilename.trim(),
              spec_markdown: specMarkdown.trim(),
            })
          }
        >
          Start review
        </button>
        <button type="button" onClick={() => cancel()}>
          Cancel
        </button>
      </div>
    </main>
  );
}
