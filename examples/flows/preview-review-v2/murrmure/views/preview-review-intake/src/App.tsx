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
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 560 }}>
      <h1 style={{ marginTop: 0 }}>Preview review — intake</h1>
      <p style={{ color: "#64748b" }}>
        Attach a spec file. Large markdown is stored as a step artifact — not inline in the resolve payload.
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
        <span style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Spec file</span>
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
          style={{ width: "100%" }}
        />
        {specFile ? (
          <span style={{ display: "block", marginTop: "0.25rem", color: "#64748b", fontSize: "0.875rem" }}>
            {specFile.name} ({Math.round(specFile.size / 1024)} KiB)
          </span>
        ) : null}
      </label>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem" }}>
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
          {submitting ? "Uploading…" : "Start review"}
        </button>
        <button type="button" onClick={() => cancel()} disabled={submitting}>
          Cancel
        </button>
      </div>
    </main>
  );
}
