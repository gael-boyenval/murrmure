import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient } from "../../hooks.js";

export function ConfigureDashboard() {
  const client = useClient();

  return (
    <ShellLayout mode="configure">
      <h1>Configuration</h1>
      <p>Manage spaces, capabilities, grants, and triggers.</p>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <Link to="/setup" style={{ padding: "10px 16px", background: "#111", color: "#fff", borderRadius: 6, textDecoration: "none" }}>
          Run setup wizard
        </Link>
        <Link to="/configure/spaces/new" style={{ padding: "10px 16px", border: "1px solid #ccc", borderRadius: 6, textDecoration: "none", color: "#111" }}>
          Create space
        </Link>
        <Link to="/configure/hub" style={{ padding: "10px 16px", border: "1px solid #ccc", borderRadius: 6, textDecoration: "none", color: "#111" }}>
          Hub settings
        </Link>
      </div>
      {client && <SpacesList />}
    </ShellLayout>
  );
}

function SpacesList() {
  const client = useClient();
  const [spaces, setSpaces] = useState<Array<{ space_id: string; name?: string; slug: string }>>([]);

  useEffect(() => {
    if (!client) return;
    void client.spaces.list().then(setSpaces);
  }, [client]);

  if (spaces.length === 0) {
    return <p style={{ marginTop: 24, color: "#666" }}>No spaces yet — run the setup wizard.</p>;
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2>Spaces</h2>
      <ul>
        {spaces.map((s) => (
          <li key={s.space_id} style={{ marginBottom: 12 }}>
            <Link to={`/configure/spaces/${s.space_id}`}>{s.name ?? s.slug}</Link>
            <span style={{ color: "#888", marginLeft: 8 }}>{s.space_id}</span>
            <div style={{ marginTop: 4, fontSize: 14, display: "flex", gap: 12 }}>
              <Link to={`/configure/spaces/${s.space_id}/capabilities`}>Capabilities</Link>
              <Link to={`/configure/spaces/${s.space_id}/grants`}>Agent grants</Link>
              <Link to={`/configure/spaces/${s.space_id}/triggers`}>Triggers</Link>
              <Link to={`/configure/spaces/${s.space_id}/members`}>Members</Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
