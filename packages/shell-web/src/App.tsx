import { Link, Route, Routes, useParams, Navigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShellLayout } from "./ShellLayout.js";
import { useClient } from "./hooks.js";
import { CapabilityCanvasHost } from "./CapabilityCanvasHost.js";
import {
  resolveCanvasPath,
  type CapabilityInstallRow,
  type InstanceRow,
} from "./canvas-resolve.js";
import { ConfigureDashboard } from "./routes/configure/ConfigureDashboard.js";
import { SetupWizard } from "./routes/configure/SetupWizard.js";
import { SpaceForm, SpaceSettings } from "./routes/configure/SpaceForm.js";
import { CapabilityList, CapabilityInstallWizard, CapabilityDetail } from "./routes/configure/CapabilityList.js";
import { NewCapabilityPage } from "./routes/configure/NewCapabilityPage.js";
import { CapabilityProjectPicker } from "./routes/configure/CapabilityProjectPicker.js";
import { GrantList, GrantMintWizard } from "./routes/configure/GrantList.js";
import { TriggerList, TriggerRegisterForm, MemberList } from "./routes/configure/TriggerList.js";
import { HubSettings } from "./routes/configure/HubSettings.js";

function ConnectPage() {
  const [hubUrl, setHubUrl] = useState(localStorage.getItem("studio_hub_url") ?? "http://127.0.0.1:8787");
  const [token, setToken] = useState(localStorage.getItem("studio_token") ?? "");

  return (
    <ShellLayout mode="runtime">
      <h1>Connect</h1>
      <label>
        Hub URL
        <input value={hubUrl} onChange={(e) => setHubUrl(e.target.value)} style={{ display: "block", width: 320, marginBottom: 8 }} />
      </label>
      <label>
        Token
        <input value={token} onChange={(e) => setToken(e.target.value)} style={{ display: "block", width: 320 }} />
      </label>
      <p style={{ marginTop: 8, color: "#666", fontSize: 14 }}>
        Local dev bootstrap token: <code>tok_01JBOOTSTRAPTOKEN00000001</code>
      </p>
      <button
        onClick={() => {
          localStorage.setItem("studio_hub_url", hubUrl);
          localStorage.setItem("studio_token", token);
          const setupDone = localStorage.getItem("studio_setup_complete");
          window.location.href = setupDone ? "/configure" : "/setup";
        }}
        style={{ marginTop: 12 }}
      >
        Save & continue
      </button>
    </ShellLayout>
  );
}

function SpaceInstances() {
  const { spaceId } = useParams();
  const client = useClient();
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [installs, setInstalls] = useState<CapabilityInstallRow[]>([]);

  const refresh = useCallback(() => {
    if (!client || !spaceId) return;
    void client.instances.list(spaceId).then((rows) => setInstances(rows as InstanceRow[]));
    void client.capabilities.list(spaceId).then((c) => setInstalls(c as CapabilityInstallRow[]));
  }, [client, spaceId]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <ShellLayout mode="runtime" spaceId={spaceId}>
      <h1>Instances — {spaceId}</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Review sessions and other workflow instances appear here after an agent creates them via MCP.
      </p>
      {instances.length === 0 ? (
        <p style={{ marginTop: 16, color: "#666" }}>No instances yet.</p>
      ) : (
        <ul style={{ marginTop: 16, padding: 0, listStyle: "none" }}>
          {instances.map((instance) => {
            const href = spaceId ? resolveCanvasPath(spaceId, instance, installs) : null;
            return (
              <li
                key={instance.instance_id}
                style={{ marginBottom: 10, padding: 12, border: "1px solid #e5e5e5", borderRadius: 6 }}
              >
                <div>
                  <strong>{instance.instance_id}</strong>
                  <span style={{ marginLeft: 8, color: "#666" }}>{instance.state}</span>
                </div>
                {href ? (
                  <Link to={href} style={{ display: "inline-block", marginTop: 8 }}>
                    Open review canvas →
                  </Link>
                ) : (
                  <p style={{ marginTop: 8, fontSize: 13, color: "#b45309" }}>
                    No live capability matches this instance — check contract_ref_id and apply live.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ShellLayout>
  );
}

function InstanceCanvasRedirect({ sessionAlias }: { sessionAlias?: boolean }) {
  const { spaceId, instanceId, sessionKey } = useParams();
  const client = useClient();
  const key = sessionAlias ? sessionKey : instanceId;
  const [target, setTarget] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!client || !spaceId || !key) return;
    void (async () => {
      const [instances, installs] = await Promise.all([
        client.instances.list(spaceId),
        client.capabilities.list(spaceId),
      ]);
      const instance = (instances as InstanceRow[]).find((i) => i.instance_id === key);
      if (!instance) {
        setMissing(true);
        return;
      }
      const path = resolveCanvasPath(spaceId, instance, installs as CapabilityInstallRow[]);
      if (path) setTarget(path);
      else setMissing(true);
    })();
  }, [client, spaceId, key]);

  if (target) return <Navigate to={target} replace />;
  if (missing) {
    return (
      <ShellLayout mode="runtime" spaceId={spaceId}>
        <h1>Instance not found</h1>
        <p style={{ color: "#666" }}>
          {key} is missing or has no live capability canvas. Open{" "}
          <Link to={`/spaces/${spaceId}`}>Runtime → Instances</Link>.
        </p>
      </ShellLayout>
    );
  }
  return (
    <ShellLayout mode="runtime" spaceId={spaceId}>
      <p>Loading canvas…</p>
    </ShellLayout>
  );
}

function GatesPage() {
  const { spaceId } = useParams();
  const client = useClient();
  const [gates, setGates] = useState<Array<{ gate_id: string; instance_id: string }>>([]);

  useEffect(() => {
    if (!client || !spaceId) return;
    void client.gates.list(spaceId).then((g) => setGates(g as typeof gates));
  }, [client, spaceId]);

  return (
    <ShellLayout mode="runtime" spaceId={spaceId}>
      <h1>Gates — {spaceId}</h1>
      {gates.map((g) => (
        <div key={g.gate_id} style={{ marginBottom: 12, padding: 12, border: "1px solid #ccc" }}>
          <div>{g.gate_id}</div>
          <div>Instance: {g.instance_id}</div>
          <button
            onClick={() =>
              client?.gates.resolve(spaceId!, g.gate_id, {
                decision: "approved",
                instance_id: g.instance_id,
              })
            }
          >
            Approve
          </button>
        </div>
      ))}
    </ShellLayout>
  );
}

function AuditPage() {
  const { spaceId } = useParams();
  const client = useClient();

  return (
    <ShellLayout mode="runtime" spaceId={spaceId}>
      <h1>Audit export — {spaceId}</h1>
      <button
        onClick={async () => {
          if (!client || !spaceId) return;
          const blob = await client.audit.export(spaceId, { since: "0" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `audit-${spaceId}.jsonl`;
          a.click();
        }}
      >
        Download JSONL
      </button>
    </ShellLayout>
  );
}

function CanvasPage() {
  const { spaceId, instanceId, packageId } = useParams();
  const [search] = useSearchParams();
  const version = search.get("version") ?? "0.1.0";
  if (!spaceId || !instanceId || !packageId) return null;
  return (
    <CapabilityCanvasHost
      spaceId={spaceId}
      instanceId={instanceId}
      packageId={packageId}
      version={version}
    />
  );
}

function NewCapabilityRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <NewCapabilityPage spaceId={spaceId} />;
}

function ProjectPickerRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <CapabilityProjectPicker spaceId={spaceId} />;
}

function SpaceSettingsRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <SpaceSettings spaceId={spaceId} />;
}

function CapabilityListRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <CapabilityList spaceId={spaceId} />;
}

function CapabilityInstallRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <CapabilityInstallWizard spaceId={spaceId} />;
}

function CapabilityDetailRoute() {
  const { spaceId, installId } = useParams();
  if (!spaceId || !installId) return null;
  return <CapabilityDetail spaceId={spaceId} installId={installId} />;
}

function GrantListRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <GrantList spaceId={spaceId} />;
}

function GrantMintRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <GrantMintWizard spaceId={spaceId} />;
}

function TriggerListRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <TriggerList spaceId={spaceId} />;
}

function TriggerRegisterRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <TriggerRegisterForm spaceId={spaceId} />;
}

function MemberListRoute() {
  const { spaceId } = useParams();
  if (!spaceId) return null;
  return <MemberList spaceId={spaceId} />;
}

export function App() {
  const setupDone = useMemo(() => localStorage.getItem("studio_setup_complete") === "1", []);

  return (
    <Routes>
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/setup" element={<SetupWizard />} />
      <Route path="/configure" element={<ConfigureDashboard />} />
      <Route path="/configure/spaces/new" element={<SpaceForm />} />
      <Route path="/configure/spaces/:spaceId" element={<SpaceSettingsRoute />} />
      <Route path="/configure/spaces/:spaceId/capabilities" element={<CapabilityListRoute />} />
      <Route path="/configure/spaces/:spaceId/capabilities/new" element={<NewCapabilityRoute />} />
      <Route path="/configure/spaces/:spaceId/capabilities/projects" element={<ProjectPickerRoute />} />
      <Route path="/configure/spaces/:spaceId/capabilities/install" element={<CapabilityInstallRoute />} />
      <Route path="/configure/spaces/:spaceId/capabilities/:installId" element={<CapabilityDetailRoute />} />
      <Route path="/configure/spaces/:spaceId/grants" element={<GrantListRoute />} />
      <Route path="/configure/spaces/:spaceId/grants/new" element={<GrantMintRoute />} />
      <Route path="/configure/spaces/:spaceId/triggers" element={<TriggerListRoute />} />
      <Route path="/configure/spaces/:spaceId/triggers/new" element={<TriggerRegisterRoute />} />
      <Route path="/configure/spaces/:spaceId/members" element={<MemberListRoute />} />
      <Route path="/configure/hub" element={<HubSettings />} />
      <Route path="/spaces/:spaceId" element={<SpaceInstances />} />
      <Route path="/spaces/:spaceId/gates" element={<GatesPage />} />
      <Route path="/spaces/:spaceId/audit" element={<AuditPage />} />
      <Route path="/spaces/:spaceId/instances/:instanceId/canvas/:packageId" element={<CanvasPage />} />
      <Route path="/spaces/:spaceId/instances/:instanceId" element={<InstanceCanvasRedirect />} />
      <Route path="/spaces/:spaceId/sessions/:sessionKey" element={<InstanceCanvasRedirect sessionAlias />} />
      <Route path="*" element={<Navigate to={setupDone ? "/configure" : "/connect"} replace />} />
    </Routes>
  );
}
