import { useViewContext, useViewSubmit } from "@murrmure/view-sdk/app";

export function App() {
  const { params } = useViewContext<{ step?: string }>();
  const { submit, cancel } = useViewSubmit();
  const isReview = params?.step === "review";

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>{isReview ? "Review daily brief" : "Daily brief"}</h1>
      {isReview ? (
        <>
          <p style={{ color: "#64748b" }}>Agent output appears here in Desktop **ViewCanvasHost**.</p>
          <button type="button" onClick={() => submit({ outcome: "done" })}>
            Mark done
          </button>
        </>
      ) : (
        <>
          <p style={{ color: "#64748b" }}>
            Click to emit <code>brief.requested</code> and wake your agent via hooks.
          </p>
          <button type="button" onClick={() => submit({ event: "brief.requested" })}>
            Run daily brief
          </button>
        </>
      )}
      <button type="button" onClick={() => cancel()} style={{ marginLeft: "0.5rem" }}>
        Cancel
      </button>
    </main>
  );
}
