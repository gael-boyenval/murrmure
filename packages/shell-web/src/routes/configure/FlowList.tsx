import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient } from "../../hooks.js";
import { EvolutionPipeline } from "./EvolutionPipeline.js";

export function FlowList({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [flows, setFlows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!client) return;
    void client.flows.list(spaceId).then((rows) => setFlows(rows as typeof flows));
  }, [client, spaceId]);

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Flows</h1>
      <Link to={`/configure/spaces/${spaceId}/flows/new`}>New flow (FDK)</Link>
      {" · "}
      <Link to={`/configure/spaces/${spaceId}/flows/projects`}>Project paths</Link>
      <ul style={{ marginTop: 16 }}>
        {flows.map((flow) => (
          <li key={String(flow.install_id)}>
            <Link to={`/configure/spaces/${spaceId}/flows/${String(flow.install_id)}`}>
              {String(flow.flow_id ?? flow.package_id)} v{String(flow.version)} — {String(flow.evolution_state)}
            </Link>
          </li>
        ))}
      </ul>
    </ShellLayout>
  );
}

export function FlowInstallWizard({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [projects, setProjects] = useState<Array<{ flow_id: string; source: string }>>([]);

  useEffect(() => {
    if (!client) return;
    void client.sharedConfig
      .get()
      .then((cfg) => setProjects(cfg.flowProjects ?? []))
      .catch(() => setProjects([]));
  }, [client]);

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Install flow (FDK)</h1>
      <p>
        Flows are authored in your own repo and installed by pushing a built bundle. There is no
        bundled catalog — use the Flow Dev Kit (FDK).
      </p>
      <ol>
        <li>
          <code>mrmr flow init my-flow --from-example review-loop</code>
        </li>
        <li>
          <code>mrmr flow validate .</code> → <code>build .</code> →{" "}
          <code>mrmr flow push --space {spaceId}</code>
        </li>
        <li>Then validate → test → promote → apply from the flow detail page.</li>
      </ol>
      {projects.length > 0 && (
        <>
          <h3>Registered projects</h3>
          <ul>
            {projects.map((p) => (
              <li key={p.flow_id}>
                <code>mrmr flow push --space {spaceId}</code> (from <code>{p.source}</code>) — {p.flow_id}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to={`/configure/spaces/${spaceId}/flows/projects`}>Manage project registry →</Link>
    </ShellLayout>
  );
}

export function FlowDetail({ spaceId, installId }: { spaceId: string; installId: string }) {
  const client = useClient();
  const [install, setInstall] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!client) return;
    void client.flows.get(spaceId, installId).then((row) => setInstall(row as Record<string, unknown>));
  }, [client, spaceId, installId]);

  async function runValidate() {
    if (!client) return;
    await client.flows.validate(spaceId, installId);
    void client.flows.get(spaceId, installId).then((row) => setInstall(row as Record<string, unknown>));
  }

  async function runTest() {
    if (!client) return;
    await client.flows.test(spaceId, installId);
    void client.flows.get(spaceId, installId).then((row) => setInstall(row as Record<string, unknown>));
  }

  async function runPromote() {
    if (!client) return;
    await client.flows.promote(spaceId, { install_id: installId });
    void client.flows.get(spaceId, installId).then((row) => setInstall(row as Record<string, unknown>));
  }

  async function downloadSource() {
    if (!client) return;
    try {
      const blob = await client.flows.downloadSource(spaceId, installId);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${String(install?.flow_id ?? install?.package_id ?? "flow")}-source.tar.zst`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      /* download unavailable */
    }
  }

  const sourceMetadata = install?.source_metadata as { source_path?: string; built_at?: string } | undefined;
  const bundleDigest = install?.bundle_digest as string | undefined;
  const sourceDigest = install?.source_digest as string | undefined;

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>{String(install?.flow_id ?? install?.package_id ?? "Flow")}</h1>
      {install && (
        <>
          <EvolutionPipeline state={String(install.evolution_state)} gateId={install.gate_id as string | undefined} />
          <section style={{ marginTop: 16, fontSize: 14, color: "#444" }}>
            {sourceMetadata?.source_path && <p>Source path: <code>{sourceMetadata.source_path}</code></p>}
            {sourceMetadata?.built_at && <p>Built at: {sourceMetadata.built_at}</p>}
            {bundleDigest && <p>Bundle digest: <code>{bundleDigest}</code></p>}
            {sourceDigest && (
              <p>
                Source digest: <code>{sourceDigest}</code>
                {" · "}
                <button type="button" onClick={() => void downloadSource()} style={{ fontSize: 13 }}>
                  Download source snapshot
                </button>
              </p>
            )}
          </section>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button onClick={() => void runValidate()}>Validate</button>
            <button onClick={() => void runTest()}>Test</button>
            <button onClick={() => void runPromote()}>Promote</button>
          </div>
          <ContractDiffPanel spaceId={spaceId} />
        </>
      )}
    </ShellLayout>
  );
}

function ContractDiffPanel({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [diff, setDiff] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!client) return;
    void client.flows.diff(spaceId, { from: "2.0.0", to: "3.0.0" }).then((d) => setDiff(d as Record<string, unknown>));
  }, [client, spaceId]);

  if (!diff) return null;
  return (
    <section style={{ marginTop: 24, padding: 12, border: "1px solid #eee", borderRadius: 6 }}>
      <h3>Contract diff (2.0.0 → 3.0.0)</h3>
      <p>{String(diff.summary)}</p>
      <p>States added: {(diff.states_added as string[])?.length ?? 0}</p>
    </section>
  );
}

/** @deprecated use FlowList */
export const CapabilityList = FlowList;
/** @deprecated use FlowInstallWizard */
export const CapabilityInstallWizard = FlowInstallWizard;
/** @deprecated use FlowDetail */
export const CapabilityDetail = FlowDetail;
