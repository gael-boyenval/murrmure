import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { useClient, setActiveSpaceId } from "../../hooks.js";
import { ScopeDenialBanner } from "./ScopeDenialBanner.js";

const STEPS = [
  "Connect",
  "Create spaces",
  "Push capability (CDK)",
  "Validate & test",
  "Agent access",
  "Invite team",
  "Verify",
];

export function SetupWizard() {
  const client = useClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [hubUrl, setHubUrl] = useState(localStorage.getItem("studio_hub_url") ?? "http://127.0.0.1:8787");
  const [token, setToken] = useState(localStorage.getItem("studio_token") ?? "");
  const [sandboxId, setSandboxId] = useState("");
  const [productionId, setProductionId] = useState("");
  const [installId, setInstallId] = useState("");
  const [workerToken, setWorkerToken] = useState("");
  const [error, setError] = useState("");

  async function next() {
    setError("");
    try {
      if (step === 0) {
        localStorage.setItem("studio_hub_url", hubUrl);
        localStorage.setItem("studio_token", token);
        window.location.reload();
        return;
      }
      if (!client) throw new Error("Not connected");

      if (step === 1) {
        const sandbox = await client.spaces.create({
          slug: "ui-sandbox",
          name: "UI Sandbox",
          install_policy: "authorized_agents",
          preview_policy: "same_origin_only",
        });
        const production = await client.spaces.create({
          slug: "ui-production",
          name: "UI Production",
          install_policy: "human_only",
          preview_policy: "same_origin_only",
        });
        setSandboxId((sandbox as { space_id: string }).space_id);
        setProductionId((production as { space_id: string }).space_id);
        setActiveSpaceId((sandbox as { space_id: string }).space_id);
      }

      if (step === 2) {
        // CDK-only: capabilities arrive via `studio capability push`, not a bundled
        // catalog. Pick up the most recent pushed install in the sandbox, if any.
        const installs = (await client.capabilities.list(
          sandboxId || "spc_ui_sandbox",
        )) as Array<{ install_id: string }>;
        const latest = installs.at(-1);
        if (latest) setInstallId(latest.install_id);
      }

      if (step === 3) {
        const sid = sandboxId || "spc_ui_sandbox";
        await client.capabilities.validate(sid, installId || undefined);
        await client.capabilities.test(sid, installId || undefined);
      }

      if (step === 4) {
        const sid = sandboxId || "spc_ui_sandbox";
        const installs = (await client.capabilities.list(sid)) as Array<{ package_id: string; evolution_state: string }>;
        const livePackages = [...new Set(
          installs.filter((i) => i.evolution_state === "live").map((i) => i.package_id),
        )];
        const capability_acl = livePackages.length > 0
          ? livePackages
          : [...new Set(installs.map((i) => i.package_id))];
        const grant = await client.grants.mint(sid, {
          label: "Dev Cursor — ui-sandbox worker",
          harness: "cursor-local",
          template: "worker",
          capability_acl,
          expires_in_days: 90,
        });
        setWorkerToken((grant as { token: string }).token);
      }

      if (step === 5) {
        const sid = sandboxId || "spc_ui_sandbox";
        await client.members.invite(sid, { email: "priya@loopcraft.com", role: "editor" });
        await client.members.invite(sid, { email: "maya@loopcraft.com", role: "viewer" });
      }

      if (step === 6) {
        localStorage.setItem("studio_setup_complete", "1");
        navigate(`/spaces/${sandboxId || "spc_ui_sandbox"}`);
        return;
      }

      setStep(step + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Step failed");
    }
  }

  return (
    <ShellLayout mode="configure">
      <h1>First-run setup</h1>
      <ScopeDenialBanner error={error} />
      <ol>
        {STEPS.map((title, i) => (
          <li key={title} style={{ fontWeight: i === step ? 700 : 400, color: i === step ? "#111" : "#888" }}>
            {title}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div style={{ marginTop: 16 }}>
          <label>
            Hub URL
            <input value={hubUrl} onChange={(e) => setHubUrl(e.target.value)} style={{ display: "block", width: 360, marginBottom: 8 }} />
          </label>
          <label>
            Bootstrap token
            <input value={token} onChange={(e) => setToken(e.target.value)} style={{ display: "block", width: 360 }} />
          </label>
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: 12 }}>
          <p>Author a capability in your repo and push it to the sandbox with the CDK:</p>
          <ol>
            <li><code>studio capability init my-flow --from-example review-loop</code></li>
            <li><code>studio capability validate .</code> → <code>build .</code> → <code>push --space {sandboxId || "spc_ui_sandbox"}</code></li>
          </ol>
          <p>Continue once your capability has been pushed — the latest install will be picked up.</p>
        </div>
      )}
      {step === 4 && workerToken && (
        <div style={{ marginTop: 12, padding: 12, background: "#f5f5f5", borderRadius: 6 }}>
          <strong>MCP snippet</strong>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{`{\n  "mcpServers": {\n    "murrmure": {\n      "command": "murrmure",\n      "args": ["mcp"],\n      "env": {\n        "MURRMURE_HUB_URL": "${hubUrl}",\n        "MURRMURE_HUB_TOKEN": "${workerToken}",\n        "MURRMURE_SPACE_ID": "${sandboxId || "spc_ui_sandbox"}"\n      }\n    }\n  }\n}`}</pre>
        </div>
      )}

      {step === 6 && <p>Setup complete — open the runtime view to verify review workflow.</p>}

      <button onClick={() => void next()} style={{ marginTop: 20, padding: "8px 16px" }}>
        {step === 6 ? "Open runtime" : "Continue"}
      </button>
    </ShellLayout>
  );
}
