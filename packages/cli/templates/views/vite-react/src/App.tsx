import { useState } from "react";
import { useViewContract, isViewContractError, type ViewContractError } from "@murrmure/view-sdk/app";

export function App() {
  const { context: ctx, ready, submitBranch, cancel } = useViewContract();
  const [note, setNote] = useState("");
  const [error, setError] = useState<ViewContractError | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ctx) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", color: "#64748b" }}>
        Waiting for view context…
      </main>
    );
  }

  const branches = ctx.step?.branches ?? [];

  async function onSubmitBranch(branch: string) {
    setError(null);
    setBusy(true);
    try {
      const params = note.trim() ? { note: note.trim() } : {};
      await submitBranch(branch, params);
    } catch (err) {
      if (isViewContractError(err)) setError(err);
      else setError({ code: "VIEW_BRANCH_VALIDATION_FAILED", message: String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    setError(null);
    setBusy(true);
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
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 640 }}>
      <h1 style={{ marginTop: 0 }}>{ctx.step?.step_id ?? ctx.flow_id}</h1>
      <p style={{ color: "#64748b" }}>
        Custom view scaffold — edit <code>src/App.tsx</code> and run{" "}
        <code>mrmr view dev {ctx.flow_id}</code>. {ready ? "" : "(waiting for host…)"}
      </p>

      {ctx.input ? (
        <pre
          style={{
            background: "#f8fafc",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            overflow: "auto",
          }}
        >
          {JSON.stringify(ctx.input, null, 2)}
        </pre>
      ) : null}

      <label style={{ display: "block", marginTop: "1rem", color: "#334155" }}>
        Note
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ display: "block", marginTop: "0.25rem", width: "100%", padding: "0.4rem" }}
          placeholder="optional note"
        />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
        {branches.length > 0 ? (
          branches.map((b) => (
            <button
              key={b.branch}
              type="button"
              disabled={busy}
              onClick={() => onSubmitBranch(b.branch)}
              style={{ padding: "0.4rem 0.8rem" }}
            >
              {b.branch}
            </button>
          ))
        ) : (
          <button type="button" disabled={busy} onClick={() => onSubmitBranch("continue")}>
            Submit
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          style={{ padding: "0.4rem 0.8rem", color: "#64748b" }}
        >
          Cancel
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ marginTop: "1rem", color: "#b91c1c", fontSize: "0.875rem" }}>
          {error.code}: {error.message}
        </p>
      ) : null}
    </main>
  );
}
