const STATES = ["draft", "validated", "tested", "promoted_pending", "live", "superseded"];

export function EvolutionPipeline({ state, gateId }: { state: string; gateId?: string }) {
  const idx = STATES.indexOf(state);

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      {STATES.map((s, i) => (
        <span key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 12,
              fontSize: 12,
              background: i <= idx ? "#111" : "#eee",
              color: i <= idx ? "#fff" : "#666",
            }}
          >
            {s}
            {s === "promoted_pending" && gateId && " ⏳"}
          </span>
          {i < STATES.length - 1 && <span style={{ color: "#ccc" }}>→</span>}
        </span>
      ))}
      {state === "promoted_pending" && gateId && (
        <a href="/spaces/spc_ui_production/gates" style={{ marginLeft: 8, fontSize: 13 }}>
          Open gate queue
        </a>
      )}
    </div>
  );
}
