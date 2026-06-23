import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { getStoredHubUrl, setActiveSpaceId, useClient } from "../../hooks.js";
import { ScopeDenialBanner } from "./ScopeDenialBanner.js";

type CapabilityInstall = {
  install_id: string;
  package_id: string;
  version: string;
  evolution_state: string;
};

function CapabilityAclPicker({
  spaceId,
  selected,
  onChange,
}: {
  spaceId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const client = useClient();
  const [installs, setInstalls] = useState<CapabilityInstall[]>([]);

  useEffect(() => {
    if (!client) return;
    void client.capabilities.list(spaceId).then((rows) => {
      setInstalls(rows as CapabilityInstall[]);
    });
  }, [client, spaceId]);

  const packages = useMemo(() => {
    const byId = new Map<string, CapabilityInstall[]>();
    for (const install of installs) {
      const list = byId.get(install.package_id) ?? [];
      list.push(install);
      byId.set(install.package_id, list);
    }
    return [...byId.entries()].map(([package_id, rows]) => ({
      package_id,
      live: rows.some((r) => r.evolution_state === "live"),
      versions: rows.map((r) => `${r.version} (${r.evolution_state})`).join(", "),
    }));
  }, [installs]);

  useEffect(() => {
    if (selected.length > 0 || packages.length === 0) return;
    const live = packages.filter((p) => p.live).map((p) => p.package_id);
    if (live.length > 0) onChange(live);
  }, [packages, selected.length, onChange]);

  function toggle(packageId: string) {
    if (selected.includes(packageId)) {
      onChange(selected.filter((id) => id !== packageId));
    } else {
      onChange([...selected, packageId]);
    }
  }

  if (packages.length === 0) {
    return (
      <p style={{ color: "#666", fontSize: 14 }}>
        No capabilities in this space yet.{" "}
        <Link to={`/configure/spaces/${spaceId}/capabilities`}>Push a capability</Link> first, then return
        here to mint a grant.
      </p>
    );
  }

  return (
    <fieldset style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 12 }}>
      <legend>Capability access (ACL)</legend>
      <p style={{ fontSize: 13, color: "#666", marginTop: 0 }}>
        Agents only see MCP tools for packages listed here. Select every capability your agent should use.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {packages.map((pkg) => (
          <li key={pkg.package_id} style={{ marginBottom: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={selected.includes(pkg.package_id)}
                onChange={() => toggle(pkg.package_id)}
              />
              <span>
                <strong>{pkg.package_id}</strong>
                {!pkg.live && (
                  <span style={{ color: "#b45309", marginLeft: 6, fontSize: 12 }}>not live</span>
                )}
                {pkg.live && (
                  <span style={{ color: "#15803d", marginLeft: 6, fontSize: 12 }}>live</span>
                )}
                <br />
                <span style={{ fontSize: 12, color: "#666" }}>{pkg.versions}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function mcpSnippet(token: string, spaceId: string): string {
  const hubUrl = getStoredHubUrl();
  return `{
  "mcpServers": {
    "murrmure": {
      "command": "murrmure",
      "args": ["mcp"],
      "env": {
        "MURRMURE_HUB_URL": "${hubUrl}",
        "MURRMURE_HUB_TOKEN": "${token}",
        "MURRMURE_SPACE_ID": "${spaceId}"
      }
    }
  }
}`;
}

export function GrantList({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [grants, setGrants] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  const [rotatedToken, setRotatedToken] = useState("");

  async function reload() {
    if (!client) return;
    const g = await client.grants.list(spaceId);
    setGrants(g as typeof grants);
  }

  useEffect(() => {
    setActiveSpaceId(spaceId);
  }, [spaceId]);

  useEffect(() => {
    void reload();
  }, [client, spaceId]);

  async function rotate(grantId: string) {
    if (!client) return;
    setError("");
    setRotatedToken("");
    try {
      const result = await client.grants.rotate(spaceId, grantId);
      setRotatedToken(String((result as { token: string }).token));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rotate failed");
    }
  }

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Agent grants</h1>
      <p style={{ color: "#666", maxWidth: 560 }}>
        Grants mint one-time tokens for coding agents (Cursor, CI, etc.). Each grant scopes which
        capabilities an agent can call via MCP.
      </p>
      <ScopeDenialBanner error={error} />
      <Link
        to={`/configure/spaces/${spaceId}/grants/new`}
        style={{ display: "inline-block", marginTop: 8, padding: "8px 14px", background: "#111", color: "#fff", borderRadius: 6, textDecoration: "none" }}
      >
        Mint grant
      </Link>
      {rotatedToken && (
        <div style={{ marginTop: 16, padding: 12, background: "#f5f5f5", borderRadius: 6 }}>
          <strong>New token (one-time)</strong>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{rotatedToken}</pre>
          <pre style={{ fontSize: 12, overflow: "auto", marginTop: 8 }}>{mcpSnippet(rotatedToken, spaceId)}</pre>
        </div>
      )}
      {grants.length === 0 ? (
        <p style={{ marginTop: 24, color: "#666" }}>No grants yet — mint one for your agent.</p>
      ) : (
        <ul style={{ marginTop: 24, padding: 0, listStyle: "none" }}>
          {grants.map((g) => {
            const acl = (g.capability_acl as string[] | undefined) ?? [];
            return (
              <li
                key={String(g.grant_id)}
                style={{ marginBottom: 12, padding: 12, border: "1px solid #e5e5e5", borderRadius: 6 }}
              >
                <div>
                  <strong>{String(g.label)}</strong>
                  <span style={{ color: "#888", marginLeft: 8 }}>{String(g.status)}</span>
                </div>
                <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
                  Harness: {String(g.harness ?? "—")}
                </div>
                <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
                  Scopes: {(g.scopes as string[])?.join(", ") ?? "—"}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Capability ACL:{" "}
                  {acl.length > 0 ? (
                    acl.map((id) => (
                      <code key={id} style={{ marginRight: 6 }}>
                        {id}
                      </code>
                    ))
                  ) : (
                    <span style={{ color: "#b45309" }}>none — no capability MCP tools</span>
                  )}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button onClick={() => void rotate(String(g.grant_id))}>Rotate token</button>
                  <button
                    onClick={() =>
                      client?.grants.revoke(spaceId, String(g.grant_id)).then(() => void reload())
                    }
                  >
                    Revoke
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ShellLayout>
  );
}

export function GrantMintWizard({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [label, setLabel] = useState("Dev Cursor agent");
  const [harness, setHarness] = useState("cursor-local");
  const [template, setTemplate] = useState("worker");
  const [capabilityAcl, setCapabilityAcl] = useState<string[]>([]);
  const [mintedToken, setMintedToken] = useState("");
  const [error, setError] = useState("");

  async function mint() {
    if (!client) return;
    setError("");
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (template === "worker" && capabilityAcl.length === 0) {
      setError("Select at least one capability for a worker grant.");
      return;
    }
    try {
      const result = await client.grants.mint(spaceId, {
        label: label.trim(),
        harness,
        template,
        capability_acl: capabilityAcl,
        expires_in_days: 90,
      });
      setMintedToken((result as { token: string }).token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mint failed");
    }
  }

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Mint grant</h1>
      <p style={{ color: "#666" }}>
        <Link to={`/configure/spaces/${spaceId}/grants`}>← Back to grants</Link>
      </p>
      <ScopeDenialBanner error={error} />
      <label>
        Label
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ display: "block", width: 360, marginBottom: 8, marginTop: 4 }}
        />
      </label>
      <label>
        Harness
        <input
          value={harness}
          onChange={(e) => setHarness(e.target.value)}
          style={{ display: "block", width: 360, marginBottom: 8, marginTop: 4 }}
        />
      </label>
      <label>
        Template
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          style={{ display: "block", marginBottom: 12, marginTop: 4 }}
        >
          <option value="worker">Worker (agent MCP)</option>
          <option value="admin">Admin (setup / install)</option>
        </select>
      </label>
      <CapabilityAclPicker spaceId={spaceId} selected={capabilityAcl} onChange={setCapabilityAcl} />
      <button onClick={() => void mint()} disabled={!client}>
        Mint grant
      </button>
      {mintedToken && (
        <div style={{ marginTop: 16, padding: 12, background: "#f5f5f5", borderRadius: 6 }}>
          <strong>One-time token</strong>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{mintedToken}</pre>
          <p style={{ fontSize: 12, color: "#666" }}>Copy now — this token is not stored in plaintext.</p>
          <strong style={{ display: "block", marginTop: 12 }}>MCP config snippet</strong>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{mcpSnippet(mintedToken, spaceId)}</pre>
          <p style={{ fontSize: 12, color: "#666" }}>
            Reload MCP in Cursor after updating <code>MURRMURE_HUB_TOKEN</code>.
          </p>
        </div>
      )}
    </ShellLayout>
  );
}
