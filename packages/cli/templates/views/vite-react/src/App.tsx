import { useViewContext, useViewSubmit } from "@murrmure/view-sdk/app";

export function App() {
  const ctx = useViewContext();
  const { submit, cancel } = useViewSubmit();

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 640 }}>
      <h1 style={{ marginTop: 0 }}>{ctx.gate?.step_id ?? ctx.flow_id}</h1>
      <p style={{ color: "#64748b" }}>
        Checkpoint view scaffold — edit <code>src/App.tsx</code> and run{" "}
        <code>mrmr view dev {ctx.flow_id}</code>.
      </p>
      {ctx.input ? (
        <pre
          style={{
            background: "#f8fafc",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
          }}
        >
          {JSON.stringify(ctx.input, null, 2)}
        </pre>
      ) : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button type="button" onClick={() => submit({ outcome: "validated" })}>
          Submit
        </button>
        <button type="button" onClick={() => cancel()}>
          Cancel
        </button>
      </div>
    </main>
  );
}
