import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient } from "../../hooks.js";

interface FlowProject {
  flow_id: string;
  source: string;
}

export function FlowProjectPicker({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [projects, setProjects] = useState<FlowProject[]>([]);
  const [source, setSource] = useState("");
  const [flowId, setFlowId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client) return;
    void client.sharedConfig
      .get()
      .then((cfg) => setProjects(cfg.flowProjects ?? []))
      .catch(() => setError("Could not load project registry from hub"));
  }, [client]);

  async function save() {
    if (!client || !flowId || !source) return;
    setError("");
    const next = [...projects.filter((p) => p.flow_id !== flowId), { flow_id: flowId, source }];
    try {
      const result = await client.sharedConfig.setProjects(next);
      setProjects(result.flowProjects ?? next);
      setFlowId("");
      setSource("");
    } catch {
      setError("Could not save to hub registry");
    }
  }

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h2>Project registry (BC6b)</h2>
      <p>
        Flow project paths are stored on the hub in <code>~/.murrmure/hubs/shared.json</code> under{" "}
        <code>flowProjects</code> and used by <code>mrmr flow dev</code>.
      </p>
      {error && <p style={{ color: "#b00" }}>{error}</p>}
      <label>
        flow_id
        <input value={flowId} onChange={(e) => setFlowId(e.target.value)} style={{ display: "block", marginBottom: 8 }} />
      </label>
      <label>
        source path
        <input value={source} onChange={(e) => setSource(e.target.value)} style={{ display: "block", width: "100%", marginBottom: 8 }} />
      </label>
      <button onClick={() => void save()} disabled={!flowId || !source}>
        Register project
      </button>
      <ul>
        {projects.map((p) => (
          <li key={p.flow_id}>
            {p.flow_id} → {p.source}
          </li>
        ))}
      </ul>
      <Link to={`/configure/spaces/${spaceId}/flows/new`}>← New flow</Link>
    </ShellLayout>
  );
}
