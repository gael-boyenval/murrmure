import { useViewContract } from "@murrmure/view-sdk/app";

export function App() {
  const { context, submitBranch, cancel } = useViewContract();
  const stepId = context?.step_id;
  const isReview = stepId === "review";

  if (!context) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", color: "#64748b" }}>
        Waiting for view context…
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>{isReview ? "Review daily brief" : "Daily brief"}</h1>
      {isReview ? (
        <>
          <p style={{ color: "#64748b" }}>Agent output appears here in Desktop ViewCanvasHost.</p>
          <button type="button" onClick={() => void submitBranch("approved", {})}>
            Mark done
          </button>
        </>
      ) : (
        <>
          <p style={{ color: "#64748b" }}>
            Continue to the agent step. Event wake is handled by space handlers on{" "}
            <code>brief.requested</code>.
          </p>
          <button type="button" onClick={() => void submitBranch("continue", {})}>
            Run daily brief
          </button>
        </>
      )}
      <button type="button" onClick={() => void cancel()} style={{ marginLeft: "0.5rem" }}>
        Cancel
      </button>
    </main>
  );
}
