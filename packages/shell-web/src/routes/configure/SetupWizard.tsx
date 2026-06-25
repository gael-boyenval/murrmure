import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShellLayout } from "../../ShellLayout.js";
import { getStoredHubUrl, isBundledShell, setActiveSpaceId, useClient } from "../../hooks.js";
import { getStorageItem, setStorageItem } from "../../storage.js";
import { ScopeDenialBanner } from "./ScopeDenialBanner.js";

const STEPS = [
  "Connect",
  "Create spaces",
  "Push flow (FDK)",
  "Validate & test",
  "Agent access",
  "Invite team",
  "Verify",
];

export function SetupWizard() {
  const client = useClient();
  const navigate = useNavigate();
  const bundled = isBundledShell();
  const [step, setStep] = useState(0);
  const [hubUrl, setHubUrl] = useState(getStoredHubUrl());
  const [token, setToken] = useState(getStorageItem("murrmure_token") ?? "");
  const [sandboxId, setSandboxId] = useState("");
  const [productionId, setProductionId] = useState("");
  const [installId, setInstallId] = useState("");
  const [workerToken, setWorkerToken] = useState("");
  const [error, setError] = useState("");

  async function next() {
    setError("");
    try {
      if (step === 0) {
        setStorageItem("murrmure_hub_url", bundled ? window.location.origin : hubUrl);
        setStorageItem("murrmure_token", token);
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
        const installs = (await client.flows.list(
          sandboxId || "spc_ui_sandbox",
        )) as Array<{ install_id: string }>;
        const latest = installs.at(-1);
        if (latest) setInstallId(latest.install_id);
      }

      if (step === 3) {
        const sid = sandboxId || "spc_ui_sandbox";
        await client.flows.validate(sid, installId || undefined);
        await client.flows.test(sid, installId || undefined);
      }

      if (step === 4) {
        const sid = sandboxId || "spc_ui_sandbox";
        const installs = (await client.flows.list(sid)) as Array<{ flow_id: string; evolution_state: string }>;
        const liveFlows = [...new Set(
          installs.filter((i) => i.evolution_state === "live").map((i) => i.flow_id),
        )];
        const flow_acl = liveFlows.length > 0
          ? liveFlows
          : [...new Set(installs.map((i) => i.flow_id))];
        const grant = await client.grants.mint(sid, {
          label: "Dev Cursor — ui-sandbox worker",
          harness: "cursor-local",
          template: "worker",
          flow_acl,
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
        setStorageItem("murrmure_setup_complete", "1");
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
          {!bundled && (
            <label>
              Hub URL
              <input value={hubUrl} onChange={(e) => setHubUrl(e.target.value)} style={{ display: "block", width: 360, marginBottom: 8 }} />
            </label>
          )}
          <label>
            Bootstrap token
            <input value={token} onChange={(e) => setToken(e.target.value)} style={{ display: "block", width: 360 }} />
          </label>
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: 12 }}>
          <p>Author a flow in your repo and push it to the sandbox with the FDK:</p>
          <ol>
            <li><code>mrmr flow init my-flow --from-example review-loop</code></li>
            <li><code>mrmr flow validate .</code> → <code>build .</code> → <code>mrmr flow push --space {sandboxId || "spc_ui_sandbox"}</code></li>
          </ol>
          <p>Continue once your flow has been pushed — the latest install will be picked up.</p>
        </div>
      )}
      {step === 4 && workerToken && (
        <div style={{ marginTop: 12, padding: 12, background: "#f5f5f5", borderRadius: 6 }}>
          <strong>MCP snippet</strong>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{`{\n  "mcpServers": {\n    "murrmure": {\n      "command": "murrmure",\n      "args": ["mcp"],\n      "env": {\n        "MURRMURE_HUB_URL": "${bundled ? window.location.origin : hubUrl}",\n        "MURRMURE_HUB_TOKEN": "${workerToken}",\n        "MURRMURE_SPACE_ID": "${sandboxId || "spc_ui_sandbox"}"\n      }\n    }\n  }\n}`}</pre>
        </div>
      )}

      {step === 6 && <p>Setup complete — open the runtime view to verify review workflow.</p>}

      <button onClick={() => void next()} style={{ marginTop: 20, padding: "8px 16px" }}>
        {step === 6 ? "Open runtime" : "Continue"}
      </button>
    </ShellLayout>
  );
}
