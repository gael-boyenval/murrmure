import { useEffect, useState } from "react";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient } from "../../hooks.js";

export function HubSettings() {
  const client = useClient();
  const [health, setHealth] = useState<{ status: string; uptime_s: number; flows: string[] } | null>(null);
  const [federation, setFederation] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!client) return;
    void client.health().then(setHealth);
    void client.ops.federationStatus().then((f) => setFederation(f as Record<string, unknown>));
  }, [client]);

  async function exportGrants() {
    if (!client) return;
    const blob = await client.grants.exportHubWide();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "grants-export.json";
    a.click();
  }

  return (
    <ShellLayout mode="configure">
      <h1>Hub settings</h1>
      {health && (
        <section style={{ marginBottom: 24 }}>
          <h2>Health</h2>
          <p>Status: {health.status} — uptime {health.uptime_s}s</p>
          <p>Flows: {health.flows.join(", ") || "none"}</p>
        </section>
      )}
      {federation && (
        <section style={{ marginBottom: 24 }}>
          <h2>Relay status</h2>
          <p>Relay: {String(federation.relay_status)}</p>
          <p>Connected hubs: {String(federation.connected_hubs)}</p>
        </section>
      )}
      <section>
        <h2>Grant export</h2>
        <button onClick={() => void exportGrants()}>Download hub-wide grant inventory</button>
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>Drift</h2>
        <p style={{ color: "#666" }}>No drift detected (stub).</p>
      </section>
    </ShellLayout>
  );
}
