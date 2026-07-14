import { useState } from "react";
import { useViewContract, isViewContractError, type ViewContractError } from "@murrmure/view-sdk/app";

export function App() {
  const { context: ctx, submitBranch, cancel } = useViewContract();
  const [reviewer, setReviewer] = useState("");
  const [specFilename, setSpecFilename] = useState("hero-section.md");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewContractError | null>(null);

  if (!ctx) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", color: "#64748b" }}>
        Waiting for view context…
      </main>
    );
  }

  const branches = ctx.step?.branches ?? [];
  const continueBranch = branches.find((b) => b.branch === "continue") ?? branches[0];
  const specSlot = continueBranch?.artifact_slots?.spec;
  const canSubmit = Boolean(reviewer.trim() && specFilename.trim());

  async function onSubmit() {
    if (!continueBranch) return;
    setBusy(true);
    setError(null);
    try {
      await submitBranch(continueBranch.branch, {
        reviewer: reviewer.trim(),
        spec_filename: specFilename.trim(),
      });
    } catch (err) {
      if (isViewContractError(err)) setError(err);
      else setError({ code: "VIEW_BRANCH_VALIDATION_FAILED", message: String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    setBusy(true);
    setError(null);
    try {
      await cancel();
    } catch (err) {
      if (isViewContractError(err)) setError(err);
      else setError({ code: "VIEW_CANCEL_REJECTED", message: String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 560 }}>
      <h1 style={{ marginTop: 0 }}>Preview review — intake</h1>
      <p style={{ color: "#64748b" }}>
        Record the reviewer and spec filename for this run. Spec artifact upload lands in a later step.
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

      {specSlot ? (
        <p
          style={{
            color: "#64748b",
            fontSize: "0.875rem",
            background: "#f8fafc",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
          }}
        >
          Spec slot: {specSlot.description ?? "spec"} — max {Math.round((specSlot.max_bytes ?? 0) / 1024)} KiB.
        </p>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error.code}: {error.message}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button type="button" disabled={!canSubmit || busy} onClick={onSubmit}>
          {busy ? "Submitting…" : "Start review"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </main>
  );
}
