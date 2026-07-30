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
