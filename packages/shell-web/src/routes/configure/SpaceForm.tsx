import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient, setActiveSpaceId } from "../../hooks.js";
import { ScopeDenialBanner } from "./ScopeDenialBanner.js";

export function SpaceForm() {
  const client = useClient();
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [installPolicy, setInstallPolicy] = useState("human_only");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError("");
    if (!client) {
      setError("Not connected — save your hub URL and token on /connect first.");
      return;
    }
    const trimmedSlug = slug.trim();
    const trimmedName = name.trim();
    if (!trimmedSlug) {
      setError("Slug is required.");
      return;
    }
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const space = await client.spaces.create({
        slug: trimmedSlug,
        name: trimmedName,
        install_policy: installPolicy,
        preview_policy: "same_origin_only",
      });
      navigate(`/configure/spaces/${(space as { space_id: string }).space_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create space");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ShellLayout mode="configure">
      <h1>Create space</h1>
      <ScopeDenialBanner error={error} />
      {!client && (
        <p style={{ marginBottom: 16 }}>
          <Link to="/connect">Connect to your hub</Link> before creating a space.
        </p>
      )}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: 320, marginBottom: 8 }} />
      </label>
      <label>
        Slug
        <input value={slug} onChange={(e) => setSlug(e.target.value)} style={{ display: "block", width: 320, marginBottom: 8 }} />
      </label>
      <label>
        Install policy
        <select value={installPolicy} onChange={(e) => setInstallPolicy(e.target.value)} style={{ display: "block", marginBottom: 12 }}>
          <option value="human_only">Human only</option>
          <option value="authorized_agents">Authorized agents</option>
          <option value="allow_list">Allow list</option>
        </select>
      </label>
      <button onClick={() => void submit()} disabled={submitting}>
        {submitting ? "Creating…" : "Create"}
      </button>
    </ShellLayout>
  );
}

export function SpaceSettings({ spaceId }: { spaceId: string }) {
  const client = useClient();
  const [space, setSpace] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    setActiveSpaceId(spaceId);
    if (!client) return;
    void client.spaces.get(spaceId).then((s) => setSpace(s as Record<string, unknown>));
  }, [client, spaceId]);

  return (
    <ShellLayout mode="configure" spaceId={spaceId}>
      <h1>Space settings</h1>
      {space && (
        <>
          <p><strong>{String(space.name ?? space.slug)}</strong> — {String(space.space_id)}</p>
          <p>Install policy: {String(space.install_policy)}</p>
          <p>Preview policy: {String(space.preview_policy)}</p>
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link to={`/configure/spaces/${spaceId}/flows`}>Flows</Link>
            <Link to={`/configure/spaces/${spaceId}/grants`}>Agent grants</Link>
            <Link to={`/configure/spaces/${spaceId}/triggers`}>Triggers</Link>
            <Link to={`/configure/spaces/${spaceId}/members`}>Members</Link>
          </div>
        </>
      )}
    </ShellLayout>
  );
}
