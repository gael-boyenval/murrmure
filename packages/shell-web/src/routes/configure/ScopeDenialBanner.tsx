export function ScopeDenialBanner({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div
      style={{
        padding: 12,
        marginBottom: 16,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 6,
        color: "#991b1b",
      }}
    >
      <strong>Action denied</strong>
      <p style={{ margin: "4px 0 0" }}>{error}</p>
    </div>
  );
}
