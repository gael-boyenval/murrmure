import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient } from "../../hooks.js";
import { EvolutionPipeline } from "./EvolutionPipeline.js";

export function CapabilityList({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [capabilities, setCapabilities] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!client) return;
    void client.capabilities.list(spaceId).then((c) => setCapabilities(c as typeof capabilities));
  }, [client, spaceId]);

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Capabilities</h1>
      <Link to={`/configure/spaces/${spaceId}/capabilities/new`}>New capability (CDK)</Link>
      {" · "}
      <Link to={`/configure/spaces/${spaceId}/capabilities/projects`}>Project paths</Link>
      <ul style={{ marginTop: 16 }}>
        {capabilities.map((c) => (
          <li key={String(c.install_id)}>
            <Link to={`/configure/spaces/${spaceId}/capabilities/${String(c.install_id)}`}>
              {String(c.package_id)} v{String(c.version)} — {String(c.evolution_state)}
            </Link>
          </li>
        ))}
      </ul>
    </ShellLayout>
  );
}

export function CapabilityInstallWizard({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [projects, setProjects] = useState<Array<{ package_id: string; source: string }>>([]);

  useEffect(() => {
    if (!client) return;
    void client.sharedConfig
      .get()
      .then((cfg) => setProjects(cfg.capabilityProjects ?? []))
      .catch(() => setProjects([]));
  }, [client]);

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Install capability (CDK)</h1>
      <p>
        Capabilities are authored in your own repo and installed by pushing a built bundle. There is no
        bundled catalog — use the Capability Developer Kit.
      </p>
      <ol>
        <li>
          <code>studio capability init my-flow --from-example review-loop</code>
        </li>
        <li>
          <code>studio capability validate .</code> → <code>build .</code> →{" "}
          <code>studio capability push --space {spaceId}</code>
        </li>
        <li>Then validate → test → promote → apply from the capability detail page.</li>
      </ol>
      {projects.length > 0 && (
        <>
          <h3>Registered projects</h3>
          <ul>
            {projects.map((p) => (
              <li key={p.package_id}>
                <code>studio capability push --space {spaceId}</code> (from <code>{p.source}</code>) — {p.package_id}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to={`/configure/spaces/${spaceId}/capabilities/projects`}>Manage project registry →</Link>
    </ShellLayout>
  );
}

export function CapabilityDetail({ spaceId, installId }: { spaceId: string; installId: string }) {
  const client = useClient();
  const [install, setInstall] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!client) return;
    void client.capabilities.get(spaceId, installId).then((i) => setInstall(i as Record<string, unknown>));
  }, [client, spaceId, installId]);

  async function runValidate() {
    if (!client) return;
    await client.capabilities.validate(spaceId, installId);
    void client.capabilities.get(spaceId, installId).then((i) => setInstall(i as Record<string, unknown>));
  }

  async function runTest() {
    if (!client) return;
    await client.capabilities.test(spaceId, installId);
    void client.capabilities.get(spaceId, installId).then((i) => setInstall(i as Record<string, unknown>));
  }

  async function runPromote() {
    if (!client) return;
    await client.capabilities.promote(spaceId, { install_id: installId });
    void client.capabilities.get(spaceId, installId).then((i) => setInstall(i as Record<string, unknown>));
  }

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>{String(install?.package_id ?? "Capability")}</h1>
      {install && (
        <>
          <EvolutionPipeline state={String(install.evolution_state)} gateId={install.gate_id as string | undefined} />
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
    void client.capabilities.diff(spaceId, { from: "2.0.0", to: "3.0.0" }).then((d) => setDiff(d as Record<string, unknown>));
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
