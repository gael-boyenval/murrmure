import { useState } from "react";
import { useViewSubmit } from "@murrmure/view-sdk/app";

export function App() {
  const { submit, cancel } = useViewSubmit();
  const [reviewer, setReviewer] = useState("");
  const [previewUrl, setPreviewUrl] = useState("http://localhost:5173");

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>Preview review — intake</h1>
      <p style={{ color: "#64748b" }}>
        Enter who is reviewing and the localhost preview URL to loop on.
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
        <span style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Preview URL</span>
        <input
          type="url"
          value={previewUrl}
          onChange={(e) => setPreviewUrl(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
        />
      </label>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          disabled={!reviewer.trim() || !previewUrl.trim()}
          onClick={() => submit({ reviewer: reviewer.trim(), preview_url: previewUrl.trim() })}
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
