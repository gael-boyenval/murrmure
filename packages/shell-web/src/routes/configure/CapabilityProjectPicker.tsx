import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient } from "../../hooks.js";

interface CapabilityProject {
  package_id: string;
  source: string;
}

export function CapabilityProjectPicker({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [projects, setProjects] = useState<CapabilityProject[]>([]);
  const [source, setSource] = useState("");
  const [packageId, setPackageId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client) return;
    void client.sharedConfig
      .get()
      .then((cfg) => setProjects(cfg.capabilityProjects ?? []))
      .catch(() => setError("Could not load project registry from hub"));
  }, [client]);

  async function save() {
    if (!client || !packageId || !source) return;
    setError("");
    const next = [...projects.filter((p) => p.package_id !== packageId), { package_id: packageId, source }];
    try {
      const result = await client.sharedConfig.setProjects(next);
      setProjects(result.capabilityProjects ?? next);
      setPackageId("");
      setSource("");
    } catch {
      setError("Could not save to hub registry");
    }
  }

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h2>Project registry (BC6b)</h2>
      <p>
        Capability project paths are stored on the hub in <code>~/.studio/hubs/shared.json</code> under{" "}
        <code>capabilityProjects</code> and used by <code>studio capability dev</code>.
      </p>
      {error && <p style={{ color: "#b00" }}>{error}</p>}
      <label>
        package_id
        <input value={packageId} onChange={(e) => setPackageId(e.target.value)} style={{ display: "block", marginBottom: 8 }} />
      </label>
      <label>
        source path
        <input value={source} onChange={(e) => setSource(e.target.value)} style={{ display: "block", width: "100%", marginBottom: 8 }} />
      </label>
      <button onClick={() => void save()} disabled={!packageId || !source}>
        Register project
      </button>
      <ul>
        {projects.map((p) => (
          <li key={p.package_id}>
            {p.package_id} → {p.source}
          </li>
        ))}
      </ul>
      <Link to={`/configure/spaces/${spaceId}/capabilities/new`}>← New capability</Link>
    </ShellLayout>
  );
}

export function CapabilityProjectPickerRoute() {
  const spaceId = window.location.pathname.split("/")[3];
  if (!spaceId) return null;
  return <CapabilityProjectPicker spaceId={spaceId} />;
}
