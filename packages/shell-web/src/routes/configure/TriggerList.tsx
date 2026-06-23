import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient } from "../../hooks.js";

export function TriggerList({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [triggers, setTriggers] = useState<Array<Record<string, unknown>>>([]);
  const [deliveries, setDeliveries] = useState<Array<Record<string, unknown>>>([]);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!client) return;
    void client.triggers.list(spaceId).then((t) => setTriggers(t as typeof triggers));
  }, [client, spaceId]);

  async function openLog() {
    if (!client) return;
    const d = await client.triggers.deliveries(spaceId, { limit: 20 });
    setDeliveries(d as typeof deliveries);
    setShowLog(true);
  }

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Triggers</h1>
      <Link to={`/configure/spaces/${spaceId}/triggers/new`}>Register trigger</Link>
      <button onClick={() => void openLog()} style={{ marginLeft: 12 }}>Delivery log</button>
      <ul style={{ marginTop: 16 }}>
        {triggers.map((t) => (
          <li key={String(t.trigger_id)}>
            {String(t.name)} — {t.enabled ? "enabled" : "disabled"}
          </li>
        ))}
      </ul>
      {showLog && (
        <section style={{ marginTop: 24, padding: 12, border: "1px solid #eee", borderRadius: 6 }}>
          <h3>Delivery log</h3>
          {deliveries.length === 0 && <p>No deliveries yet.</p>}
          <ul>
            {deliveries.map((d) => (
              <li key={String(d.delivery_id)}>
                {String(d.outcome)}
                {d.dedup_reason ? ` (${String(d.dedup_reason)})` : ""}
                {d.fingerprint ? ` — ${String(d.fingerprint)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </ShellLayout>
  );
}

export function TriggerRegisterForm({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [templateId, setTemplateId] = useState("spec-published-wake-dev");
  const [sourceSpaceId, setSourceSpaceId] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!client) return;
    void client.triggers.templates(spaceId).then((t) => setTemplates(t as typeof templates));
    void client.triggers.eventCatalog(spaceId).then((e) => setEvents(e as typeof events));
    void client.spaces.list().then((spaces) => {
      const backend = spaces.find((s) => s.slug.includes("backend") || s.slug.includes("product-specs"));
      if (backend) setSourceSpaceId(backend.space_id);
    });
  }, [client, spaceId]);

  async function registerFromTemplate() {
    if (!client || !sourceSpaceId) return;
    await client.triggers.registerFromTemplate(spaceId, {
      template_id: templateId,
      source_space_id: sourceSpaceId,
      target_space_id: spaceId,
      name: name || undefined,
    });
    window.location.href = `/configure/spaces/${spaceId}/triggers`;
  }

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Register trigger</h1>

      <section style={{ marginBottom: 24 }}>
        <h3>From template</h3>
        <label>
          Template
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={{ display: "block", marginBottom: 8 }}
          >
            {templates.map((t) => (
              <option key={String(t.template_id)} value={String(t.template_id)}>
                {String(t.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source space ID
          <input
            value={sourceSpaceId}
            onChange={(e) => setSourceSpaceId(e.target.value)}
            style={{ display: "block", width: 360, marginBottom: 8 }}
          />
        </label>
        <label>
          Name (optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: "block", width: 360, marginBottom: 8 }}
          />
        </label>
        <button onClick={() => void registerFromTemplate()}>Register from template</button>
      </section>

      <section>
        <h3>Event catalog</h3>
        <ul>
          {events.map((e) => (
            <li key={String(e.type)}>
              {String(e.type)}
              {e.package_id ? ` (${String(e.package_id)})` : " (custom)"}
            </li>
          ))}
        </ul>
      </section>
    </ShellLayout>
  );
}

export function MemberList({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");

  useEffect(() => {
    if (!client) return;
    void client.members.list(spaceId).then((m) => setMembers(m as typeof members));
  }, [client, spaceId]);

  async function invite() {
    if (!client || !email) return;
    await client.members.invite(spaceId, { email, role });
    void client.members.list(spaceId).then((m) => setMembers(m as typeof members));
    setEmail("");
  }

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Members</h1>
      <ul>
        {members.map((m) => (
          <li key={String(m.member_id)}>{String(m.email)} — {String(m.role)}</li>
        ))}
      </ul>
      <div style={{ marginTop: 16 }}>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button onClick={() => void invite()}>Invite</button>
      </div>
    </ShellLayout>
  );
}
