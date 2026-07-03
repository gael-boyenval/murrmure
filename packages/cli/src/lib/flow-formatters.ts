export function formatStatusHuman(data: Record<string, unknown>): string {
  const flows = data.flows as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(flows)) {
    if (flows.length === 0) {
      return "No indexed flows — run `mrmr space apply` after authoring murrmure/flows/";
    }
    return flows
      .map((flow) => {
        const id = String(flow.flow_id ?? flow.id ?? "—");
        const digest = String(flow.manifest_digest ?? flow.digest ?? "—");
        return `${id}  digest=${digest}`;
      })
      .join("\n");
  }

  const flowId = data.flow_id ?? data.id;
  if (flowId) {
    const digest = String(data.manifest_digest ?? data.digest ?? "—");
    return [`Flow:   ${flowId}`, `Digest: ${digest}`].join("\n");
  }

  if (!data.ok) {
    return `✗ ${data.message ?? "Flow status unavailable"}`;
  }

  return "No indexed flow state — run `mrmr space apply`";
}

export function formatSkillHuman(data: Record<string, unknown>): string {
  if (!data.ok) {
    return `✗ ${data.message ?? "Skill command failed"}`;
  }
  if (data.command === "version") {
    return `murrmure skill v${data.version ?? "?"}\n  Path: ${data.install_path ?? "—"}`;
  }
  if (data.command === "update") {
    return `✓ Updated murrmure skill to v${data.version ?? "?"}\n  ${data.path ?? ""}`;
  }
  return `✓ Installed murrmure skill to ${data.path ?? "—"} (v${data.version ?? "?"})`;
}
