export function formatStatusHuman(data: Record<string, unknown>): string {
  const flows = data.flows as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(flows)) {
    if (flows.length === 0) {
      return "No indexed flows — run `mrmr space apply` after authoring .mrmr/flows/";
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
  const variant = typeof data.variant === "string" ? data.variant : "agent";
  if (data.command === "version") {
    return `murrmure ${variant} skill v${data.version ?? "?"}\n  Path: ${data.install_path ?? "—"}`;
  }
  if (data.command === "update") {
    const installed = Array.isArray(data.installed)
      ? data.installed
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const row = entry as { variant?: unknown; version?: unknown; path?: unknown };
            return `  - ${String(row.variant ?? "?")}: v${String(row.version ?? "?")} (${String(row.path ?? "—")})`;
          })
          .filter((line): line is string => Boolean(line))
      : [];
    const details = installed.length > 0 ? `\n${installed.join("\n")}` : `\n  ${data.path ?? ""}`;
    return `✓ Updated murrmure ${variant} skill variant${details}`;
  }
  const installed = Array.isArray(data.installed)
    ? data.installed
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as { variant?: unknown; version?: unknown; path?: unknown };
          return `  - ${String(row.variant ?? "?")}: v${String(row.version ?? "?")} (${String(row.path ?? "—")})`;
        })
        .filter((line): line is string => Boolean(line))
    : [];
  if (installed.length > 0) {
    return `✓ Installed murrmure ${variant} skill variant\n${installed.join("\n")}`;
  }
  return `✓ Installed murrmure ${variant} skill to ${data.path ?? "—"} (v${data.version ?? "?"})`;
}
